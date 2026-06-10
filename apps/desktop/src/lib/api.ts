import { invoke } from "@tauri-apps/api/core";
import type {
  ApplySummary,
  DoctorReport,
  LibrarySkill,
  LoadoutFile,
  LockEntry,
  MigrateSummary,
  Overview,
  Profile,
  ProjectView,
  RegistrySkill,
  ResolvedSource,
  Settings,
  SkillDetail,
  UpdateInfo,
} from "./types";

export const api = {
  // overview / settings
  getOverview: () => invoke<Overview>("get_overview"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings_cmd", { settings }),

  // library
  listLibrary: () => invoke<LibrarySkill[]>("list_library"),
  getSkillDetail: (name: string) => invoke<SkillDetail>("get_skill_detail", { name }),
  removeSkill: (name: string) => invoke<ApplySummary[]>("remove_skill", { name }),

  // profiles
  listProfiles: () => invoke<Profile[]>("list_profiles_cmd"),
  saveProfile: (profile: Profile) => invoke<void>("save_profile_cmd", { profile }),
  createProfile: (name: string) => invoke<Profile>("create_profile", { name }),
  renameProfile: (old: string, newName: string) => invoke<void>("rename_profile", { old, new: newName }),
  duplicateProfile: (name: string, newName: string) =>
    invoke<Profile>("duplicate_profile", { name, newName }),
  deleteProfile: (name: string) => invoke<ApplySummary[]>("delete_profile_cmd", { name }),
  setBaseProfile: (name: string | null) => invoke<ApplySummary[]>("set_base_profile", { name }),

  // projects
  listProjects: () => invoke<ProjectView[]>("list_projects"),
  registerProject: (path: string) => invoke<ProjectView>("register_project", { path }),
  unregisterProject: (path: string) => invoke<void>("unregister_project", { path }),
  assignProfile: (path: string, profile: string | null) =>
    invoke<ApplySummary>("assign_profile", { path, profile }),
  applyProject: (path: string) => invoke<ApplySummary>("apply_project", { path }),

  // loadout.json
  readLoadoutFile: (path: string) => invoke<LoadoutFile>("read_loadout_file", { path }),
  exportLoadoutFile: (profile: string, destDir: string) =>
    invoke<string>("export_loadout_file", { profile, destDir }),
  applyLoadoutFile: (path: string) => invoke<ApplySummary>("apply_loadout_file", { path }),

  // install
  resolveSource: (input: string) => invoke<ResolvedSource>("resolve_source", { input }),
  installSkills: (source: string, skillNames: string[], rev: string | null, profile: string | null) =>
    invoke<LockEntry[]>("install_skills", { source, skillNames, rev, profile }),

  // updates
  checkUpdates: () => invoke<UpdateInfo[]>("check_updates"),
  updateSkill: (name: string, toRev: string) => invoke<LockEntry>("update_skill", { name, toRev }),
  rollbackSkill: (name: string) => invoke<LockEntry>("rollback_skill", { name }),
  diffSkill: (name: string, toRev: string) => invoke<string>("diff_skill", { name, toRev }),
  setTrack: (name: string, track: string) => invoke<void>("set_track", { name, track }),

  // local skills
  createLocalSkill: (name: string, description: string) =>
    invoke<LockEntry>("create_local_skill_cmd", { name, description }),
  saveSkillFile: (name: string, relPath: string, content: string) =>
    invoke<void>("save_skill_file", { name, relPath, content }),
  readSkillFile: (name: string, relPath: string) =>
    invoke<string>("read_skill_file", { name, relPath }),
  forkSkill: (name: string, newName: string) => invoke<LockEntry>("fork_skill", { name, newName }),

  // doctor
  doctor: () => invoke<DoctorReport>("doctor"),
  adoptSkill: (dir: string) => invoke<LockEntry>("adopt_skill", { dir }),
  migrateAll: (replace: boolean, profileName: string, backup: boolean) =>
    invoke<MigrateSummary>("migrate_all", { replace, profileName, backup }),
  reapplyAll: () => invoke<ApplySummary[]>("reapply_all_cmd"),

  // registry
  registryLeaderboard: (view: string) => invoke<RegistrySkill[]>("registry_leaderboard", { view }),
  registrySearch: (q: string) => invoke<RegistrySkill[]>("registry_search", { q }),
};

export function describeApply(summaries: ApplySummary | ApplySummary[]): string {
  const list = Array.isArray(summaries) ? summaries : [summaries];
  const added = list.reduce((n, s) => n + s.added, 0);
  const removed = list.reduce((n, s) => n + s.removed, 0);
  const agents = new Set(list.flatMap((s) => s.agents));
  const parts = [];
  if (added) parts.push(`+${added} skill${added === 1 ? "" : "s"}`);
  if (removed) parts.push(`−${removed} skill${removed === 1 ? "" : "s"}`);
  if (!parts.length) parts.push("no changes");
  return `${parts.join(", ")} across ${agents.size} agent${agents.size === 1 ? "" : "s"}`;
}
