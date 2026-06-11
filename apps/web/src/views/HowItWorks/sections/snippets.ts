// Verbatim quotes from crates/loadout-core/src — keep in sync by copying,
// not paraphrasing. Each constant names its origin.

/** apply.rs: is_loadout_owned — the single ownership rule. */
export const SNIPPET_OWNERSHIP = `/// True if \`entry_path\` is a symlink Loadout owns (its target resolves into the store).
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
}`;

/** apply.rs: reconcile_dir — both passes. */
export const SNIPPET_RECONCILE = `/// Reconcile one agent skills directory to contain exactly one Loadout-owned
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
}`;

/** store.rs: copy_into_store — immutable per (source, rev). */
export const SNIPPET_STORE = `/// Copy a skill directory into the store at the location dictated by \`entry\`.
/// Store content is immutable per (source, rev): if the target already exists
/// it is left alone (content-addressed dedupe).
pub fn copy_into_store(src: &Path, entry: &LockEntry) -> Result<PathBuf> {
    let dest = skill_store_path(entry);
    if dest.exists() {
        return Ok(dest);
    }
    copy_dir(src, &dest)?;
    Ok(dest)
}`;

/** apply.rs: the crash-safety journal — write-ahead in apply_scope + recover_if_needed. */
export const SNIPPET_JOURNAL = `// crash-safety journal: record intent before mutating anything
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

// …later, on every launch:
/// On launch: if a journal exists a previous apply crashed mid-flight.
/// Reconciliation is idempotent, so recovery = re-apply everything.
pub fn recover_if_needed() -> Result<bool> {
    if !state::journal_path().exists() {
        return Ok(false);
    }
    reapply_all()?;
    fs::remove_file(state::journal_path()).ok();
    Ok(true)
}`;

/** apply.rs tests: never_clobbers_foreign_name_collision. */
export const SNIPPET_CLOBBER_TEST = `#[test]
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
}`;
