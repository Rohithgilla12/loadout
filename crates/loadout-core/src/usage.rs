//! Local skill-usage analytics: which skills actually fire?
//!
//! Claude Code writes session transcripts as JSONL under ~/.claude/projects.
//! Skill invocations appear as a stable substring, so we stream-scan lines
//! instead of parsing JSON, and cache per-file results keyed by (mtime, size)
//! so only new/changed transcripts are rescanned. Everything stays local.

use crate::error::Result;
use crate::{agents, state};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const NEEDLE: &str = r#""name":"Skill","input":{"skill":""#;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct FileStats {
    pub mtime_ms: u64,
    pub size: u64,
    #[serde(default)]
    pub counts: BTreeMap<String, u32>,
    /// latest ISO timestamp seen per skill in this file
    #[serde(default)]
    pub last: BTreeMap<String, String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct UsageCache {
    #[serde(default)]
    pub files: BTreeMap<String, FileStats>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillUsage {
    pub name: String,
    pub count: u32,
    pub last_used: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UsageReport {
    pub skills: Vec<SkillUsage>,
    pub files_total: usize,
    pub files_rescanned: usize,
    pub total_invocations: u32,
}

fn cache_path() -> PathBuf {
    state::loadout_root().join("usage-cache.json")
}

/// Extract every `Skill` invocation from one transcript line. A line is one
/// JSON message; assistant messages can contain several tool calls.
fn scan_line(line: &str, stats: &mut FileStats) {
    let timestamp = line
        .find(r#""timestamp":""#)
        .and_then(|i| {
            let rest = &line[i + 13..];
            rest.find('"').map(|j| rest[..j].to_string())
        })
        .unwrap_or_default();

    let mut from = 0;
    while let Some(i) = line[from..].find(NEEDLE) {
        let start = from + i + NEEDLE.len();
        let Some(end) = line[start..].find('"') else { break };
        let name = &line[start..start + end];
        if !name.is_empty() && name.len() <= 100 {
            *stats.counts.entry(name.to_string()).or_insert(0) += 1;
            if !timestamp.is_empty() {
                let entry = stats.last.entry(name.to_string()).or_default();
                if timestamp > *entry {
                    *entry = timestamp.clone();
                }
            }
        }
        from = start + end;
    }
}

fn scan_file(path: &Path, mtime_ms: u64, size: u64) -> FileStats {
    let mut stats = FileStats { mtime_ms, size, ..Default::default() };
    let Ok(file) = fs::File::open(path) else { return stats };
    let mut reader = BufReader::with_capacity(256 * 1024, file);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                // cheap pre-filter before the needle dance
                if line.contains(r#""name":"Skill""#) {
                    scan_line(&line, &mut stats);
                }
            }
        }
    }
    stats
}

/// Scan all Claude Code transcripts, incrementally. First run reads
/// everything; later runs only touch files whose (mtime, size) changed.
pub fn scan() -> Result<UsageReport> {
    let root = agents::home_dir().join(".claude/projects");
    let mut cache: UsageCache = fs::read_to_string(cache_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let mut files_total = 0;
    let mut files_rescanned = 0;
    let mut seen = std::collections::BTreeSet::new();

    if root.is_dir() {
        for entry in walkdir::WalkDir::new(&root).into_iter().flatten() {
            if !entry.file_type().is_file()
                || entry.path().extension().and_then(|e| e.to_str()) != Some("jsonl")
            {
                continue;
            }
            files_total += 1;
            let path_str = entry.path().to_string_lossy().to_string();
            seen.insert(path_str.clone());
            let Ok(meta) = entry.metadata() else { continue };
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let size = meta.len();
            let fresh = cache
                .files
                .get(&path_str)
                .map(|c| c.mtime_ms == mtime_ms && c.size == size)
                .unwrap_or(false);
            if !fresh {
                files_rescanned += 1;
                cache.files.insert(path_str, scan_file(entry.path(), mtime_ms, size));
            }
        }
    }
    // drop cache entries for deleted transcripts
    cache.files.retain(|k, _| seen.contains(k));

    let _ = fs::create_dir_all(state::loadout_root());
    let _ = fs::write(cache_path(), serde_json::to_string(&cache)?);

    // aggregate
    let mut counts: BTreeMap<String, u32> = BTreeMap::new();
    let mut last: BTreeMap<String, String> = BTreeMap::new();
    for stats in cache.files.values() {
        for (name, n) in &stats.counts {
            *counts.entry(name.clone()).or_insert(0) += n;
        }
        for (name, ts) in &stats.last {
            let entry = last.entry(name.clone()).or_default();
            if ts > entry {
                *entry = ts.clone();
            }
        }
    }
    let total_invocations = counts.values().sum();
    let mut skills: Vec<SkillUsage> = counts
        .into_iter()
        .map(|(name, count)| SkillUsage {
            last_used: last.get(&name).filter(|s| !s.is_empty()).cloned(),
            name,
            count,
        })
        .collect();
    skills.sort_by(|a, b| b.count.cmp(&a.count));

    Ok(UsageReport { skills, files_total, files_rescanned, total_invocations })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_skill_invocations_from_transcript_lines() {
        let mut stats = FileStats::default();
        let line = r#"{"timestamp":"2026-06-10T09:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"tauri-v2"}},{"type":"tool_use","name":"Skill","input":{"skill":"superpowers:brainstorming"}}]}}"#;
        scan_line(line, &mut stats);
        assert_eq!(stats.counts.get("tauri-v2"), Some(&1));
        assert_eq!(stats.counts.get("superpowers:brainstorming"), Some(&1));
        assert_eq!(
            stats.last.get("tauri-v2").map(|s| s.as_str()),
            Some("2026-06-10T09:00:00.000Z")
        );

        // same skill again, later — count increments, last_used advances
        let line2 = r#"{"timestamp":"2026-06-11T10:00:00.000Z","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"tauri-v2"}}]}}"#;
        scan_line(line2, &mut stats);
        assert_eq!(stats.counts.get("tauri-v2"), Some(&2));
        assert_eq!(
            stats.last.get("tauri-v2").map(|s| s.as_str()),
            Some("2026-06-11T10:00:00.000Z")
        );
    }
}
