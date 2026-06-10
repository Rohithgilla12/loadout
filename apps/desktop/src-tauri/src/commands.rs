use crate::error::{AppError, Result};
use crate::model::*;
use crate::{agents, apply, gitops, registry, state, store};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------- library ----------

#[tauri::command]
pub fn list_library() -> Result<Vec<LibrarySkill>> {
    let lock = state::load_lock()?;
    let profiles = state::list_profiles()?;
    let mut out = vec![];
    for entry in lock.skills.values() {
        let in_profiles: Vec<String> = profiles
            .iter()
            .filter(|p| p.skills.contains(&entry.name))
            .map(|p| p.name.clone())
            .collect();
        out.push(LibrarySkill {
            name: entry.name.clone(),
            description: entry.description.clone(),
            source: entry.source.clone(),
            rev: entry.rev.clone(),
            track: entry.track.clone(),
            installed_at: entry.installed_at,
            profiles: in_profiles,
            update_available: None, // filled by check_updates
            can_rollback: entry.prev_rev.is_some(),
        });
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct SkillDetail {
    pub entry: LockEntry,
    pub skill_md: String,
    pub files: Vec<SkillFile>,
    pub store_path: String,
}

#[tauri::command]
pub fn get_skill_detail(name: String) -> Result<SkillDetail> {
    let lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?;
    let dir = store::skill_store_path(entry);
    let skill_md = std::fs::read_to_string(dir.join("SKILL.md")).unwrap_or_default();
    let files = store::list_skill_files(&dir)?;
    Ok(SkillDetail {
        entry: entry.clone(),
        skill_md,
        files,
        store_path: dir.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn remove_skill(name: String) -> Result<Vec<ApplySummary>> {
    let mut lock = state::load_lock()?;
    let entry = lock
        .skills
        .remove(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?;
    state::save_lock(&lock)?;
    // drop it from every profile
    for mut profile in state::list_profiles()? {
        if profile.skills.iter().any(|s| s == &name) {
            profile.skills.retain(|s| s != &name);
            state::save_profile(&profile)?;
        }
    }
    let summaries = apply::reapply_all()?;
    store::remove_from_store_if_unreferenced(&entry, &lock)?;
    Ok(summaries)
}

// ---------- profiles ----------

#[tauri::command]
pub fn list_profiles_cmd() -> Result<Vec<Profile>> {
    state::list_profiles()
}

#[tauri::command]
pub fn save_profile_cmd(profile: Profile) -> Result<()> {
    state::save_profile(&profile)
}

#[tauri::command]
pub fn create_profile(name: String) -> Result<Profile> {
    state::validate_name(&name)?;
    if state::load_profile(&name).is_ok() {
        return Err(AppError::Conflict(format!("profile '{name}' already exists")));
    }
    let p = Profile { name, extends: None, skills: vec![] };
    state::save_profile(&p)?;
    Ok(p)
}

#[tauri::command]
pub fn rename_profile(old: String, new: String) -> Result<()> {
    let mut p = state::load_profile(&old)?;
    state::validate_name(&new)?;
    if state::load_profile(&new).is_ok() {
        return Err(AppError::Conflict(format!("profile '{new}' already exists")));
    }
    p.name = new.clone();
    state::save_profile(&p)?;
    // move references, then delete old file
    let mut settings = state::load_settings()?;
    if settings.base_profile.as_deref() == Some(old.as_str()) {
        settings.base_profile = Some(new.clone());
        state::save_settings(&settings)?;
    }
    let mut projects = state::load_projects()?;
    for proj in &mut projects.projects {
        if proj.profile.as_deref() == Some(old.as_str()) {
            proj.profile = Some(new.clone());
        }
    }
    state::save_projects(&projects)?;
    for mut other in state::list_profiles()? {
        if other.extends.as_deref() == Some(old.as_str()) {
            other.extends = Some(new.clone());
            state::save_profile(&other)?;
        }
    }
    std::fs::remove_file(state::profiles_dir().join(format!("{old}.json"))).ok();
    Ok(())
}

#[tauri::command]
pub fn duplicate_profile(name: String, new_name: String) -> Result<Profile> {
    let mut p = state::load_profile(&name)?;
    state::validate_name(&new_name)?;
    if state::load_profile(&new_name).is_ok() {
        return Err(AppError::Conflict(format!("profile '{new_name}' already exists")));
    }
    p.name = new_name;
    state::save_profile(&p)?;
    Ok(p)
}

#[tauri::command]
pub fn delete_profile_cmd(name: String) -> Result<Vec<ApplySummary>> {
    state::delete_profile(&name)?;
    apply::reapply_all()
}

#[tauri::command]
pub fn set_base_profile(name: Option<String>) -> Result<Vec<ApplySummary>> {
    if let Some(n) = &name {
        state::load_profile(n)?; // must exist
    }
    let mut settings = state::load_settings()?;
    settings.base_profile = name;
    state::save_settings(&settings)?;
    apply::reapply_all()
}

// ---------- projects ----------

#[derive(Serialize)]
pub struct ProjectView {
    #[serde(flatten)]
    pub project: Project,
    pub exists: bool,
    pub agents: Vec<AgentDef>,
    pub effective: Vec<EffectiveSkill>,
    pub has_loadout_json: bool,
}

#[derive(Serialize)]
pub struct EffectiveSkill {
    pub name: String,
    pub origin: String,
    pub installed: bool,
}

fn project_view(project: &Project, settings: &Settings) -> Result<ProjectView> {
    let path = PathBuf::from(&project.path);
    let exists = path.is_dir();
    let lock = state::load_lock()?;
    let effective = state::effective_skills(settings.base_profile.as_deref(), project.profile.as_deref())?
        .into_iter()
        .map(|(name, origin)| EffectiveSkill {
            installed: lock.skills.contains_key(&name),
            name,
            origin,
        })
        .collect();
    Ok(ProjectView {
        project: project.clone(),
        exists,
        agents: if exists { agents::detected_project_agents(&path) } else { vec![] },
        effective,
        has_loadout_json: path.join("loadout.json").is_file(),
    })
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectView>> {
    let settings = state::load_settings()?;
    state::load_projects()?
        .projects
        .iter()
        .map(|p| project_view(p, &settings))
        .collect()
}

#[tauri::command]
pub fn register_project(path: String) -> Result<ProjectView> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(AppError::Invalid(format!("{path} is not a directory")));
    }
    let canonical = dir.canonicalize()?.to_string_lossy().to_string();
    let mut projects = state::load_projects()?;
    if projects.projects.iter().any(|p| p.path == canonical) {
        return Err(AppError::Conflict("project already registered".into()));
    }
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical.clone());
    let project = Project {
        path: canonical,
        name,
        profile: None,
        registered_at: chrono::Utc::now(),
    };
    projects.projects.push(project.clone());
    state::save_projects(&projects)?;
    project_view(&project, &state::load_settings()?)
}

#[tauri::command]
pub fn unregister_project(path: String) -> Result<()> {
    let mut projects = state::load_projects()?;
    projects.projects.retain(|p| p.path != path);
    state::save_projects(&projects)
}

#[tauri::command]
pub fn assign_profile(path: String, profile: Option<String>) -> Result<ApplySummary> {
    if let Some(p) = &profile {
        state::load_profile(p)?;
    }
    let mut projects = state::load_projects()?;
    let project = projects
        .projects
        .iter_mut()
        .find(|p| p.path == path)
        .ok_or_else(|| AppError::NotFound("project not registered".into()))?;
    project.profile = profile;
    let project = project.clone();
    state::save_projects(&projects)?;

    let settings = state::load_settings()?;
    let effective = state::effective_skills(settings.base_profile.as_deref(), project.profile.as_deref())?;
    let names: Vec<String> = effective.into_iter().map(|(n, _)| n).collect();
    apply::apply_scope(&names, Some(&PathBuf::from(&project.path)))
}

#[tauri::command]
pub fn apply_project(path: String) -> Result<ApplySummary> {
    let projects = state::load_projects()?;
    let project = projects
        .projects
        .iter()
        .find(|p| p.path == path)
        .ok_or_else(|| AppError::NotFound("project not registered".into()))?;
    let settings = state::load_settings()?;
    let effective = state::effective_skills(settings.base_profile.as_deref(), project.profile.as_deref())?;
    let names: Vec<String> = effective.into_iter().map(|(n, _)| n).collect();
    apply::apply_scope(&names, Some(&PathBuf::from(&project.path)))
}

// ---------- loadout.json ----------

#[tauri::command]
pub fn read_loadout_file(path: String) -> Result<LoadoutFile> {
    let file = PathBuf::from(&path).join("loadout.json");
    if !file.is_file() {
        return Err(AppError::NotFound("loadout.json".into()));
    }
    Ok(serde_json::from_str(&std::fs::read_to_string(file)?)?)
}

#[tauri::command]
pub fn export_loadout_file(profile: String, dest_dir: String) -> Result<String> {
    let p = state::load_profile(&profile)?;
    let lock = state::load_lock()?;
    let mut skills = vec![];
    for name in state::resolve_profile_skills(&profile)? {
        let Some(entry) = lock.skills.get(&name) else { continue };
        if entry.source == "local" {
            // vendor local skills into the repo so teammates receive them
            let vendor_rel = format!(".loadout/skills/{name}");
            let vendor_abs = PathBuf::from(&dest_dir).join(&vendor_rel);
            store::copy_dir(&store::skill_store_path(entry), &vendor_abs)?;
            skills.push(LoadoutFileSkill {
                source: "local".into(),
                skill: name,
                rev: None,
                vendored: Some(vendor_rel),
            });
        } else {
            skills.push(LoadoutFileSkill {
                source: entry.source.trim_start_matches("github.com/").to_string(),
                skill: name,
                rev: entry.rev.clone(),
                vendored: None,
            });
        }
    }
    let file = LoadoutFile {
        schema: Some("https://loadout.dev/schema/v1.json".into()),
        profile: p.name,
        extends: vec![],
        skills,
    };
    let dest = PathBuf::from(&dest_dir).join("loadout.json");
    std::fs::write(&dest, serde_json::to_string_pretty(&file)?)?;
    Ok(dest.to_string_lossy().to_string())
}

/// Apply a reviewed loadout.json: install everything it declares into a
/// profile named after it, then assign that profile to the project.
/// Only ever called after the explicit review screen (F7/F3).
#[tauri::command]
pub async fn apply_loadout_file(path: String) -> Result<ApplySummary> {
    let file = read_loadout_file(path.clone())?;
    state::validate_name(&file.profile)?;
    let project_dir = PathBuf::from(&path);

    let mut profile = Profile {
        name: file.profile.clone(),
        extends: None,
        skills: vec![],
    };
    for s in &file.skills {
        if s.source == "local" {
            let vendored = s.vendored.as_ref().ok_or_else(|| {
                AppError::Invalid(format!("local skill '{}' has no vendored path", s.skill))
            })?;
            if vendored.contains("..") {
                return Err(AppError::Invalid("path traversal rejected".into()));
            }
            let src = project_dir.join(vendored);
            if !src.join("SKILL.md").is_file() {
                return Err(AppError::Invalid(format!("vendored skill missing at {vendored}")));
            }
            let mut lock = state::load_lock()?;
            if !lock.skills.contains_key(&s.skill) {
                let entry = apply::adopt_foreign(&src.to_string_lossy())?;
                lock.skills.insert(entry.name.clone(), entry);
                state::save_lock(&lock)?;
            }
        } else {
            install_one(&s.source, &s.skill, s.rev.as_deref()).await?;
        }
        profile.skills.push(s.skill.clone());
    }
    state::save_profile(&profile)?;
    assign_profile(path, Some(file.profile))
}

// ---------- install ----------

#[derive(Serialize)]
pub struct ResolvedSource {
    pub source: String,
    pub url: String,
    pub rev: String,
    pub skills: Vec<DiscoveredSkill>,
}

/// Clone a source and return its skills for the picker (F5) + trust panel (F7).
#[tauri::command]
pub async fn resolve_source(input: String) -> Result<ResolvedSource> {
    // local path install
    let as_path = PathBuf::from(&input);
    if as_path.is_dir() {
        let skills = gitops::discover_skills(&as_path)?;
        return Ok(ResolvedSource {
            source: "local".into(),
            url: input,
            rev: String::new(),
            skills,
        });
    }
    let (source, url) = gitops::parse_source(&input)?;
    let (source_c, url_c) = (source.clone(), url.clone());
    let (skills, rev) = tokio::task::spawn_blocking(move || -> Result<(Vec<DiscoveredSkill>, String)> {
        let (tmp, rev) = gitops::shallow_fetch(&url_c, None)?;
        let skills = gitops::discover_skills(tmp.path())?;
        let _ = source_c;
        Ok((skills, rev))
    })
    .await
    .map_err(|e| AppError::Git(e.to_string()))??;
    Ok(ResolvedSource { source, url, rev, skills })
}

async fn install_one(source_input: &str, skill_name: &str, rev: Option<&str>) -> Result<LockEntry> {
    let (source, url) = gitops::parse_source(source_input)?;
    let rev_owned = rev.map(|s| s.to_string());
    let (url_c, skill_c, source_c) = (url.clone(), skill_name.to_string(), source.clone());
    let entry = tokio::task::spawn_blocking(move || -> Result<LockEntry> {
        let (tmp, sha) = gitops::shallow_fetch(&url_c, rev_owned.as_deref())?;
        let skills = gitops::discover_skills(tmp.path())?;
        let found = skills
            .into_iter()
            .find(|s| s.name == skill_c)
            .ok_or_else(|| AppError::NotFound(format!("skill '{skill_c}' in {source_c}")))?;
        let entry = LockEntry {
            name: found.name.clone(),
            source: source_c,
            url: Some(url_c),
            rev: Some(sha),
            prev_rev: None,
            repo_path: Some(found.repo_path.clone()),
            track: "pinned".into(),
            description: found.description.clone(),
            installed_at: chrono::Utc::now(),
        };
        state::validate_name(&entry.name)?;
        store::copy_into_store(&tmp.path().join(&found.repo_path), &entry)?;
        Ok(entry)
    })
    .await
    .map_err(|e| AppError::Git(e.to_string()))??;

    let mut lock = state::load_lock()?;
    // keep an existing entry's history if reinstalling
    if let Some(existing) = lock.skills.get(&entry.name) {
        let mut merged = entry.clone();
        if existing.rev != entry.rev {
            merged.prev_rev = existing.rev.clone();
        } else {
            merged.prev_rev = existing.prev_rev.clone();
        }
        merged.track = existing.track.clone();
        lock.skills.insert(merged.name.clone(), merged.clone());
        state::save_lock(&lock)?;
        return Ok(merged);
    }
    lock.skills.insert(entry.name.clone(), entry.clone());
    state::save_lock(&lock)?;
    Ok(entry)
}

/// Install selected skills from a resolved source, optionally into a profile.
#[tauri::command]
pub async fn install_skills(
    source: String,
    skill_names: Vec<String>,
    rev: Option<String>,
    profile: Option<String>,
) -> Result<Vec<LockEntry>> {
    let mut entries = vec![];
    for name in &skill_names {
        entries.push(install_one(&source, name, rev.as_deref()).await?);
    }
    if let Some(profile_name) = profile {
        let mut p = state::load_profile(&profile_name)?;
        for e in &entries {
            if !p.skills.contains(&e.name) {
                p.skills.push(e.name.clone());
            }
        }
        state::save_profile(&p)?;
        apply::reapply_all()?;
    }
    Ok(entries)
}

// ---------- updates ----------

#[derive(Serialize)]
pub struct UpdateInfo {
    pub name: String,
    pub current: String,
    pub latest: String,
}

#[tauri::command]
pub async fn check_updates() -> Result<Vec<UpdateInfo>> {
    let lock = state::load_lock()?;
    // one ls-remote per distinct source repo
    let mut by_url: std::collections::BTreeMap<String, Vec<String>> = Default::default();
    for entry in lock.skills.values() {
        if let (Some(url), Some(_)) = (&entry.url, &entry.rev) {
            by_url.entry(url.clone()).or_default().push(entry.name.clone());
        }
    }
    let mut out = vec![];
    for (url, names) in by_url {
        let url_c = url.clone();
        let head = tokio::task::spawn_blocking(move || gitops::resolve_head(&url_c))
            .await
            .map_err(|e| AppError::Git(e.to_string()))?;
        let Ok(head) = head else { continue }; // unreachable remote ≠ broken app
        for name in names {
            if let Some(entry) = lock.skills.get(&name) {
                if entry.rev.as_deref() != Some(head.as_str()) {
                    out.push(UpdateInfo {
                        name,
                        current: entry.rev.clone().unwrap_or_default(),
                        latest: head.clone(),
                    });
                }
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn update_skill(name: String, to_rev: String) -> Result<LockEntry> {
    let lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?
        .clone();
    let source = entry.source.clone();
    let updated = install_one(&source, &name, Some(&to_rev)).await?;
    apply::reapply_all()?;
    Ok(updated)
}

#[tauri::command]
pub async fn rollback_skill(name: String) -> Result<LockEntry> {
    let lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?
        .clone();
    let prev = entry
        .prev_rev
        .clone()
        .ok_or_else(|| AppError::Invalid(format!("'{name}' has no previous version recorded")))?;
    let updated = install_one(&entry.source, &name, Some(&prev)).await?;
    apply::reapply_all()?;
    Ok(updated)
}

/// Full unified diff of a skill directory between two revs (for update review).
#[tauri::command]
pub async fn diff_skill(name: String, to_rev: String) -> Result<String> {
    let lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?
        .clone();
    let url = entry
        .url
        .clone()
        .ok_or_else(|| AppError::Invalid("local skills have no upstream diff".into()))?;
    let repo_path = entry.repo_path.clone().unwrap_or_default();
    let from = entry.rev.clone().unwrap_or_default();
    tokio::task::spawn_blocking(move || -> Result<String> {
        let tmp = tempfile::tempdir()?;
        let run = |args: &[&str]| -> Result<String> {
            let out = std::process::Command::new("git")
                .args(args)
                .current_dir(tmp.path())
                .output()
                .map_err(|e| AppError::Git(e.to_string()))?;
            Ok(String::from_utf8_lossy(&out.stdout).to_string())
        };
        run(&["init", "-q"])?;
        run(&["remote", "add", "origin", &url])?;
        run(&["fetch", "-q", "--depth", "1", "origin", &from])?;
        run(&["fetch", "-q", "--depth", "1", "origin", &to_rev])?;
        run(&["diff", &from, &to_rev, "--stat", "--patch", "--", &repo_path])
    })
    .await
    .map_err(|e| AppError::Git(e.to_string()))?
}

#[tauri::command]
pub fn set_track(name: String, track: String) -> Result<()> {
    if track != "pinned" && track != "latest" {
        return Err(AppError::Invalid("track must be 'pinned' or 'latest'".into()));
    }
    let mut lock = state::load_lock()?;
    let entry = lock
        .skills
        .get_mut(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?;
    entry.track = track;
    state::save_lock(&lock)
}

// ---------- local skills / editor ----------

#[tauri::command]
pub fn create_local_skill_cmd(name: String, description: String) -> Result<LockEntry> {
    let entry = store::create_local_skill(&name, &description)?;
    let mut lock = state::load_lock()?;
    lock.skills.insert(entry.name.clone(), entry.clone());
    state::save_lock(&lock)?;
    Ok(entry)
}

#[tauri::command]
pub fn save_skill_file(name: String, rel_path: String, content: String) -> Result<()> {
    if rel_path.contains("..") {
        return Err(AppError::Invalid("path traversal rejected".into()));
    }
    let mut lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?;
    if entry.source != "local" {
        return Err(AppError::Invalid(
            "remote skills are immutable — fork to a local skill to edit".into(),
        ));
    }
    let path = store::skill_store_path(entry).join(&rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, &content)?;
    // keep lockfile description in sync with edited frontmatter
    if rel_path == "SKILL.md" {
        let meta = store::parse_frontmatter(&content, &name);
        if let Some(entry) = lock.skills.get_mut(&name) {
            entry.description = meta.description;
            state::save_lock(&lock)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_skill_file(name: String, rel_path: String) -> Result<String> {
    if rel_path.contains("..") {
        return Err(AppError::Invalid("path traversal rejected".into()));
    }
    let lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?;
    Ok(std::fs::read_to_string(store::skill_store_path(entry).join(rel_path))?)
}

/// Fork a remote skill into an editable local copy.
#[tauri::command]
pub fn fork_skill(name: String, new_name: String) -> Result<LockEntry> {
    state::validate_name(&new_name)?;
    let mut lock = state::load_lock()?;
    let entry = lock
        .skills
        .get(&name)
        .ok_or_else(|| AppError::NotFound(format!("skill '{name}'")))?
        .clone();
    let new_entry = LockEntry {
        name: new_name.clone(),
        source: "local".into(),
        url: None,
        rev: None,
        prev_rev: None,
        repo_path: None,
        track: "pinned".into(),
        description: format!("{} (forked from {})", entry.description, entry.source),
        installed_at: chrono::Utc::now(),
    };
    let dest = store::skill_store_path(&new_entry);
    if dest.exists() {
        return Err(AppError::Conflict(format!("local skill '{new_name}' already exists")));
    }
    store::copy_dir(&store::skill_store_path(&entry), &dest)?;
    lock.skills.insert(new_name, new_entry.clone());
    state::save_lock(&lock)?;
    Ok(new_entry)
}

// ---------- doctor / adopt ----------

#[derive(Serialize)]
pub struct DoctorReport {
    pub foreign: Vec<ForeignSkill>,
    pub missing_projects: Vec<String>,
    pub broken_store: Vec<String>,
    pub recovered_journal: bool,
}

#[tauri::command]
pub fn doctor() -> Result<DoctorReport> {
    let recovered = apply::recover_if_needed()?;
    let lock = state::load_lock()?;
    let broken_store = lock
        .skills
        .values()
        .filter(|e| !store::skill_store_path(e).join("SKILL.md").is_file())
        .map(|e| e.name.clone())
        .collect();
    let missing_projects = state::load_projects()?
        .projects
        .iter()
        .filter(|p| !PathBuf::from(&p.path).is_dir())
        .map(|p| p.path.clone())
        .collect();
    Ok(DoctorReport {
        foreign: apply::scan_foreign()?,
        missing_projects,
        broken_store,
        recovered_journal: recovered,
    })
}

#[tauri::command]
pub fn adopt_skill(dir: String) -> Result<LockEntry> {
    apply::adopt_foreign(&dir)
}

#[tauri::command]
pub fn reapply_all_cmd() -> Result<Vec<ApplySummary>> {
    apply::reapply_all()
}

// ---------- misc ----------

#[derive(Serialize)]
pub struct Overview {
    pub settings: Settings,
    pub agents: Vec<AgentDef>,
    pub skill_count: usize,
    pub profile_count: usize,
    pub project_count: usize,
    pub loadout_root: String,
}

#[tauri::command]
pub fn get_overview() -> Result<Overview> {
    state::ensure_dirs()?;
    Ok(Overview {
        settings: state::load_settings()?,
        agents: agents::detected_global_agents(),
        skill_count: state::load_lock()?.skills.len(),
        profile_count: state::list_profiles()?.len(),
        project_count: state::load_projects()?.projects.len(),
        loadout_root: state::loadout_root().to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn save_settings_cmd(settings: Settings) -> Result<()> {
    state::save_settings(&settings)
}

#[tauri::command]
pub async fn registry_get_cmd(path: String) -> Result<serde_json::Value> {
    registry::registry_get(&path).await
}

#[derive(Deserialize)]
pub struct _Unused;
