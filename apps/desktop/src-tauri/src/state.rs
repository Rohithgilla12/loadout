use crate::error::{AppError, Result};
use crate::model::*;
use std::fs;
use std::path::{Path, PathBuf};

/// All Loadout state lives under this root (~/.loadout by default,
/// LOADOUT_HOME overrides it — used by tests).
pub fn loadout_root() -> PathBuf {
    if let Ok(p) = std::env::var("LOADOUT_HOME") {
        return PathBuf::from(p);
    }
    crate::agents::home_dir().join(".loadout")
}

pub fn store_dir() -> PathBuf {
    loadout_root().join("store")
}

pub fn profiles_dir() -> PathBuf {
    loadout_root().join("profiles")
}

fn lock_path() -> PathBuf {
    loadout_root().join("lock.json")
}

fn projects_path() -> PathBuf {
    loadout_root().join("projects.json")
}

fn settings_path() -> PathBuf {
    loadout_root().join("settings.json")
}

pub fn journal_path() -> PathBuf {
    loadout_root().join("journal.json")
}

pub fn ensure_dirs() -> Result<()> {
    fs::create_dir_all(store_dir().join("local"))?;
    fs::create_dir_all(profiles_dir())?;
    Ok(())
}

fn read_json_or_default<T: Default + serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(value)?)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn load_lock() -> Result<LockFile> {
    read_json_or_default(&lock_path())
}

pub fn save_lock(lock: &LockFile) -> Result<()> {
    write_json(&lock_path(), lock)
}

pub fn load_projects() -> Result<ProjectsFile> {
    read_json_or_default(&projects_path())
}

pub fn save_projects(p: &ProjectsFile) -> Result<()> {
    write_json(&projects_path(), p)
}

pub fn load_settings() -> Result<Settings> {
    read_json_or_default(&settings_path())
}

pub fn save_settings(s: &Settings) -> Result<()> {
    write_json(&settings_path(), s)
}

pub fn validate_name(name: &str) -> Result<()> {
    let ok = !name.is_empty()
        && name.len() <= 100
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok {
        Ok(())
    } else {
        Err(AppError::Invalid(format!(
            "invalid name '{name}': use letters, digits, '-', '_', '.'"
        )))
    }
}

pub fn list_profiles() -> Result<Vec<Profile>> {
    let dir = profiles_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            match serde_json::from_str::<Profile>(&fs::read_to_string(&path)?) {
                Ok(p) => out.push(p),
                Err(_) => continue, // tolerate a corrupt profile file rather than break the app
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn load_profile(name: &str) -> Result<Profile> {
    validate_name(name)?;
    let path = profiles_dir().join(format!("{name}.json"));
    if !path.exists() {
        return Err(AppError::NotFound(format!("profile '{name}'")));
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

pub fn save_profile(profile: &Profile) -> Result<()> {
    validate_name(&profile.name)?;
    if let Some(parent) = &profile.extends {
        if parent == &profile.name {
            return Err(AppError::Invalid("a profile cannot extend itself".into()));
        }
        // single-level composition in v1: the parent must not itself extend anything
        let parent_profile = load_profile(parent)?;
        if parent_profile.extends.is_some() {
            return Err(AppError::Invalid(format!(
                "'{parent}' already extends another profile; only single-level extends is supported"
            )));
        }
    }
    write_json(&profiles_dir().join(format!("{}.json", profile.name)), profile)
}

pub fn delete_profile(name: &str) -> Result<()> {
    validate_name(name)?;
    let path = profiles_dir().join(format!("{name}.json"));
    if path.exists() {
        fs::remove_file(path)?;
    }
    // clear references
    let mut settings = load_settings()?;
    if settings.base_profile.as_deref() == Some(name) {
        settings.base_profile = None;
        save_settings(&settings)?;
    }
    let mut projects = load_projects()?;
    let mut changed = false;
    for p in &mut projects.projects {
        if p.profile.as_deref() == Some(name) {
            p.profile = None;
            changed = true;
        }
    }
    if changed {
        save_projects(&projects)?;
    }
    Ok(())
}

/// Resolve a profile to its full ordered skill list (extends expanded, deduped).
pub fn resolve_profile_skills(name: &str) -> Result<Vec<String>> {
    let profile = load_profile(name)?;
    let mut skills: Vec<String> = vec![];
    if let Some(parent) = &profile.extends {
        if let Ok(parent_profile) = load_profile(parent) {
            skills.extend(parent_profile.skills);
        }
    }
    for s in profile.skills {
        if !skills.contains(&s) {
            skills.push(s);
        }
    }
    Ok(skills)
}

/// base ∪ project (project wins on name collision — same name simply dedupes).
pub fn effective_skills(base: Option<&str>, project: Option<&str>) -> Result<Vec<(String, String)>> {
    let mut out: Vec<(String, String)> = vec![]; // (skill, origin)
    if let Some(p) = project {
        for s in resolve_profile_skills(p)? {
            out.push((s, "project".into()));
        }
    }
    if let Some(b) = base {
        for s in resolve_profile_skills(b)? {
            if !out.iter().any(|(name, _)| name == &s) {
                out.push((s, "base".into()));
            }
        }
    }
    Ok(out)
}
