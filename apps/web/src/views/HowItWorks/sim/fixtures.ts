import { type Entry, type SimFS, HOME, STORE_ROOT } from "./simEngine";

export const CLAUDE_DIR = `${HOME}/.claude/skills`;
export const AGENTS_DIR = `${HOME}/.agents/skills`;

export interface SimSkill {
  name: string;
  source: string; // "local" or e.g. "github.com/anthropics/skills"
  rev?: string;
  description: string;
}

// The journey skill is frontend-design; revs are short fake SHAs.
export const SKILLS: SimSkill[] = [
  {
    name: "frontend-design",
    source: "github.com/anthropics/skills",
    rev: "9b1f3c2",
    description: "Create distinctive, production-grade interfaces",
  },
  { name: "tailwind", source: "github.com/anthropics/skills", rev: "9b1f3c2", description: "Tailwind v4 patterns" },
  {
    name: "vercel-react-best-practices",
    source: "github.com/vercel-labs/agent-skills",
    rev: "4e8d7aa",
    description: "React performance guidelines",
  },
  { name: "doc-coauthoring", source: "github.com/anthropics/skills", rev: "9b1f3c2", description: "Structured doc workflows" },
  { name: "internal-comms", source: "local", description: "Company comms voice" },
  { name: "go-concurrency", source: "local", description: "Goroutines and channels" },
];

export const PROFILES: Record<string, string[]> = {
  writing: ["doc-coauthoring", "internal-comms"],
  frontend: ["frontend-design", "tailwind", "vercel-react-best-practices"],
  everything: SKILLS.map((s) => s.name),
};

export function storePathFor(skill: SimSkill): string {
  return skill.source === "local"
    ? `${STORE_ROOT}/local/${skill.name}`
    : `${STORE_ROOT}/${skill.source}/${skill.rev}/${skill.name}`;
}

export function targetsFor(profile: string): Array<[string, string]> {
  return (PROFILES[profile] ?? []).map((name) => {
    const skill = SKILLS.find((s) => s.name === name)!;
    return [name, storePathFor(skill)];
  });
}

/**
 * Starting world for the reconcile sections: store populated, the writing
 * profile applied to ~/.claude/skills, plus two foreign entries that must
 * survive everything the reader does.
 */
export function initialAgentFs(): SimFS {
  const fs = new Map<string, Entry>();
  for (const s of SKILLS) fs.set(storePathFor(s), { kind: "dir" });
  fs.set(CLAUDE_DIR, { kind: "dir" });
  for (const [name, storePath] of targetsFor("writing")) {
    fs.set(`${CLAUDE_DIR}/${name}`, { kind: "symlink", target: storePath });
  }
  fs.set(`${CLAUDE_DIR}/my-notes`, { kind: "dir" });
  fs.set(`${CLAUDE_DIR}/team-link`, { kind: "symlink", target: `${HOME}/dotfiles/skills/team` });
  return fs;
}

/** Same world with a second agent dir, for the profiles section. */
export function multiAgentFs(): SimFS {
  const fs = initialAgentFs();
  fs.set(AGENTS_DIR, { kind: "dir" });
  for (const [name, storePath] of targetsFor("writing")) {
    fs.set(`${AGENTS_DIR}/${name}`, { kind: "symlink", target: storePath });
  }
  return fs;
}
