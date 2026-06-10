use crate::agents;
use crate::error::{AppError, Result};
use crate::model::*;
use crate::state;
use crate::store;
use std::fs;
use std::path::{Path, PathBuf};

/// True if `entry_path` is a symlink Loadout owns (its target resolves into the store).
fn is_loadout_owned(entry_path: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(entry_path) else {
        return false;
    };
    if !meta.file_type().is_symlink() {
        return false;
    }
    let Ok(target) = fs::read_link(entry_path) else {
        return false;
    };
    let absolute = if target.is_absolute() {
        target
    } else {
        entry_path.parent().map(|p| p.join(&target)).unwrap_or(target)
    };
    // Compare lexically against the store root; the target may be a broken
    // link (store pruned), which we still own and must be able to clean up.
    normalize(&absolute).starts_with(normalize(&state::store_dir()))
}

/// Lexical path normalization (no fs access, works on broken links).
fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

#[cfg(unix)]
fn make_symlink(target: &Path, link: &Path) -> Result<()> {
    std::os::unix::fs::symlink(target, link)?;
    Ok(())
}

#[cfg(windows)]
fn make_symlink(target: &Path, link: &Path) -> Result<()> {
    // Windows: directory symlink needs Developer Mode; junction fallback is a
    // post-v1 concern (documented). Try the symlink and surface the error.
    std::os::windows::fs::symlink_dir(target, link)?;
    Ok(())
}

/// Reconcile one agent skills directory to contain exactly one Loadout-owned
/// symlink per target skill. Foreign entries are never touched.
fn reconcile_dir(
    dir: &Path,
    targets: &[(String, PathBuf)], // (skill name, store path)
    summary: &mut ApplySummary,
) -> Result<()> {
    fs::create_dir_all(dir)?;

    // pass 1: remove loadout-owned links that shouldn't be there (or are stale)
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if !is_loadout_owned(&path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let wanted = targets.iter().find(|(n, _)| *n == name);
        let current_target = fs::read_link(&path).ok();
        match wanted {
            Some((_, store_path)) if current_target.as_deref() == Some(store_path.as_path()) => {}
            _ => {
                fs::remove_file(&path)?;
                if wanted.is_none() {
                    summary.removed += 1;
                }
            }
        }
    }

    // pass 2: create missing links
    for (name, store_path) in targets {
        let link = dir.join(name);
        if !store_path.exists() {
            summary
                .skipped_conflicts
                .push(format!("{name}: store content missing ({})", store_path.display()));
            continue;
        }
        match fs::symlink_metadata(&link) {
            Ok(_) if is_loadout_owned(&link) => {
                summary.unchanged += 1; // correct link already in place (pass 1 removed stale ones)
            }
            Ok(_) => {
                // foreign file/dir/symlink with this name — never clobber
                summary
                    .skipped_conflicts
                    .push(format!("{name}: foreign entry exists in {}", dir.display()));
            }
            Err(_) => {
                make_symlink(store_path, &link)?;
                summary.added += 1;
            }
        }
    }
    Ok(())
}

/// Compute (name, store_path) pairs for a skill list from the lockfile.
fn resolve_targets(skills: &[String], lock: &LockFile) -> (Vec<(String, PathBuf)>, Vec<String>) {
    let mut targets = vec![];
    let mut missing = vec![];
    for name in skills {
        match lock.skills.get(name) {
            Some(entry) => targets.push((name.clone(), store::skill_store_path(entry))),
            None => missing.push(name.clone()),
        }
    }
    (targets, missing)
}

/// Apply a skill set to a scope. scope: None = global agent dirs, Some(path) = project dirs.
pub fn apply_scope(skills: &[String], project: Option<&Path>) -> Result<ApplySummary> {
    let lock = state::load_lock()?;
    let (targets, missing) = resolve_targets(skills, &lock);

    // crash-safety journal: record intent before mutating anything
    let scope_label = project
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "global".into());
    let journal = Journal {
        scope: scope_label,
        skills: skills.to_vec(),
        started_at: chrono::Utc::now(),
    };
    fs::create_dir_all(state::loadout_root())?;
    fs::write(state::journal_path(), serde_json::to_string(&journal)?)?;

    let mut summary = ApplySummary::default();
    for name in missing {
        summary
            .skipped_conflicts
            .push(format!("{name}: not in lockfile (not installed)"));
    }

    let agent_defs = match project {
        Some(p) => agents::detected_project_agents(p),
        None => agents::detected_global_agents(),
    };
    for agent in &agent_defs {
        let dir = match project {
            Some(p) => agents::project_skills_dir(agent, p),
            None => agents::global_skills_dir(agent),
        };
        reconcile_dir(&dir, &targets, &mut summary)?;
        summary.agents.push(agent.display_name.clone());
    }

    fs::remove_file(state::journal_path()).ok();
    Ok(summary)
}

/// Re-apply everything (base profile globally + each project's effective set).
/// Used after installs, updates, removals, and journal recovery.
pub fn reapply_all() -> Result<Vec<ApplySummary>> {
    let settings = state::load_settings()?;
    let projects = state::load_projects()?;
    let mut out = vec![];

    let base_skills: Vec<String> = match settings.base_profile.as_deref() {
        Some(b) => state::resolve_profile_skills(b)?,
        None => vec![],
    };
    out.push(apply_scope(&base_skills, None)?);

    for project in &projects.projects {
        let path = PathBuf::from(&project.path);
        if !path.is_dir() {
            continue; // moved/deleted project: Doctor reports it, apply skips it
        }
        let effective = state::effective_skills(
            settings.base_profile.as_deref(),
            project.profile.as_deref(),
        )?;
        let names: Vec<String> = effective.into_iter().map(|(n, _)| n).collect();
        out.push(apply_scope(&names, Some(&path))?);
    }
    Ok(out)
}

/// On launch: if a journal exists a previous apply crashed mid-flight.
/// Reconciliation is idempotent, so recovery = re-apply everything.
pub fn recover_if_needed() -> Result<bool> {
    if !state::journal_path().exists() {
        return Ok(false);
    }
    reapply_all()?;
    fs::remove_file(state::journal_path()).ok();
    Ok(true)
}

/// Scan agent dirs for entries Loadout doesn't own (foreign skills → adopt candidates).
pub fn scan_foreign() -> Result<Vec<ForeignSkill>> {
    let mut out = vec![];
    let projects = state::load_projects()?;
    let mut scopes: Vec<(String, Option<PathBuf>)> = vec![("global".into(), None)];
    for p in &projects.projects {
        scopes.push((p.path.clone(), Some(PathBuf::from(&p.path))));
    }
    for (label, project) in scopes {
        let agent_defs = match &project {
            Some(p) => agents::detected_project_agents(p),
            None => agents::detected_global_agents(),
        };
        for agent in agent_defs {
            let dir = match &project {
                Some(p) => agents::project_skills_dir(&agent, p),
                None => agents::global_skills_dir(&agent),
            };
            if !dir.is_dir() {
                continue;
            }
            for entry in fs::read_dir(&dir)? {
                let entry = entry?;
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || is_loadout_owned(&path) {
                    continue;
                }
                // only directories (or symlinked directories) can be skills
                if !path.is_dir() {
                    continue;
                }
                let meta = store::read_skill_meta(&path);
                out.push(ForeignSkill {
                    agent_id: agent.id.clone(),
                    scope: label.clone(),
                    dir: path.to_string_lossy().to_string(),
                    name,
                    is_symlink: fs::symlink_metadata(&path)
                        .map(|m| m.file_type().is_symlink())
                        .unwrap_or(false),
                    description: meta.map(|m| m.description),
                });
            }
        }
    }
    Ok(out)
}

/// Import a foreign skill directory into the store as a local skill.
pub fn adopt_foreign(dir: &str) -> Result<LockEntry> {
    let src = PathBuf::from(dir);
    let meta = store::read_skill_meta(&src)
        .ok_or_else(|| AppError::Invalid(format!("{dir} has no readable SKILL.md")))?;
    let name = src
        .file_name()
        .ok_or_else(|| AppError::Invalid("bad path".into()))?
        .to_string_lossy()
        .to_string();
    state::validate_name(&name)?;
    let entry = LockEntry {
        name: name.clone(),
        source: "local".into(),
        url: None,
        rev: None,
        prev_rev: None,
        repo_path: None,
        track: "pinned".into(),
        description: meta.description,
        installed_at: chrono::Utc::now(),
    };
    let dest = store::skill_store_path(&entry);
    if dest.exists() {
        return Err(AppError::Conflict(format!("a local skill named '{name}' already exists")));
    }
    store::copy_dir(&src, &dest)?;
    let mut lock = state::load_lock()?;
    lock.skills.insert(name, entry.clone());
    state::save_lock(&lock)?;
    Ok(entry)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::LockEntry;

    // tests mutate the LOADOUT_HOME env var → must not run concurrently
    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn setup() -> (tempfile::TempDir, std::sync::MutexGuard<'static, ()>) {
        let guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let tmp = tempfile::tempdir().unwrap();
        std::env::set_var("LOADOUT_HOME", tmp.path().join(".loadout"));
        state::ensure_dirs().unwrap();
        (tmp, guard)
    }

    fn install_fake_skill(name: &str) {
        let dir = state::store_dir().join("local").join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: test skill\n---\nbody"),
        )
        .unwrap();
        let mut lock = state::load_lock().unwrap();
        lock.skills.insert(
            name.into(),
            LockEntry {
                name: name.into(),
                source: "local".into(),
                url: None,
                rev: None,
                prev_rev: None,
                repo_path: None,
                track: "pinned".into(),
                description: "test skill".into(),
                installed_at: chrono::Utc::now(),
            },
        );
        state::save_lock(&lock).unwrap();
    }

    #[test]
    fn reconcile_round_trip() {
        let _ctx = setup();
        install_fake_skill("alpha");
        install_fake_skill("beta");
        let agent_dir = state::loadout_root().join("fake-agent-skills");

        // foreign entry that must survive every reconcile
        fs::create_dir_all(agent_dir.join("foreign-skill")).unwrap();

        let lock = state::load_lock().unwrap();
        let (targets, _) = resolve_targets(&["alpha".into(), "beta".into()], &lock);
        let mut summary = ApplySummary::default();
        reconcile_dir(&agent_dir, &targets, &mut summary).unwrap();
        assert_eq!(summary.added, 2);
        assert!(agent_dir.join("alpha").exists());
        assert!(fs::symlink_metadata(agent_dir.join("alpha")).unwrap().file_type().is_symlink());

        // narrow the set to beta only — alpha goes, foreign stays
        let (targets, _) = resolve_targets(&["beta".into()], &lock);
        let mut summary = ApplySummary::default();
        reconcile_dir(&agent_dir, &targets, &mut summary).unwrap();
        assert_eq!(summary.removed, 1);
        assert!(!agent_dir.join("alpha").exists());
        assert!(agent_dir.join("beta").exists());
        assert!(agent_dir.join("foreign-skill").exists());

        // idempotent
        let mut summary = ApplySummary::default();
        reconcile_dir(&agent_dir, &targets, &mut summary).unwrap();
        assert_eq!((summary.added, summary.removed), (0, 0));
        assert_eq!(summary.unchanged, 1);
    }

    #[test]
    fn never_clobbers_foreign_name_collision() {
        let _ctx = setup();
        install_fake_skill("alpha");
        let agent_dir = state::loadout_root().join("fake-agent-skills");
        fs::create_dir_all(agent_dir.join("alpha")).unwrap();
        fs::write(agent_dir.join("alpha/SKILL.md"), "user content").unwrap();

        let lock = state::load_lock().unwrap();
        let (targets, _) = resolve_targets(&["alpha".into()], &lock);
        let mut summary = ApplySummary::default();
        reconcile_dir(&agent_dir, &targets, &mut summary).unwrap();
        assert_eq!(summary.added, 0);
        assert_eq!(summary.skipped_conflicts.len(), 1);
        assert_eq!(
            fs::read_to_string(agent_dir.join("alpha/SKILL.md")).unwrap(),
            "user content"
        );
    }
}
