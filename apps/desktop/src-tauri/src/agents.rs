use crate::model::AgentDef;
use std::path::PathBuf;

/// Vendored agent directory table, tracked against the skills CLI's mapping.
/// Data-driven on purpose: adding an agent is config, not code.
pub fn agent_table() -> Vec<AgentDef> {
    serde_json::from_str(include_str!("../agents.json")).expect("agents.json is valid")
}

pub fn home_dir() -> PathBuf {
    dirs::home_dir().expect("home dir exists")
}

/// Agents considered installed on this machine (their detect dir exists under $HOME).
pub fn detected_global_agents() -> Vec<AgentDef> {
    let home = home_dir();
    agent_table()
        .into_iter()
        .filter(|a| home.join(&a.detect_dir).is_dir())
        .collect()
}

/// Agents relevant for a project: detected globally, or already have a project dir.
pub fn detected_project_agents(project: &std::path::Path) -> Vec<AgentDef> {
    let global: Vec<AgentDef> = detected_global_agents();
    let mut out = global;
    for a in agent_table() {
        if out.iter().any(|x| x.id == a.id) {
            continue;
        }
        if project.join(&a.project_skills_dir).is_dir() {
            out.push(a);
        }
    }
    out
}

pub fn global_skills_dir(agent: &AgentDef) -> PathBuf {
    home_dir().join(&agent.global_skills_dir)
}

pub fn project_skills_dir(agent: &AgentDef, project: &std::path::Path) -> PathBuf {
    project.join(&agent.project_skills_dir)
}
