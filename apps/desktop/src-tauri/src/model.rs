use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Parsed SKILL.md frontmatter plus location info.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMeta {
    pub name: String,
    pub description: String,
}

/// One skill as recorded in the lockfile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockEntry {
    pub name: String,
    /// e.g. "github.com/vercel-labs/agent-skills" or "local"
    pub source: String,
    /// Full git URL used to fetch (absent for local skills).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Commit SHA the skill content came from (absent for local skills).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rev: Option<String>,
    /// Previous SHA, kept for one-click rollback.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev_rev: Option<String>,
    /// Path of the skill directory inside the source repo (e.g. "skills/frontend-design").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repo_path: Option<String>,
    /// "pinned" (default) or "latest"
    #[serde(default = "default_track")]
    pub track: String,
    pub description: String,
    pub installed_at: chrono::DateTime<chrono::Utc>,
}

fn default_track() -> String {
    "pinned".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LockFile {
    #[serde(default)]
    pub skills: BTreeMap<String, LockEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub name: String,
    #[serde(default)]
    pub extends: Option<String>,
    /// Skill names, ordered.
    #[serde(default)]
    pub skills: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub path: String,
    pub name: String,
    #[serde(default)]
    pub profile: Option<String>,
    pub registered_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectsFile {
    #[serde(default)]
    pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Name of the profile applied to global agent dirs.
    #[serde(default)]
    pub base_profile: Option<String>,
    #[serde(default = "default_true")]
    pub check_updates_on_launch: bool,
    /// Unlocks reserved share slugs on loadout.gilla.fun.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub share_admin_key: Option<String>,
}

fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self { base_profile: None, check_updates_on_launch: true, share_admin_key: None }
    }
}

/// Data-driven agent definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDef {
    pub id: String,
    pub display_name: String,
    /// Dir under $HOME holding global skills, e.g. ".claude/skills"
    pub global_skills_dir: String,
    /// Dir under a project root holding project skills, e.g. ".claude/skills"
    pub project_skills_dir: String,
    /// Dir whose existence under $HOME means "this agent is installed", e.g. ".claude"
    pub detect_dir: String,
}

/// A skill found in an agent dir that Loadout does not own.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignSkill {
    pub agent_id: String,
    pub scope: String, // "global" or project path
    pub dir: String,
    pub name: String,
    pub is_symlink: bool,
    #[serde(default)]
    pub description: Option<String>,
    /// True when a lock entry with this name already exists.
    #[serde(default)]
    pub already_adopted: bool,
}

/// Pending journal written before any reconcile mutation, replayed on crash.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Journal {
    pub scope: String,
    pub skills: Vec<String>,
    pub started_at: chrono::DateTime<chrono::Utc>,
}

/// Result summary of one apply.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ApplySummary {
    pub added: u32,
    pub removed: u32,
    pub unchanged: u32,
    pub agents: Vec<String>,
    pub skipped_conflicts: Vec<String>,
}

/// A discovered skill inside a cloned repo, offered in the install picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredSkill {
    pub name: String,
    pub description: String,
    pub repo_path: String,
    pub skill_md: String,
    pub files: Vec<SkillFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFile {
    pub path: String,
    pub size: u64,
    pub executable: bool,
}

/// Row rendered in the Library table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrarySkill {
    pub name: String,
    pub description: String,
    pub source: String,
    #[serde(default)]
    pub rev: Option<String>,
    pub track: String,
    pub installed_at: chrono::DateTime<chrono::Utc>,
    pub profiles: Vec<String>,
    #[serde(default)]
    pub update_available: Option<String>,
    #[serde(default)]
    pub can_rollback: bool,
}

/// loadout.json — the repo-committed profile file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadoutFile {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub profile: String,
    #[serde(default)]
    pub extends: Vec<String>,
    pub skills: Vec<LoadoutFileSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadoutFileSkill {
    pub source: String,
    pub skill: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rev: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vendored: Option<String>,
}
