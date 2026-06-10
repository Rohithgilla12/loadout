//! loadout — switch AI-agent skill profiles from the command line.
//!
//! The same engine as the desktop app (loadout-core): profiles in
//! ~/.loadout/profiles, content-addressed store, symlink reconciliation.
//! Exit codes: 0 ok · 1 drift or unhealthy (check/doctor) · 2 error.

use clap::{Parser, Subcommand};
use loadout_core::error::{AppError, Result};
use loadout_core::model::*;
use loadout_core::{agents, apply, state, store};
use std::path::{Path, PathBuf};

#[derive(Parser)]
#[command(name = "loadout", version, about = "Switchable skill sets for AI coding agents")]
struct Cli {
    /// Emit machine-readable JSON instead of text
    #[arg(long, global = true)]
    json: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show detected agents, base profile, and counts
    Status,
    /// List profiles (the active base profile is marked with *)
    List,
    /// List installed skills from the lockfile
    Skills,
    /// Set the base profile and re-apply everywhere
    Switch {
        /// Profile name, or "none" to clear the base profile
        profile: String,
        /// Assign to a registered project instead of the base
        #[arg(long)]
        project: Option<PathBuf>,
    },
    /// Re-apply symlinks (base profile globally + every project)
    Apply {
        /// Re-apply a single registered project only
        #[arg(long)]
        project: Option<PathBuf>,
    },
    /// Verify a repo's loadout.json against this machine (CI-friendly)
    Check {
        /// Project directory containing loadout.json (default: .)
        path: Option<PathBuf>,
    },
    /// Health report: foreign skills, broken store entries, missing projects
    Doctor,
}

fn main() {
    let cli = Cli::parse();
    let code = match run(&cli) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("error: {e}");
            2
        }
    };
    std::process::exit(code);
}

fn run(cli: &Cli) -> Result<i32> {
    state::ensure_dirs()?;
    match &cli.command {
        Command::Status => status(cli.json),
        Command::List => list(cli.json),
        Command::Skills => skills(cli.json),
        Command::Switch { profile, project } => switch(profile, project.as_deref(), cli.json),
        Command::Apply { project } => apply_cmd(project.as_deref(), cli.json),
        Command::Check { path } => check(path.as_deref().unwrap_or(Path::new(".")), cli.json),
        Command::Doctor => doctor(cli.json),
    }
}

fn print_summaries(summaries: &[ApplySummary]) {
    let added: u32 = summaries.iter().map(|s| s.added).sum();
    let removed: u32 = summaries.iter().map(|s| s.removed).sum();
    let unchanged: u32 = summaries.iter().map(|s| s.unchanged).sum();
    println!("applied: +{added} -{removed} ={unchanged}");
    for s in summaries {
        for c in &s.skipped_conflicts {
            println!("  skipped: {c}");
        }
    }
}

fn status(json: bool) -> Result<i32> {
    let settings = state::load_settings()?;
    let detected = agents::detected_global_agents();
    let lock = state::load_lock()?;
    let profiles = state::list_profiles()?;
    let projects = state::load_projects()?;
    if json {
        println!(
            "{}",
            serde_json::json!({
                "loadout_root": state::loadout_root(),
                "base_profile": settings.base_profile,
                "agents": detected.iter().map(|a| &a.id).collect::<Vec<_>>(),
                "skills": lock.skills.len(),
                "profiles": profiles.len(),
                "projects": projects.projects.len(),
            })
        );
        return Ok(0);
    }
    println!("root      {}", state::loadout_root().display());
    println!("base      {}", settings.base_profile.as_deref().unwrap_or("(none)"));
    println!(
        "agents    {}",
        detected.iter().map(|a| a.display_name.as_str()).collect::<Vec<_>>().join(", ")
    );
    println!(
        "library   {} skills · {} profiles · {} projects",
        lock.skills.len(),
        profiles.len(),
        projects.projects.len()
    );
    Ok(0)
}

fn list(json: bool) -> Result<i32> {
    let settings = state::load_settings()?;
    let profiles = state::list_profiles()?;
    if json {
        println!("{}", serde_json::to_string_pretty(&profiles)?);
        return Ok(0);
    }
    if profiles.is_empty() {
        println!("no profiles yet — create one in the app or with the desktop UI");
        return Ok(0);
    }
    for p in &profiles {
        let marker = if settings.base_profile.as_deref() == Some(p.name.as_str()) { "*" } else { " " };
        let extends = p.extends.as_deref().map(|e| format!(" (extends {e})")).unwrap_or_default();
        println!("{marker} {:<24} {:>3} skills{extends}", p.name, p.skills.len());
    }
    Ok(0)
}

fn skills(json: bool) -> Result<i32> {
    let lock = state::load_lock()?;
    if json {
        println!("{}", serde_json::to_string_pretty(&lock.skills)?);
        return Ok(0);
    }
    for (name, e) in &lock.skills {
        let rev = e.rev.as_deref().map(|r| &r[..r.len().min(7)]).unwrap_or("local");
        println!("{name:<32} {rev:<8} {}", e.source);
    }
    Ok(0)
}

fn switch(profile: &str, project: Option<&Path>, json: bool) -> Result<i32> {
    let name = (profile != "none").then(|| profile.to_string());
    if let Some(n) = &name {
        state::load_profile(n)?; // must exist
    }
    match project {
        None => {
            let mut settings = state::load_settings()?;
            settings.base_profile = name.clone();
            state::save_settings(&settings)?;
            let summaries = apply::reapply_all()?;
            if json {
                println!("{}", serde_json::to_string_pretty(&summaries)?);
            } else {
                println!("base profile → {}", name.as_deref().unwrap_or("(none)"));
                print_summaries(&summaries);
            }
        }
        Some(path) => {
            let path = canonical_project(path)?;
            let mut projects = state::load_projects()?;
            let proj = projects
                .projects
                .iter_mut()
                .find(|p| p.path == path)
                .ok_or_else(|| AppError::NotFound(format!("project not registered: {path}")))?;
            proj.profile = name.clone();
            state::save_projects(&projects)?;
            let skills = apply::project_scope_skills(name.as_deref())?;
            let summary = apply::apply_scope(&skills, Some(Path::new(&path)))?;
            if json {
                println!("{}", serde_json::to_string_pretty(&summary)?);
            } else {
                println!("{path} → {}", name.as_deref().unwrap_or("(none)"));
                print_summaries(std::slice::from_ref(&summary));
            }
        }
    }
    Ok(0)
}

fn apply_cmd(project: Option<&Path>, json: bool) -> Result<i32> {
    match project {
        None => {
            let summaries = apply::reapply_all()?;
            if json {
                println!("{}", serde_json::to_string_pretty(&summaries)?);
            } else {
                print_summaries(&summaries);
            }
        }
        Some(path) => {
            let path = canonical_project(path)?;
            let projects = state::load_projects()?;
            let proj = projects
                .projects
                .iter()
                .find(|p| p.path == path)
                .ok_or_else(|| AppError::NotFound(format!("project not registered: {path}")))?;
            let skills = apply::project_scope_skills(proj.profile.as_deref())?;
            let summary = apply::apply_scope(&skills, Some(Path::new(&path)))?;
            if json {
                println!("{}", serde_json::to_string_pretty(&summary)?);
            } else {
                print_summaries(std::slice::from_ref(&summary));
            }
        }
    }
    Ok(0)
}

fn canonical_project(path: &Path) -> Result<String> {
    let canon = std::fs::canonicalize(path)
        .map_err(|_| AppError::NotFound(format!("no such directory: {}", path.display())))?;
    Ok(canon.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct CheckFinding {
    level: String, // "ok" | "warn" | "drift"
    message: String,
}

/// Drift detection between a repo's loadout.json and this machine.
/// Structural checks (file valid, vendored content present) always run, so
/// `loadout check` is useful in CI even without ~/.loadout state.
fn check(dir: &Path, json: bool) -> Result<i32> {
    let file_path = dir.join("loadout.json");
    if !file_path.is_file() {
        return Err(AppError::NotFound(format!("{} (run from a repo with a loadout.json)", file_path.display())));
    }
    let file: LoadoutFile = serde_json::from_str(&std::fs::read_to_string(&file_path)?)?;
    let mut findings: Vec<CheckFinding> = vec![];
    let mut push = |level: &str, message: String| {
        findings.push(CheckFinding { level: level.into(), message });
    };

    // structural: vendored skills must travel with the repo
    for s in &file.skills {
        if s.source == "local" {
            match &s.vendored {
                Some(rel) if dir.join(rel).join("SKILL.md").is_file() => {
                    push("ok", format!("{}: vendored content present", s.skill));
                }
                Some(rel) => push("drift", format!("{}: vendored path {rel} missing SKILL.md", s.skill)),
                None => push("drift", format!("{}: local skill with no vendored path", s.skill)),
            }
        }
    }

    // machine state: lockfile + materialized symlinks (skipped when no state, e.g. CI)
    let lock = state::load_lock()?;
    if lock.skills.is_empty() {
        push("warn", "no local loadout state — structural checks only".into());
    } else {
        for s in &file.skills {
            match lock.skills.get(&s.skill) {
                None => push("drift", format!("{}: not installed on this machine", s.skill)),
                Some(entry) => match (&s.rev, &entry.rev) {
                    (Some(want), Some(have)) if want != have => push(
                        "drift",
                        format!("{}: rev {} declared, {} installed", s.skill, &want[..7.min(want.len())], &have[..7.min(have.len())]),
                    ),
                    _ => push("ok", format!("{}: installed", s.skill)),
                },
            }
        }
        // is the declared profile actually assigned & materialized here?
        let canon = canonical_project(dir)?;
        let projects = state::load_projects()?;
        match projects.projects.iter().find(|p| p.path == canon) {
            None => push("warn", "project not registered in Loadout on this machine".into()),
            Some(proj) => {
                if proj.profile.as_deref() != Some(file.profile.as_str()) {
                    push(
                        "drift",
                        format!(
                            "assigned profile is {}, loadout.json declares {}",
                            proj.profile.as_deref().unwrap_or("(none)"),
                            file.profile
                        ),
                    );
                }
                for agent in agents::detected_project_agents(Path::new(&canon)) {
                    let skills_dir = agents::project_skills_dir(&agent, Path::new(&canon));
                    for s in &file.skills {
                        let link = skills_dir.join(&s.skill);
                        let lock_entry = lock.skills.get(&s.skill);
                        let healthy = lock_entry.is_some_and(|e| {
                            link.is_symlink() && store::skill_store_path(e).join("SKILL.md").is_file()
                        });
                        if !healthy && lock_entry.is_some() {
                            push("drift", format!("{}: not materialized in {}", s.skill, skills_dir.display()));
                        }
                    }
                }
            }
        }
    }

    let drift = findings.iter().filter(|f| f.level == "drift").count();
    if json {
        println!(
            "{}",
            serde_json::json!({ "profile": file.profile, "findings": findings, "drift": drift })
        );
    } else {
        println!("loadout.json declares profile '{}' with {} skills", file.profile, file.skills.len());
        for f in &findings {
            let tag = match f.level.as_str() {
                "drift" => "✗",
                "warn" => "!",
                _ => "✓",
            };
            println!("  {tag} {}", f.message);
        }
        println!(
            "{}",
            if drift == 0 { "in sync" } else { "DRIFT detected" }
        );
    }
    Ok(if drift == 0 { 0 } else { 1 })
}

#[derive(serde::Serialize)]
struct DoctorOut {
    recovered_journal: bool,
    broken_store: Vec<String>,
    missing_projects: Vec<String>,
    foreign: Vec<ForeignSkill>,
}

fn doctor(json: bool) -> Result<i32> {
    let recovered = apply::recover_if_needed()?;
    let lock = state::load_lock()?;
    let broken_store: Vec<String> = lock
        .skills
        .values()
        .filter(|e| !store::skill_store_path(e).join("SKILL.md").is_file())
        .map(|e| e.name.clone())
        .collect();
    let missing_projects: Vec<String> = state::load_projects()?
        .projects
        .iter()
        .filter(|p| !PathBuf::from(&p.path).is_dir())
        .map(|p| p.path.clone())
        .collect();
    let foreign = apply::scan_foreign()?;
    let unhealthy = !broken_store.is_empty() || !missing_projects.is_empty();

    if json {
        let out = DoctorOut { recovered_journal: recovered, broken_store, missing_projects, foreign };
        println!("{}", serde_json::to_string_pretty(&out)?);
        return Ok(if unhealthy { 1 } else { 0 });
    }
    if recovered {
        println!("! recovered from an interrupted apply (journal replayed)");
    }
    for b in &broken_store {
        println!("✗ store content missing: {b}");
    }
    for m in &missing_projects {
        println!("✗ project directory gone: {m}");
    }
    let unmanaged = foreign.iter().filter(|f| !f.already_adopted).count();
    println!(
        "{} foreign skill entries ({} not yet in the library)",
        foreign.len(),
        unmanaged
    );
    println!("{}", if unhealthy { "issues found" } else { "healthy" });
    Ok(if unhealthy { 1 } else { 0 })
}
