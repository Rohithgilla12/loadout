use crate::agents;
use crate::error::{AppError, Result};
use crate::model::*;
use crate::state;
use crate::store;
use std::fs;
use std::path::{Path, PathBuf};

/// Extracts the store target path if `entry_path` is owned by Loadout (symlink or copy-mode).
fn get_loadout_target(entry_path: &Path) -> Option<PathBuf> {
    if let Ok(meta) = fs::symlink_metadata(entry_path) {
        if meta.file_type().is_symlink() {
            if let Ok(target) = fs::read_link(entry_path) {
                let absolute = if target.is_absolute() {
                    target
                } else {
                    entry_path.parent().map(|p| p.join(&target)).unwrap_or(target)
                };
                if normalize(&absolute).starts_with(normalize(&state::store_dir())) {
                    return Some(absolute);
                }
            }
        }
    }
    if entry_path.is_dir() {
        let marker = entry_path.join(".loadout-managed");
        if marker.is_file() {
            if let Ok(target_str) = fs::read_to_string(&marker) {
                let target = PathBuf::from(target_str);
                if normalize(&target).starts_with(normalize(&state::store_dir())) {
                    return Some(target);
                }
            }
        }
    }
    None
}

/// True if `entry_path` is a symlink or copy-mode directory Loadout owns (its target resolves into the store).
fn is_loadout_owned(entry_path: &Path) -> bool {
    get_loadout_target(entry_path).is_some()
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
    // 1. Try directory symlink (needs Developer Mode or elevation)
    if std::os::windows::fs::symlink_dir(target, link).is_ok() {
        return Ok(());
    }
    // 2. Try NTFS Junction (no elevation needed)
    if junction::create(target, link).is_ok() {
        return Ok(());
    }
    // 3. Fallback to copy-mode
    crate::store::copy_dir(target, link)?;
    fs::write(link.join(".loadout-managed"), target.to_string_lossy().to_string())?;
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
        let current_target = get_loadout_target(&path);
        match wanted {
            Some((_, store_path)) if current_target.as_deref() == Some(store_path.as_path()) => {}
            _ => {
                if fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false) {
                    fs::remove_file(&path)?;
                } else {
                    fs::remove_dir_all(&path)?;
                }
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

/// Skills materialized at project scope: the project profile only. Base-profile
/// skills live in the global agent dirs, which agents already merge with project
/// dirs — duplicating them into the repo would pollute it with symlinks.
pub fn project_scope_skills(profile: Option<&str>) -> Result<Vec<String>> {
    match profile {
        Some(p) => state::resolve_profile_skills(p),
        None => Ok(vec![]),
    }
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
        let names = project_scope_skills(project.profile.as_deref())?;
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
    let lock = state::load_lock()?;
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
                    already_adopted: lock.skills.contains_key(&name),
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

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct MigrateSummary {
    pub adopted: u32,
    pub replaced: u32,
    pub skipped: Vec<String>,
    pub profile: String,
    pub backup_path: Option<String>,
}

/// Tar the given directories (paths relative to `base`) into `dest`.
/// Symlinks are preserved as symlinks — a faithful restore point.
pub fn backup_dirs(base: &Path, rel_dirs: &[String], dest: &Path) -> Result<()> {
    if rel_dirs.is_empty() {
        return Err(AppError::Invalid("nothing to back up".into()));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut cmd = std::process::Command::new("tar");
    cmd.arg("-czf").arg(dest).arg("-C").arg(base);
    for d in rel_dirs {
        cmd.arg(d);
    }
    let out = cmd
        .output()
        .map_err(|e| AppError::Invalid(format!("backup failed to run tar: {e}")))?;
    if !out.status.success() || !dest.is_file() {
        return Err(AppError::Invalid(format!(
            "backup failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(())
}

/// One-shot onboarding migration: bulk-import foreign skills into the store,
/// collect them into a profile (set as base so future re-applies keep them
/// live), and optionally replace the originals with managed symlinks.
///
/// The same skill typically appears several times — symlinked from multiple
/// agent dirs — so entries are deduped by canonical path first. Originals are
/// only removed when `replace` is set AND the store copy is verified to match
/// byte-for-byte on SKILL.md.
pub fn migrate_entries(
    entries: &[ForeignSkill],
    replace: bool,
    profile_name: &str,
    on_progress: Option<&dyn Fn(u32, u32, &str)>,
) -> Result<MigrateSummary> {
    state::validate_name(profile_name)?;
    let mut summary = MigrateSummary {
        profile: profile_name.to_string(),
        ..Default::default()
    };
    let mut lock = state::load_lock()?;

    // canonical content dir -> every agent-dir entry that resolves to it
    let mut groups: std::collections::BTreeMap<PathBuf, Vec<&ForeignSkill>> = Default::default();
    for e in entries {
        match fs::canonicalize(&e.dir) {
            Ok(c) => groups.entry(c).or_default().push(e),
            Err(_) => summary.skipped.push(format!("{}: unreadable", e.dir)),
        }
    }

    let mut profile_names: Vec<String> = vec![];
    let total = groups.len() as u32;
    for (i, (canonical, group)) in groups.iter().enumerate() {
        let name = group[0].name.clone();
        if let Some(f) = on_progress {
            f(i as u32 + 1, total, &name);
        }
        if state::validate_name(&name).is_err() {
            summary.skipped.push(format!("{name}: invalid skill name"));
            continue;
        }
        let src_md = match fs::read(canonical.join("SKILL.md")) {
            Ok(b) => b,
            Err(_) => {
                summary.skipped.push(format!("{name}: no SKILL.md, not a skill"));
                continue;
            }
        };

        let store_path = if let Some(existing) = lock.skills.get(&name) {
            store::skill_store_path(existing)
        } else {
            let meta = store::read_skill_meta(canonical);
            let entry = LockEntry {
                name: name.clone(),
                source: "local".into(),
                url: None,
                rev: None,
                prev_rev: None,
                repo_path: None,
                track: "pinned".into(),
                description: meta.map(|m| m.description).unwrap_or_default(),
                installed_at: chrono::Utc::now(),
            };
            let dest = store::skill_store_path(&entry);
            if !dest.exists() {
                store::copy_dir(canonical, &dest)?;
            }
            if !dest.join("SKILL.md").is_file() {
                summary.skipped.push(format!("{name}: store copy failed"));
                continue;
            }
            lock.skills.insert(name.clone(), entry.clone());
            summary.adopted += 1;
            dest
        };
        profile_names.push(name.clone());

        if replace {
            // only take over an original whose content provably matches the store
            let content_matches = fs::read(store_path.join("SKILL.md"))
                .map(|b| b == src_md)
                .unwrap_or(false);
            if !content_matches {
                summary
                    .skipped
                    .push(format!("{name}: different content already in library, original left in place"));
                continue;
            }
            for e in group {
                if e.name != name {
                    summary
                        .skipped
                        .push(format!("{}: alias under a different name, left in place", e.dir));
                    continue;
                }
                let p = PathBuf::from(&e.dir);
                let Ok(meta) = fs::symlink_metadata(&p) else { continue };
                if meta.file_type().is_symlink() {
                    fs::remove_file(&p)?;
                } else {
                    fs::remove_dir_all(&p)?;
                }
                summary.replaced += 1;
            }
        }
    }
    state::save_lock(&lock)?;

    // the profile is what guarantees these skills survive every future re-apply
    let mut profile = state::load_profile(profile_name).unwrap_or(Profile {
        name: profile_name.to_string(),
        extends: None,
        skills: vec![],
    });
    for n in profile_names {
        if !profile.skills.contains(&n) {
            profile.skills.push(n);
        }
    }
    state::save_profile(&profile)?;
    let mut settings = state::load_settings()?;
    settings.base_profile = Some(profile_name.to_string());
    state::save_settings(&settings)?;
    Ok(summary)
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
    fn backup_preserves_dirs_and_symlinks() {
        let _ctx = setup();
        let base = state::loadout_root().join("fake-home");
        fs::create_dir_all(base.join(".claude/skills/my-skill")).unwrap();
        fs::write(base.join(".claude/skills/my-skill/SKILL.md"), "content").unwrap();
        std::os::unix::fs::symlink("my-skill", base.join(".claude/skills/alias")).unwrap();

        let dest = state::loadout_root().join("backups/test.tar.gz");
        backup_dirs(&base, &[".claude/skills".into()], &dest).unwrap();
        assert!(dest.is_file());

        let listing = std::process::Command::new("tar")
            .args(["-tzf", &dest.to_string_lossy()])
            .output()
            .unwrap();
        let listing = String::from_utf8_lossy(&listing.stdout);
        assert!(listing.contains(".claude/skills/my-skill/SKILL.md"));
        assert!(listing.contains(".claude/skills/alias"));
    }

    #[test]
    fn migrate_dedupes_and_replaces() {
        let _ctx = setup();
        // a "real" skill dir in one agent, symlinked from another — the
        // exact shape of an npx-skills install
        let agents_dir = state::loadout_root().join("fake-agents-skills");
        let claude_dir = state::loadout_root().join("fake-claude-skills");
        fs::create_dir_all(agents_dir.join("my-skill")).unwrap();
        fs::create_dir_all(&claude_dir).unwrap();
        fs::write(
            agents_dir.join("my-skill/SKILL.md"),
            "---\nname: my-skill\ndescription: d\n---\nbody",
        )
        .unwrap();
        std::os::unix::fs::symlink(agents_dir.join("my-skill"), claude_dir.join("my-skill")).unwrap();

        let entry = |dir: &std::path::Path, link: bool| ForeignSkill {
            agent_id: "x".into(),
            scope: "global".into(),
            dir: dir.to_string_lossy().to_string(),
            name: "my-skill".into(),
            is_symlink: link,
            description: None,
            already_adopted: false,
        };
        let entries = vec![
            entry(&claude_dir.join("my-skill"), true),
            entry(&agents_dir.join("my-skill"), false),
        ];

        let summary = migrate_entries(&entries, true, "everything", None).unwrap();
        assert_eq!(summary.adopted, 1, "two paths, one canonical skill");
        assert_eq!(summary.replaced, 2, "both originals taken over");

        // store has the content, lock and profile know it, base is set
        let store_copy = state::store_dir().join("local/my-skill/SKILL.md");
        assert!(store_copy.is_file());
        assert!(state::load_lock().unwrap().skills.contains_key("my-skill"));
        let profile = state::load_profile("everything").unwrap();
        assert_eq!(profile.skills, vec!["my-skill"]);
        assert_eq!(
            state::load_settings().unwrap().base_profile.as_deref(),
            Some("everything")
        );
        // originals gone (reapply would now lay down managed symlinks)
        assert!(!claude_dir.join("my-skill").exists());
        assert!(!agents_dir.join("my-skill").exists());

        // idempotent: nothing left to adopt, nothing double-counted
        let summary2 = migrate_entries(&[], true, "everything", None).unwrap();
        assert_eq!((summary2.adopted, summary2.replaced), (0, 0));
    }

    #[test]
    fn project_scope_excludes_base_profile() {
        let _ctx = setup();
        state::save_profile(&Profile {
            name: "base".into(),
            extends: None,
            skills: vec!["alpha".into(), "beta".into()],
        })
        .unwrap();
        state::save_profile(&Profile {
            name: "proj".into(),
            extends: None,
            skills: vec!["gamma".into()],
        })
        .unwrap();
        let mut settings = state::load_settings().unwrap();
        settings.base_profile = Some("base".into());
        state::save_settings(&settings).unwrap();

        // base skills live in global agent dirs; project dirs get the project profile only
        assert_eq!(project_scope_skills(Some("proj")).unwrap(), vec!["gamma".to_string()]);
        assert!(project_scope_skills(None).unwrap().is_empty());
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
