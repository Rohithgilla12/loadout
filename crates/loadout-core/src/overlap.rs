//! Redundancy analysis for the library. Agents pick skills by description —
//! two skills claiming the same trigger words, or near-duplicate
//! descriptions, make triggering unpredictable. Doctor surfaces both.

use crate::model::LockFile;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Serialize)]
pub struct OverlapPair {
    pub a: String,
    pub b: String,
    /// Jaccard similarity of description token sets, 0..1.
    pub similarity: f32,
    /// Tokens both descriptions share (capped, most distinctive first).
    pub shared: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContestedKeyword {
    pub keyword: String,
    pub skills: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct OverlapReport {
    /// Pairs whose descriptions are similar enough to confuse triggering.
    pub near_duplicates: Vec<OverlapPair>,
    /// Distinctive keywords claimed by several skills ("tailwind" × 3).
    pub contested: Vec<ContestedKeyword>,
}

/// Words too generic to mean anything in a skill description.
const STOPWORDS: &[&str] = &[
    "a", "an", "and", "any", "are", "as", "at", "be", "by", "can", "create", "do", "for", "from",
    "get", "has", "have", "how", "in", "into", "is", "it", "like", "make", "new", "of", "on",
    "or", "should", "skill", "that", "the", "this", "to", "tool", "up", "us", "use", "used",
    "user", "users", "using", "when", "whenever", "with", "you", "your",
];

fn tokens(description: &str) -> BTreeSet<String> {
    description
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| w.len() >= 3 && !STOPWORDS.contains(w))
        .map(|w| w.to_string())
        .collect()
}

fn jaccard(a: &BTreeSet<String>, b: &BTreeSet<String>) -> f32 {
    let inter = a.intersection(b).count();
    let union = a.union(b).count();
    if union == 0 {
        0.0
    } else {
        inter as f32 / union as f32
    }
}

/// Analyze every installed skill's description. O(n²) on the library size,
/// which is at most a few hundred — instant in practice.
pub fn analyze(lock: &LockFile) -> OverlapReport {
    let skills: Vec<(&String, BTreeSet<String>)> = lock
        .skills
        .iter()
        .map(|(name, e)| (name, tokens(&e.description)))
        .collect();
    let n = skills.len();

    // document frequency per token → "distinctive" = rare across the library
    let mut df: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (name, toks) in &skills {
        for t in toks {
            df.entry(t).or_default().push(name);
        }
    }

    let mut near_duplicates = vec![];
    for i in 0..n {
        for j in (i + 1)..n {
            let (name_a, toks_a) = &skills[i];
            let (name_b, toks_b) = &skills[j];
            if toks_a.is_empty() || toks_b.is_empty() {
                continue;
            }
            let sim = jaccard(toks_a, toks_b);
            if sim >= 0.5 {
                // shared tokens, rarest first — these are the confusing ones
                let mut shared: Vec<String> = toks_a.intersection(toks_b).cloned().collect();
                shared.sort_by_key(|t| df.get(t.as_str()).map(|v| v.len()).unwrap_or(0));
                shared.truncate(6);
                near_duplicates.push(OverlapPair {
                    a: (*name_a).clone(),
                    b: (*name_b).clone(),
                    similarity: (sim * 100.0).round() / 100.0,
                    shared,
                });
            }
        }
    }
    near_duplicates.sort_by(|x, y| y.similarity.total_cmp(&x.similarity));
    near_duplicates.truncate(20);

    // contested keywords: claimed by 2+ skills but not by "everything"
    // (a token half the library uses is a theme, not a collision)
    let ceiling = (n / 4).max(4);
    let mut contested: Vec<ContestedKeyword> = df
        .into_iter()
        .filter(|(_, names)| names.len() >= 2 && names.len() <= ceiling)
        .map(|(kw, names)| ContestedKeyword {
            keyword: kw.to_string(),
            skills: names.iter().map(|s| s.to_string()).collect(),
        })
        .collect();
    // most contested first; cap so the report stays readable
    contested.sort_by_key(|c| std::cmp::Reverse(c.skills.len()));
    contested.truncate(15);

    OverlapReport { near_duplicates, contested }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::LockEntry;

    fn lock_with(entries: &[(&str, &str)]) -> LockFile {
        let mut lock = LockFile::default();
        for (name, desc) in entries {
            lock.skills.insert(
                name.to_string(),
                LockEntry {
                    name: name.to_string(),
                    source: "local".into(),
                    url: None,
                    rev: None,
                    prev_rev: None,
                    repo_path: None,
                    track: "pinned".into(),
                    description: desc.to_string(),
                    installed_at: chrono::Utc::now(),
                },
            );
        }
        lock
    }

    #[test]
    fn flags_near_duplicates() {
        let lock = lock_with(&[
            ("tailwind-a", "Style components with tailwind css utility classes"),
            ("tailwind-b", "Style components using tailwind css utility classes"),
            ("go-expert", "Write idiomatic golang services with goroutines"),
        ]);
        let report = analyze(&lock);
        assert_eq!(report.near_duplicates.len(), 1);
        let pair = &report.near_duplicates[0];
        assert_eq!((pair.a.as_str(), pair.b.as_str()), ("tailwind-a", "tailwind-b"));
        assert!(pair.similarity > 0.8);
        assert!(pair.shared.contains(&"tailwind".to_string()));
    }

    #[test]
    fn flags_contested_keywords() {
        let lock = lock_with(&[
            ("tw-one", "Tailwind styling helpers"),
            ("tw-two", "Tailwind theme generator"),
            ("rusty", "Rust performance profiling"),
        ]);
        let report = analyze(&lock);
        assert!(report
            .contested
            .iter()
            .any(|c| c.keyword == "tailwind" && c.skills.len() == 2));
        assert!(!report.contested.iter().any(|c| c.keyword == "rust"));
    }

    #[test]
    fn distinct_library_is_quiet() {
        let lock = lock_with(&[
            ("go", "Write idiomatic golang services"),
            ("css", "Author stylesheets and animations"),
        ]);
        let report = analyze(&lock);
        assert!(report.near_duplicates.is_empty());
        assert!(report.contested.is_empty());
    }
}
