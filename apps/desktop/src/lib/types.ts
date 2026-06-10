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

export interface Suggestion {
  profile: string;
  tag: string;
  evidence: string;
}

export interface ProjectView {
  path: string;
  name: string;
  profile?: string | null;
  auto: boolean;
  registered_at: string;
  exists: boolean;
  agents: AgentDef[];
  effective: EffectiveSkill[];
  has_loadout_json: boolean;
  suggestions: Suggestion[];
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
  backup_path?: string | null;
}

export interface OverlapPair {
  a: string;
  b: string;
  similarity: number;
  shared: string[];
}

export interface ContestedKeyword {
  keyword: string;
  skills: string[];
}

export interface OverlapReport {
  near_duplicates: OverlapPair[];
  contested: ContestedKeyword[];
}

export interface DoctorReport {
  foreign: ForeignSkill[];
  missing_projects: string[];
  broken_store: string[];
  recovered_journal: boolean;
  overlap: OverlapReport;
}

export interface Settings {
  base_profile?: string | null;
  check_updates_on_launch: boolean;
  share_admin_key?: string | null;
}

export interface SlugCheck {
  valid: boolean;
  reserved: boolean;
  available: boolean;
}

export interface Overview {
  settings: Settings;
  agents: AgentDef[];
  skill_count: number;
  profile_count: number;
  project_count: number;
  loadout_root: string;
}

export interface ProfileShare {
  json: string;
  share: { profile: string; skills: Array<{ source: string; skill: string; rev?: string }> };
  skipped_local: string[];
}

export interface SkillUsage {
  name: string;
  count: number;
  last_used?: string | null;
}

export interface UsageReport {
  skills: SkillUsage[];
  files_total: number;
  files_rescanned: number;
  total_invocations: number;
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
