use crate::error::{AppError, Result};
use crate::model::*;
use crate::store;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Normalize the many source spellings the CLI accepts into (source_id, git_url).
/// "vercel-labs/agent-skills"            → github.com/vercel-labs/agent-skills
/// "https://github.com/owner/repo(.git)" → github.com/owner/repo
/// "git@github.com:owner/repo.git"       → github.com/owner/repo
/// "https://gitlab.com/group/repo"       → gitlab.com/group/repo
pub fn parse_source(input: &str) -> Result<(String, String)> {
    let input = input.trim().trim_end_matches('/');
    if input.is_empty() {
        return Err(AppError::Invalid("empty source".into()));
    }
    if input.contains("..") {
        return Err(AppError::Invalid("path traversal rejected".into()));
    }
    // scp-style ssh
    if let Some(rest) = input.strip_prefix("git@") {
        let (host, path) = rest
            .split_once(':')
            .ok_or_else(|| AppError::Invalid(format!("cannot parse '{input}'")))?;
        let path = path.trim_end_matches(".git");
        return Ok((format!("{host}/{path}"), format!("git@{host}:{path}.git")));
    }
    if let Some(rest) = input
        .strip_prefix("https://")
        .or_else(|| input.strip_prefix("http://"))
    {
        let rest = rest.trim_end_matches(".git");
        // strip github tree/blob deep links: github.com/o/r/tree/main/skills/x
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() >= 3 {
            let id = format!("{}/{}/{}", parts[0], parts[1], parts[2]);
            return Ok((id.clone(), format!("https://{id}.git")));
        }
        return Err(AppError::Invalid(format!("cannot parse '{input}'")));
    }
    // bare owner/repo → GitHub
    let parts: Vec<&str> = input.split('/').collect();
    if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        let id = format!("github.com/{}/{}", parts[0], parts[1]);
        return Ok((id.clone(), format!("https://{id}.git")));
    }
    // bare host/owner/repo (our own canonical source id, e.g. "github.com/o/r")
    if parts.len() >= 3 && parts[0].contains('.') && parts.iter().all(|p| !p.is_empty()) {
        let id = format!("{}/{}/{}", parts[0], parts[1], parts[2]);
        return Ok((id.clone(), format!("https://{id}.git")));
    }
    Err(AppError::Invalid(format!(
        "cannot parse '{input}': expected owner/repo, a git URL, or a local path"
    )))
}

fn run_git(args: &[&str], cwd: Option<&Path>) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = cmd
        .output()
        .map_err(|e| AppError::Git(format!("failed to run git: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Git(format!(
            "git {} failed: {}",
            args.first().unwrap_or(&""),
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Latest commit SHA of the remote default branch.
pub fn resolve_head(url: &str) -> Result<String> {
    let out = run_git(&["ls-remote", url, "HEAD"], None)?;
    out.split_whitespace()
        .next()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Git(format!("no HEAD found at {url}")))
}

/// Shallow-clone `url` at `rev` (or HEAD) into a temp dir. Returns (dir, resolved sha).
pub fn shallow_fetch(url: &str, rev: Option<&str>) -> Result<(tempfile::TempDir, String)> {
    let tmp = tempfile::tempdir()?;
    match rev {
        Some(sha) => {
            run_git(&["init", "-q"], Some(tmp.path()))?;
            run_git(&["remote", "add", "origin", url], Some(tmp.path()))?;
            run_git(&["fetch", "-q", "--depth", "1", "origin", sha], Some(tmp.path()))?;
            run_git(&["checkout", "-q", "FETCH_HEAD"], Some(tmp.path()))?;
            Ok((tmp, sha.to_string()))
        }
        None => {
            run_git(
                &["clone", "-q", "--depth", "1", url, &tmp.path().to_string_lossy()],
                None,
            )?;
            let sha = run_git(&["rev-parse", "HEAD"], Some(tmp.path()))?
                .trim()
                .to_string();
            Ok((tmp, sha))
        }
    }
}

/// Search locations from the skills CLI spec, in priority order, then a
/// bounded recursive fallback.
const SEARCH_ROOTS: &[&str] = &[
    "skills",
    ".claude/skills",
    ".gemini/skills",
    ".codex/skills",
    ".agents/skills",
    ".",
];

/// Find every skill (dir containing SKILL.md) in a checked-out repo.
pub fn discover_skills(repo: &Path) -> Result<Vec<DiscoveredSkill>> {
    let mut found: Vec<(String, PathBuf)> = vec![]; // (repo-relative path, abs path)
    let mut seen = std::collections::HashSet::new();

    let consider = |abs: &Path, repo: &Path, found: &mut Vec<(String, PathBuf)>, seen: &mut std::collections::HashSet<PathBuf>| {
        if abs.join("SKILL.md").is_file() {
            let canonical = abs.to_path_buf();
            if seen.insert(canonical.clone()) {
                let rel = abs.strip_prefix(repo).unwrap_or(abs).to_string_lossy().to_string();
                found.push((rel, canonical));
            }
        }
    };

    for root in SEARCH_ROOTS {
        let base = repo.join(root);
        if !base.is_dir() {
            continue;
        }
        consider(&base, repo, &mut found, &mut seen);
        if let Ok(entries) = std::fs::read_dir(&base) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    consider(&entry.path(), repo, &mut found, &mut seen);
                }
            }
        }
    }
    // recursive fallback, bounded depth, skipping .git
    for entry in walkdir::WalkDir::new(repo)
        .max_depth(5)
        .into_iter()
        .filter_entry(|e| e.file_name() != ".git" && e.file_name() != "node_modules")
        .flatten()
    {
        if entry.file_type().is_dir() {
            consider(&entry.path().to_path_buf(), repo, &mut found, &mut seen);
        }
    }

    let mut out = vec![];
    for (rel, abs) in found {
        let Some(meta) = store::read_skill_meta(&abs) else { continue };
        let skill_md = std::fs::read_to_string(abs.join("SKILL.md")).unwrap_or_default();
        let files = store::list_skill_files(&abs).unwrap_or_default();
        out.push(DiscoveredSkill {
            name: meta.name,
            description: meta.description,
            repo_path: if rel.is_empty() { ".".into() } else { rel },
            skill_md,
            files,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_source_forms() {
        assert_eq!(
            parse_source("vercel-labs/agent-skills").unwrap(),
            (
                "github.com/vercel-labs/agent-skills".to_string(),
                "https://github.com/vercel-labs/agent-skills.git".to_string()
            )
        );
        assert_eq!(
            parse_source("https://github.com/anthropics/skills").unwrap().0,
            "github.com/anthropics/skills"
        );
        assert_eq!(
            parse_source("https://github.com/anthropics/skills/tree/main/skills/pdf").unwrap().0,
            "github.com/anthropics/skills"
        );
        assert_eq!(
            parse_source("git@github.com:owner/repo.git").unwrap().0,
            "github.com/owner/repo"
        );
        // our own canonical id must round-trip (install passes source back in)
        assert_eq!(
            parse_source("github.com/vercel-labs/skills").unwrap(),
            (
                "github.com/vercel-labs/skills".to_string(),
                "https://github.com/vercel-labs/skills.git".to_string()
            )
        );
        assert_eq!(
            parse_source("gitlab.com/group/project").unwrap().0,
            "gitlab.com/group/project"
        );
        assert!(parse_source("not a source").is_err());
        assert!(parse_source("../../etc").is_err());
    }
}
