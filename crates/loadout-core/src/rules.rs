//! Auto-activation rules — direnv for skills. Detect what a project is made
//! of from cheap top-level markers, then suggest matching profiles by name.
//! Suggest-first by design: nothing switches without the user accepting,
//! unless a project explicitly opted into `auto`.

use crate::error::Result;
use crate::model::Profile;
use crate::state;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct StackSignal {
    /// Stable tag a profile name can match: "typescript", "go", "rust", …
    pub tag: String,
    /// What we saw, e.g. "go.mod"
    pub evidence: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Suggestion {
    pub profile: String,
    pub tag: String,
    pub evidence: String,
}

/// Cheap, top-level-only stack detection. Ordered most-specific first so the
/// first suggestion is the best one.
pub fn detect_stack(project: &Path) -> Vec<StackSignal> {
    let mut out: Vec<StackSignal> = vec![];
    let mut push = |tag: &str, evidence: String| {
        if !out.iter().any(|s| s.tag == tag) {
            out.push(StackSignal { tag: tag.into(), evidence });
        }
    };

    // node family: read package.json once for the specific frameworks
    let pkg = std::fs::read_to_string(project.join("package.json")).ok();
    if let Some(pkg) = &pkg {
        let has_dep = |name: &str| {
            serde_json::from_str::<serde_json::Value>(pkg)
                .ok()
                .map(|v| {
                    ["dependencies", "devDependencies"]
                        .iter()
                        .any(|k| v.get(k).and_then(|d| d.get(name)).is_some())
                })
                .unwrap_or(false)
        };
        if has_dep("next") {
            push("nextjs", "next in package.json".into());
        }
        if has_dep("react") {
            push("react", "react in package.json".into());
        }
        if project.join("tsconfig.json").is_file() || has_dep("typescript") {
            push("typescript", "tsconfig.json / typescript dep".into());
        }
        push("javascript", "package.json".into());
    }

    let file_markers: &[(&str, &str)] = &[
        ("go.mod", "go"),
        ("Cargo.toml", "rust"),
        ("pyproject.toml", "python"),
        ("requirements.txt", "python"),
        ("Gemfile", "ruby"),
        ("pom.xml", "java"),
        ("build.gradle", "java"),
        ("build.gradle.kts", "java"),
        ("Dockerfile", "docker"),
        ("docker-compose.yml", "docker"),
        ("compose.yaml", "docker"),
        ("main.tf", "terraform"),
    ];
    for (file, tag) in file_markers {
        if project.join(file).is_file() {
            push(tag, (*file).into());
        }
    }
    let dir_markers: &[(&str, &str)] = &[("src-tauri", "tauri"), (".terraform", "terraform")];
    for (dir, tag) in dir_markers {
        if project.join(dir).is_dir() {
            push(tag, format!("{dir}/"));
        }
    }
    out
}

/// Match detected tags against existing profile names. A profile matches a
/// tag when its (lowercased) name equals or contains the tag — `typescript`,
/// `ts-web`… no, `typescript-web` matches "typescript"; nothing fuzzier.
/// Deterministic on purpose: you can always predict what will be suggested.
pub fn suggest(signals: &[StackSignal], profiles: &[Profile]) -> Vec<Suggestion> {
    let mut out: Vec<Suggestion> = vec![];
    for sig in signals {
        for p in profiles {
            let name = p.name.to_lowercase();
            if (name == sig.tag || name.contains(&sig.tag))
                && !out.iter().any(|s| s.profile == p.name)
            {
                out.push(Suggestion {
                    profile: p.name.clone(),
                    tag: sig.tag.clone(),
                    evidence: sig.evidence.clone(),
                });
            }
        }
    }
    out
}

/// Suggestions for one project path against the saved profiles.
pub fn suggestions_for(project: &Path) -> Result<Vec<Suggestion>> {
    let profiles = state::list_profiles()?;
    Ok(suggest(&detect_stack(project), &profiles))
}

/// Auto-assign for every project that opted in (`auto: true`) and has no
/// profile yet. Returns (project path, assigned profile) pairs; the caller
/// re-applies. Never overrides an explicit assignment — auto fills blanks,
/// it doesn't fight the user.
pub fn auto_assign_unassigned() -> Result<Vec<(String, String)>> {
    let mut projects = state::load_projects()?;
    let profiles = state::list_profiles()?;
    let mut assigned = vec![];
    for p in &mut projects.projects {
        if !p.auto || p.profile.is_some() {
            continue;
        }
        let path = Path::new(&p.path);
        if !path.is_dir() {
            continue;
        }
        if let Some(s) = suggest(&detect_stack(path), &profiles).into_iter().next() {
            p.profile = Some(s.profile.clone());
            assigned.push((p.path.clone(), s.profile));
        }
    }
    if !assigned.is_empty() {
        state::save_projects(&projects)?;
    }
    Ok(assigned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn profile(name: &str) -> Profile {
        Profile { name: name.into(), extends: None, skills: vec![] }
    }

    #[test]
    fn detects_node_family_and_specifics() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(
            tmp.path().join("package.json"),
            r#"{"dependencies":{"react":"^19"},"devDependencies":{"typescript":"^5"}}"#,
        )
        .unwrap();
        let tags: Vec<String> = detect_stack(tmp.path()).into_iter().map(|s| s.tag).collect();
        assert_eq!(tags, vec!["react", "typescript", "javascript"]);
    }

    #[test]
    fn detects_go_rust_docker() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("go.mod"), "module x").unwrap();
        fs::write(tmp.path().join("Dockerfile"), "FROM scratch").unwrap();
        let tags: Vec<String> = detect_stack(tmp.path()).into_iter().map(|s| s.tag).collect();
        assert_eq!(tags, vec!["go", "docker"]);
    }

    #[test]
    fn suggests_by_exact_then_substring_name() {
        let signals = vec![StackSignal { tag: "typescript".into(), evidence: "tsconfig.json".into() }];
        let profiles = vec![profile("go"), profile("typescript-web"), profile("typescript")];
        let got = suggest(&signals, &profiles);
        let names: Vec<&str> = got.iter().map(|s| s.profile.as_str()).collect();
        // both match, ordered by profile list order; no duplicates
        assert_eq!(names, vec!["typescript-web", "typescript"]);
    }

    #[test]
    fn no_match_no_suggestion() {
        let signals = vec![StackSignal { tag: "go".into(), evidence: "go.mod".into() }];
        assert!(suggest(&signals, &[profile("frontend")]).is_empty());
    }
}
