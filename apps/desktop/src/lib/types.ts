export interface LockEntry {
  name: string;
  source: string;
  url?: string;
  rev?: string;
  prev_rev?: string;
  repo_path?: string;
  track: "pinned" | "latest";
  description: string;
  installed_at: string;
}

export interface LibrarySkill {
  name: string;
  description: string;
  source: string;
  rev?: string;
  track: string;
  installed_at: string;
  profiles: string[];
  update_available?: string;
  can_rollback: boolean;
}

export interface Profile {
  name: string;
  extends?: string | null;
  skills: string[];
}

export interface AgentDef {
  id: string;
  display_name: string;
  global_skills_dir: string;
  project_skills_dir: string;
  detect_dir: string;
}

export interface EffectiveSkill {
  name: string;
  origin: "base" | "project";
  installed: boolean;
}

export interface ProjectView {
  path: string;
  name: string;
  profile?: string | null;
  registered_at: string;
  exists: boolean;
  agents: AgentDef[];
  effective: EffectiveSkill[];
  has_loadout_json: boolean;
}

export interface ApplySummary {
  added: number;
  removed: number;
  unchanged: number;
  agents: string[];
  skipped_conflicts: string[];
}

export interface SkillFile {
  path: string;
  size: number;
  executable: boolean;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  repo_path: string;
  skill_md: string;
  files: SkillFile[];
}

export interface ResolvedSource {
  source: string;
  url: string;
  rev: string;
  skills: DiscoveredSkill[];
}

export interface SkillDetail {
  entry: LockEntry;
  skill_md: string;
  files: SkillFile[];
  store_path: string;
}

export interface UpdateInfo {
  name: string;
  current: string;
  latest: string;
}

export interface ForeignSkill {
  agent_id: string;
  scope: string;
  dir: string;
  name: string;
  is_symlink: boolean;
  description?: string;
  already_adopted: boolean;
}

export interface MigrateSummary {
  adopted: number;
  replaced: number;
  skipped: string[];
  profile: string;
}

export interface DoctorReport {
  foreign: ForeignSkill[];
  missing_projects: string[];
  broken_store: string[];
  recovered_journal: boolean;
}

export interface Settings {
  base_profile?: string | null;
  check_updates_on_launch: boolean;
}

export interface Overview {
  settings: Settings;
  agents: AgentDef[];
  skill_count: number;
  profile_count: number;
  project_count: number;
  loadout_root: string;
}

export interface RegistrySkill {
  source: string;
  skillId: string;
  name: string;
  installs: number;
  isOfficial: boolean;
}

export interface LoadoutFileSkill {
  source: string;
  skill: string;
  rev?: string;
  vendored?: string;
}

export interface LoadoutFile {
  profile: string;
  extends: string[];
  skills: LoadoutFileSkill[];
}
