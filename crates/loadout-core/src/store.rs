use crate::error::{AppError, Result};
use crate::model::*;
use crate::state;
use std::fs;
use std::path::{Path, PathBuf};

/// Parse YAML frontmatter from SKILL.md content. Tolerant: missing fields
/// fall back to the directory name / empty description.
pub fn parse_frontmatter(content: &str, fallback_name: &str) -> SkillMeta {
    let mut name = fallback_name.to_string();
    let mut description = String::new();
    if let Some(rest) = content.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let yaml = &rest[..end];
            if let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(yaml) {
                if let Some(n) = value.get("name").and_then(|v| v.as_str()) {
                    name = n.to_string();
                }
                if let Some(d) = value.get("description").and_then(|v| v.as_str()) {
                    description = d.to_string();
                }
            }
        }
    }
    SkillMeta { name, description }
}

/// Where a skill named `name` lives in the store, per the lockfile entry.
pub fn skill_store_path(entry: &LockEntry) -> PathBuf {
    if entry.source == "local" {
        state::store_dir().join("local").join(&entry.name)
    } else {
        state::store_dir()
            .join(&entry.source)
            .join(entry.rev.as_deref().unwrap_or("unknown"))
            .join(&entry.name)
    }
}

pub fn read_skill_meta(skill_dir: &Path) -> Option<SkillMeta> {
    let md = skill_dir.join("SKILL.md");
    let content = fs::read_to_string(md).ok()?;
    let fallback = skill_dir.file_name()?.to_string_lossy().to_string();
    Some(parse_frontmatter(&content, &fallback))
}

#[cfg(unix)]
fn is_executable(meta: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    meta.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_meta: &fs::Metadata) -> bool {
    false
}

const SCRIPT_EXTENSIONS: &[&str] = &["sh", "bash", "zsh", "py", "rb", "js", "ts", "mjs", "ps1", "command"];

/// List every file in a skill directory, flagging anything runnable.
pub fn list_skill_files(skill_dir: &Path) -> Result<Vec<SkillFile>> {
    let mut out = vec![];
    for entry in walkdir::WalkDir::new(skill_dir).follow_links(false) {
        let entry = entry.map_err(|e| AppError::Io(e.into()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let meta = entry.metadata().map_err(|e| AppError::Io(e.into()))?;
        let rel = entry
            .path()
            .strip_prefix(skill_dir)
            .unwrap_or(entry.path())
            .to_string_lossy()
            .to_string();
        let ext_is_script = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| SCRIPT_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false);
        out.push(SkillFile {
            path: rel,
            size: meta.len(),
            executable: is_executable(&meta) || ext_is_script,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Copy a skill directory into the store at the location dictated by `entry`.
/// Store content is immutable per (source, rev): if the target already exists
/// it is left alone (content-addressed dedupe).
pub fn copy_into_store(src: &Path, entry: &LockEntry) -> Result<PathBuf> {
    let dest = skill_store_path(entry);
    if dest.exists() {
        return Ok(dest);
    }
    copy_dir(src, &dest)?;
    Ok(dest)
}

pub fn copy_dir(src: &Path, dest: &Path) -> Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), &to)?;
        }
        // symlinks inside skills are intentionally not copied: a skill that
        // links outside its own directory is exactly what we refuse to follow
    }
    Ok(())
}

/// Create a brand-new local skill with a spec-compliant SKILL.md scaffold.
pub fn create_local_skill(name: &str, description: &str) -> Result<LockEntry> {
    state::validate_name(name)?;
    let dir = state::store_dir().join("local").join(name);
    if dir.exists() {
        return Err(AppError::Conflict(format!("local skill '{name}' already exists")));
    }
    fs::create_dir_all(&dir)?;
    let md = format!(
        "---\nname: {name}\ndescription: {description}\n---\n\n# {name}\n\nDescribe what this skill teaches the agent, and when it applies.\n"
    );
    fs::write(dir.join("SKILL.md"), md)?;
    Ok(LockEntry {
        name: name.to_string(),
        source: "local".into(),
        url: None,
        rev: None,
        prev_rev: None,
        repo_path: None,
        track: "pinned".into(),
        description: description.to_string(),
        installed_at: chrono::Utc::now(),
    })
}

/// Remove a skill's store content if no other lock entry references it.
pub fn remove_from_store_if_unreferenced(entry: &LockEntry, lock: &LockFile) -> Result<()> {
    let path = skill_store_path(entry);
    let referenced = lock
        .skills
        .values()
        .any(|other| skill_store_path(other) == path);
    if !referenced && path.exists() {
        fs::remove_dir_all(&path)?;
    }
    Ok(())
}
