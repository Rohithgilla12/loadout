# Interactive "How Loadout Works" Post — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `loadout.gilla.fun/how-it-works` — an engineering deep-dive where every Loadout mechanism (store, lockfile, reconcile, journal recovery, profiles, sharing, CI) is a playable in-browser simulation driven by a faithful TS port of the Rust reconcile algorithm.

**Architecture:** A new `HowItWorks` view in `apps/web` (path-routed; the Worker's SPA fallback already serves deep links). One pure simulation engine (`simEngine.ts`) ports `reconcile_dir` + `is_loadout_owned` from `crates/loadout-core/src/apply.rs` over an in-memory `Map<path, Entry>` filesystem; every simulation mutates state only through it. The sharing section imports the real production `lib/share.ts`. Eight section components + small shared UI primitives (FileTree, StepPlayer, CodeFold, Terminal, Prose).

**Tech Stack:** React 19, Tailwind v4 (existing theme tokens), TypeScript, vitest (new devDep, engine tests only). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-11-how-it-works-interactive-post-design.md`

**Conventions for this codebase:**
- Run web commands as `pnpm --filter web <cmd>` from the repo root.
- Build check is `pnpm --filter web build` (runs `tsc && vite build`).
- **Never start the dev server yourself — ask Rohith first; he usually has one running.**
- Comment style: sparse, sentence-style, explain constraints only. NEVER use banner/ruler comment blocks (`// ====== Section ======`).

## File map

```
apps/web/
  package.json                              (modify: add vitest, test script)
  src/
    App.tsx                                 (modify: route /how-it-works)
    views/
      Landing.tsx                           (modify: nav link)
      HowItWorks/
        HowItWorks.tsx                      (post shell: hero, Section wrapper, outro)
        sim/
          simEngine.ts                      (pure engine: normalize, isLoadoutOwned,
                                             reconcileDir, applySteps)
          simEngine.test.ts                 (vitest — ports Rust test scenarios)
          fixtures.ts                       (skills, profiles, store paths, starting FS)
        ui/
          Prose.tsx                         (styled prose block)
          CodeFold.tsx                      (collapsible code snippet)
          Terminal.tsx                      (dark terminal box)
          FileTree.tsx                      (agent-dir/file listing w/ ownership badges)
          StepPlayer.tsx                    (play/step/reset over engine steps)
        sections/
          snippets.ts                       (verbatim Rust quotes for CodeFold)
          Problem.tsx                       (§1 all-on context pile)
          StoreInstall.tsx                  (§2 install → store + lock entry)
          Lockfile.tsx                      (§3 pin / update / rollback)
          Reconcile.tsx                     (§4 two-pass reconcile, step-through)
          BreakIt.tsx                       (§5 try-to-break-it playground)
          Profiles.tsx                      (§6 switching across agent dirs)
          Sharing.tsx                       (§7 live #L= encoding, real share.ts)
          Ci.tsx                            (§8 loadout check terminal)
```

---

### Task 1: vitest setup + path/ownership primitives (TDD)

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/views/HowItWorks/sim/simEngine.ts`
- Test: `apps/web/src/views/HowItWorks/sim/simEngine.test.ts`

- [ ] **Step 1: Add vitest**

Run: `pnpm --filter web add -D vitest`

Then add the script to `apps/web/package.json` `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/views/HowItWorks/sim/simEngine.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  type Entry,
  type SimFS,
  STORE_ROOT,
  isLoadoutOwned,
  normalize,
} from "./simEngine";

export const DIR = "/home/you/.claude/skills";
export const ALPHA = `${STORE_ROOT}/local/alpha`;
export const BETA = `${STORE_ROOT}/local/beta`;

export function baseFs(): SimFS {
  return new Map<string, Entry>([
    [ALPHA, { kind: "dir" }],
    [BETA, { kind: "dir" }],
    [DIR, { kind: "dir" }],
    [`${DIR}/foreign-skill`, { kind: "dir" }],
  ]);
}

describe("normalize", () => {
  test("collapses .. and . lexically", () => {
    expect(normalize("/a/b/../c")).toBe("/a/c");
    expect(normalize("/a/./b//c")).toBe("/a/b/c");
    expect(normalize("/a/b/")).toBe("/a/b");
  });
});

describe("isLoadoutOwned", () => {
  test("symlink into the store is owned, even when broken", () => {
    const fs = baseFs();
    fs.set(`${DIR}/alpha`, { kind: "symlink", target: ALPHA });
    fs.set(`${DIR}/ghost`, { kind: "symlink", target: `${STORE_ROOT}/local/ghost` });
    expect(isLoadoutOwned(fs, `${DIR}/alpha`)).toBe(true);
    // store content pruned: still owned — reconcile must be able to clean it up
    expect(isLoadoutOwned(fs, `${DIR}/ghost`)).toBe(true);
  });

  test("relative targets resolve against the link's parent", () => {
    const fs = baseFs();
    fs.set(`${DIR}/rel`, { kind: "symlink", target: "../../.loadout/store/local/alpha" });
    expect(isLoadoutOwned(fs, `${DIR}/rel`)).toBe(true);
  });

  test("foreign entries are never owned", () => {
    const fs = baseFs();
    fs.set(`${DIR}/elsewhere`, { kind: "symlink", target: "/home/you/dotfiles/skill" });
    expect(isLoadoutOwned(fs, `${DIR}/foreign-skill`)).toBe(false); // plain dir
    expect(isLoadoutOwned(fs, `${DIR}/elsewhere`)).toBe(false); // link out of store
    expect(isLoadoutOwned(fs, `${DIR}/nope`)).toBe(false); // doesn't exist
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter web test`
Expected: FAIL — `simEngine.ts` does not exist / has no exports.

- [ ] **Step 4: Implement the primitives**

Create `apps/web/src/views/HowItWorks/sim/simEngine.ts`:

```ts
// A faithful TS port of the reconcile algorithm in
// crates/loadout-core/src/apply.rs, over an in-memory filesystem.
// Every simulation in the post mutates state only through this engine,
// so the demos run the same two passes and the same ownership rule
// as the real app.

export type Entry =
  | { kind: "dir" }
  | { kind: "file" }
  | { kind: "symlink"; target: string };

/** Absolute normalized path → entry. Directories don't imply children. */
export type SimFS = Map<string, Entry>;

export const HOME = "/home/you";
export const STORE_ROOT = `${HOME}/.loadout/store`;

/** Lexical path normalization (no fs access — works on broken links). */
export function normalize(p: string): string {
  const out: string[] = [];
  for (const comp of p.split("/")) {
    if (comp === "" || comp === ".") continue;
    if (comp === "..") out.pop();
    else out.push(comp);
  }
  return "/" + out.join("/");
}

export function parentOf(p: string): string {
  const n = normalize(p);
  return n.slice(0, n.lastIndexOf("/")) || "/";
}

/** Direct children of a directory, sorted. */
export function childrenOf(fs: SimFS, dir: string): string[] {
  const prefix = normalize(dir) + "/";
  return [...fs.keys()]
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .sort();
}

/** True if the entry is a symlink whose target resolves into the store. */
export function isLoadoutOwned(fs: SimFS, entryPath: string): boolean {
  const entry = fs.get(normalize(entryPath));
  if (!entry || entry.kind !== "symlink") return false;
  const absolute = entry.target.startsWith("/")
    ? entry.target
    : parentOf(entryPath) + "/" + entry.target;
  return normalize(absolute).startsWith(normalize(STORE_ROOT) + "/");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS (3 test groups).

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/views/HowItWorks/sim/
git commit -m "feat(web): sim engine primitives for how-it-works post (vitest, ownership rule)"
```

---

### Task 2: reconcileDir + applySteps (TDD, ports the Rust test scenarios)

**Files:**
- Modify: `apps/web/src/views/HowItWorks/sim/simEngine.ts`
- Test: `apps/web/src/views/HowItWorks/sim/simEngine.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `simEngine.test.ts` (extend the existing import with `reconcileDir` and `applySteps`):

```ts
import { applySteps, reconcileDir } from "./simEngine";

// Ports of the test scenarios in crates/loadout-core/src/apply.rs.
describe("reconcileDir", () => {
  test("round trip: apply, narrow, foreign survives, idempotent", () => {
    const r1 = reconcileDir(baseFs(), DIR, [
      ["alpha", ALPHA],
      ["beta", BETA],
    ]);
    expect(r1.summary.added).toBe(2);
    expect(r1.fs.get(`${DIR}/alpha`)).toEqual({ kind: "symlink", target: ALPHA });

    // narrow the set to beta only — alpha goes, foreign stays
    const r2 = reconcileDir(r1.fs, DIR, [["beta", BETA]]);
    expect(r2.summary.removed).toBe(1);
    expect(r2.fs.has(`${DIR}/alpha`)).toBe(false);
    expect(r2.fs.has(`${DIR}/beta`)).toBe(true);
    expect(r2.fs.has(`${DIR}/foreign-skill`)).toBe(true);

    // idempotent
    const r3 = reconcileDir(r2.fs, DIR, [["beta", BETA]]);
    expect(r3.summary).toEqual({ added: 0, removed: 0, unchanged: 1, skippedConflicts: [] });
  });

  test("never clobbers a foreign name collision", () => {
    const fs = baseFs();
    fs.set(`${DIR}/alpha`, { kind: "dir" }); // user's own dir, managed name
    const r = reconcileDir(fs, DIR, [["alpha", ALPHA]]);
    expect(r.summary.added).toBe(0);
    expect(r.summary.skippedConflicts).toHaveLength(1);
    expect(r.fs.get(`${DIR}/alpha`)).toEqual({ kind: "dir" });
  });

  test("cleans up owned-but-broken links", () => {
    const fs = baseFs();
    fs.set(`${DIR}/ghost`, { kind: "symlink", target: `${STORE_ROOT}/local/ghost` });
    const r = reconcileDir(fs, DIR, [["alpha", ALPHA]]);
    expect(r.fs.has(`${DIR}/ghost`)).toBe(false);
    expect(r.summary.removed).toBe(1);
  });

  test("missing store content is reported, not linked", () => {
    const fs = baseFs();
    fs.delete(ALPHA);
    const r = reconcileDir(fs, DIR, [["alpha", ALPHA]]);
    expect(r.summary.added).toBe(0);
    expect(r.summary.skippedConflicts[0]).toContain("store content missing");
    expect(r.fs.has(`${DIR}/alpha`)).toBe(false);
  });

  test("applySteps replays a run to any point", () => {
    const r = reconcileDir(baseFs(), DIR, [
      ["alpha", ALPHA],
      ["beta", BETA],
    ]);
    const full = applySteps(baseFs(), r.steps, r.steps.length);
    expect(full).toEqual(r.fs);
    const partial = applySteps(baseFs(), r.steps, 0);
    expect(partial.has(`${DIR}/alpha`)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test`
Expected: FAIL — `reconcileDir` is not exported.

- [ ] **Step 3: Implement reconcileDir + applySteps**

Append to `simEngine.ts`:

```ts
export type StepAction =
  | "skip-foreign"
  | "remove-stale"
  | "remove-unwanted"
  | "keep"
  | "create"
  | "conflict"
  | "missing-store";

/** One annotated mutation/decision; drives the step-through animations. */
export interface Step {
  action: StepAction;
  path: string;
  target?: string;
  caption: string;
}

export interface Summary {
  added: number;
  removed: number;
  unchanged: number;
  skippedConflicts: string[];
}

export interface ReconcileResult {
  fs: SimFS;
  steps: Step[];
  summary: Summary;
}

const last = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/**
 * Port of reconcile_dir: the agent dir ends up with exactly one
 * Loadout-owned symlink per target skill. Foreign entries are never touched.
 */
export function reconcileDir(
  input: SimFS,
  dir: string,
  targets: Array<[name: string, storePath: string]>,
): ReconcileResult {
  const fs = new Map(input);
  const steps: Step[] = [];
  const summary: Summary = { added: 0, removed: 0, unchanged: 0, skippedConflicts: [] };
  const dirN = normalize(dir);
  if (!fs.has(dirN)) fs.set(dirN, { kind: "dir" });

  // pass 1: remove loadout-owned links that shouldn't be there (or are stale)
  for (const path of childrenOf(fs, dirN)) {
    const name = last(path);
    if (!isLoadoutOwned(fs, path)) {
      steps.push({
        action: "skip-foreign",
        path,
        caption: `${name}: not a Loadout-owned symlink — never touched`,
      });
      continue;
    }
    const wanted = targets.find(([n]) => n === name);
    const current = (fs.get(path) as Extract<Entry, { kind: "symlink" }>).target;
    if (wanted && current === wanted[1]) {
      steps.push({ action: "keep", path, caption: `${name}: already points at the right store path` });
    } else {
      fs.delete(path);
      if (!wanted) summary.removed += 1;
      steps.push({
        action: wanted ? "remove-stale" : "remove-unwanted",
        path,
        caption: wanted
          ? `${name}: stale target — removed, will be recreated`
          : `${name}: not in this profile — removed`,
      });
    }
  }

  // pass 2: create missing links
  for (const [name, storePath] of targets) {
    const link = `${dirN}/${name}`;
    if (!fs.has(normalize(storePath))) {
      summary.skippedConflicts.push(`${name}: store content missing (${storePath})`);
      steps.push({ action: "missing-store", path: link, caption: `${name}: store content missing — skipped` });
      continue;
    }
    const existing = fs.get(link);
    if (existing && isLoadoutOwned(fs, link)) {
      summary.unchanged += 1;
      steps.push({ action: "keep", path: link, caption: `${name}: correct link already in place` });
    } else if (existing) {
      summary.skippedConflicts.push(`${name}: foreign entry exists in ${dirN}`);
      steps.push({
        action: "conflict",
        path: link,
        caption: `${name}: a foreign entry has this name — never clobbered`,
      });
    } else {
      fs.set(link, { kind: "symlink", target: storePath });
      summary.added += 1;
      steps.push({ action: "create", path: link, target: storePath, caption: `${name} → ${storePath}` });
    }
  }
  return { fs, steps, summary };
}

/** Replay the first `count` steps onto a copy of `input` (for animation). */
export function applySteps(input: SimFS, steps: Step[], count: number): SimFS {
  const fs = new Map(input);
  for (const step of steps.slice(0, count)) {
    if (step.action === "remove-stale" || step.action === "remove-unwanted") fs.delete(step.path);
    if (step.action === "create" && step.target) fs.set(step.path, { kind: "symlink", target: step.target });
  }
  return fs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS (all scenarios).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/HowItWorks/sim/
git commit -m "feat(web): reconcileDir port with step-by-step replay for simulations"
```

---

### Task 3: fixtures

**Files:**
- Create: `apps/web/src/views/HowItWorks/sim/fixtures.ts`
- Test: `apps/web/src/views/HowItWorks/sim/simEngine.test.ts` (one invariant test)

- [ ] **Step 1: Write the failing test**

Append to `simEngine.test.ts`:

```ts
import { CLAUDE_DIR, initialAgentFs, targetsFor } from "./fixtures";

describe("fixtures", () => {
  test("starting state is the writing profile, already in sync", () => {
    const r = reconcileDir(initialAgentFs(), CLAUDE_DIR, targetsFor("writing"));
    expect(r.summary.added).toBe(0);
    expect(r.summary.removed).toBe(0);
    expect(r.summary.unchanged).toBe(2);
    expect(r.summary.skippedConflicts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `fixtures.ts` does not exist.

- [ ] **Step 3: Implement fixtures**

Create `apps/web/src/views/HowItWorks/sim/fixtures.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/HowItWorks/sim/
git commit -m "feat(web): simulation fixtures — skills, profiles, starting filesystem"
```

---

### Task 4: route + post shell + Landing nav link

**Files:**
- Create: `apps/web/src/views/HowItWorks/HowItWorks.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/views/Landing.tsx:29-37` (nav)

- [ ] **Step 1: Create the shell**

Create `apps/web/src/views/HowItWorks/HowItWorks.tsx`. Sections are added by later tasks; the `SECTIONS` array starts empty and each section task appends to it.

```tsx
import { useEffect } from "react";

interface SectionDef {
  n: string;
  title: string;
  body: React.ReactNode;
}

const SECTIONS: SectionDef[] = [];

export function HowItWorks() {
  useEffect(() => {
    document.title = "Loadout — How it works";
    return () => {
      document.title = "Loadout";
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
        <a href="/" className="flex items-baseline gap-2">
          <span className="w-3 h-3 bg-accent rounded-[3px] translate-y-px" />
          <span className="font-bold tracking-tight text-[17px]">Loadout</span>
        </a>
        <nav className="flex items-center gap-5 text-[13.5px]">
          <a href="/#share" className="text-ink-soft hover:text-ink">Share a loadout</a>
          <a
            href="https://github.com/Rohithgilla12/loadout"
            className="border border-line-strong rounded px-3 py-1 hover:border-ink-faint font-medium"
          >
            ★ Star on GitHub
          </a>
        </nav>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 blueprint" aria-hidden />
        <div className="relative max-w-3xl mx-auto px-6 pt-14 pb-16">
          <div className="rise-in font-mono text-[12px] text-accent-deep tracking-wide mb-4">
            ENGINEERING · JUNE 2026
          </div>
          <h1 className="rise-in rise-in-1 text-[clamp(2rem,4.5vw,3rem)] leading-[1.06] font-bold tracking-[-0.03em]">
            How Loadout works
          </h1>
          <p className="rise-in rise-in-2 text-[16px] text-ink-soft mt-5 max-w-xl leading-relaxed">
            Loadout turns your pile of agent skills into switchable profiles. This post follows one
            skill through the whole machine — the store, the lockfile, the symlink reconciler, and
            the sharing format. Every diagram below is <strong className="text-ink font-semibold">live</strong>:
            the simulations run the same algorithm as the app, ported line-for-line from the Rust.
          </p>
        </div>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.n} className="max-w-3xl mx-auto px-6 py-12 border-t border-line">
          <div className="font-mono text-[12px] text-accent-deep mb-2">§{s.n}</div>
          <h2 className="text-[24px] font-bold tracking-tight mb-5">{s.title}</h2>
          {s.body}
        </section>
      ))}

      <section className="border-t border-line bg-paper-sunken/60">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <h2 className="text-[22px] font-bold tracking-tight">That's the whole machine.</h2>
          <p className="text-[14px] text-ink-soft mt-2 max-w-lg">
            A content store, a lockfile, a two-pass reconciler with one strict ownership rule, and a
            URL format. If it earns a spot in your kit:
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <a
              href="https://github.com/Rohithgilla12/loadout/releases"
              className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-5 py-2.5 rounded-md text-[14px] transition-colors"
            >
              Download Loadout
            </a>
            <a
              href="https://github.com/Rohithgilla12/loadout"
              className="border border-ink rounded-md px-5 py-2.5 font-semibold text-[14px] hover:bg-ink hover:text-paper transition-colors"
            >
              Read the source
            </a>
            <a href="/#share" className="text-[14px] text-accent-deep underline underline-offset-2">
              Share your loadout →
            </a>
          </div>
        </div>
      </section>

      <footer className="max-w-3xl mx-auto px-6 py-8 text-[12.5px] text-ink-faint">
        MIT licensed. Built in the open by{" "}
        <a className="text-ink-soft hover:text-ink underline underline-offset-2" href="https://github.com/Rohithgilla12">
          Rohith Gilla
        </a>
        .
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Route it in App.tsx**

In `apps/web/src/App.tsx`, add the import and a pathname check before the slug check:

```tsx
import { HowItWorks } from "./views/HowItWorks/HowItWorks";
```

and inside `App()`, first line of the return logic:

```tsx
  if (location.pathname === "/how-it-works") return <HowItWorks />;
  if (slug) return <ShortShare slug={slug} />;
```

- [ ] **Step 3: Add the nav link on Landing**

In `apps/web/src/views/Landing.tsx`, inside the `<nav>` (line ~30), before the "Share a loadout" link:

```tsx
          <a href="/how-it-works" className="text-ink-soft hover:text-ink">How it works</a>
```

- [ ] **Step 4: Build check**

Run: `pnpm --filter web build`
Expected: clean `tsc` + vite build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/views/Landing.tsx apps/web/src/views/HowItWorks/HowItWorks.tsx
git commit -m "feat(web): /how-it-works route, post shell, landing nav link"
```

---

### Task 5: shared UI primitives

**Files:**
- Create: `apps/web/src/views/HowItWorks/ui/Prose.tsx`
- Create: `apps/web/src/views/HowItWorks/ui/CodeFold.tsx`
- Create: `apps/web/src/views/HowItWorks/ui/Terminal.tsx`
- Create: `apps/web/src/views/HowItWorks/ui/FileTree.tsx`
- Create: `apps/web/src/views/HowItWorks/ui/StepPlayer.tsx`

- [ ] **Step 1: Prose**

```tsx
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[14.5px] text-ink-soft leading-relaxed space-y-4 max-w-xl mb-6 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:bg-paper-sunken [&_code]:border [&_code]:border-line [&_code]:rounded [&_code]:px-1 [&_strong]:text-ink [&_strong]:font-semibold">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: CodeFold**

```tsx
export function CodeFold({ title, code, lang = "rust" }: { title: string; code: string; lang?: string }) {
  return (
    <details className="border border-line rounded-lg bg-paper-raised mt-5">
      <summary className="px-3 py-2 text-[12.5px] font-mono text-ink-soft cursor-pointer select-none hover:text-ink">
        <span className="text-accent-deep">{"</>"}</span> {title}{" "}
        <span className="text-ink-faint">· {lang} · verbatim from the repo</span>
      </summary>
      <pre className="px-4 py-3 border-t border-line overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
        {code}
      </pre>
    </details>
  );
}
```

- [ ] **Step 3: Terminal**

```tsx
export interface TermLine {
  text: string;
  tone?: "ok" | "drift" | "dim" | "cmd";
}

const TONE: Record<string, string> = {
  ok: "text-[oklch(0.75_0.12_150)]",
  drift: "text-[oklch(0.72_0.17_30)]",
  dim: "text-[oklch(0.55_0.01_70)]",
  cmd: "text-[oklch(0.92_0.005_80)]",
};

export function Terminal({ lines, title = "ci" }: { lines: TermLine[]; title?: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-line-strong bg-[oklch(0.18_0.008_60)] shadow-[0_12px_40px_-18px_rgb(0_0_0/0.4)]">
      <div className="px-3 py-1.5 flex items-center gap-1.5 border-b border-[oklch(0.28_0.01_60)]">
        <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.35_0.01_60)]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.35_0.01_60)]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[oklch(0.35_0.01_60)]" />
        <span className="ml-2 text-[11px] font-mono text-[oklch(0.55_0.01_70)]">{title}</span>
      </div>
      <pre className="px-4 py-3 text-[12px] leading-[1.7] font-mono whitespace-pre-wrap">
        {lines.map((l, i) => (
          <div key={i} className={TONE[l.tone ?? "dim"]}>
            {l.text}
          </div>
        ))}
      </pre>
    </div>
  );
}
```

- [ ] **Step 4: FileTree**

```tsx
import { type SimFS, childrenOf, isLoadoutOwned, normalize } from "../sim/simEngine";

export function FileTree({
  fs,
  dir,
  label,
  highlight,
}: {
  fs: SimFS;
  dir: string;
  label?: string;
  highlight?: string | null;
}) {
  const rows = childrenOf(fs, dir);
  return (
    <div className="border border-line rounded-lg bg-paper-raised overflow-hidden">
      <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
        {(label ?? dir).replace("/home/you/", "~/")}/
      </div>
      <div className="p-2 flex flex-col gap-1 min-h-[64px]">
        {rows.length === 0 && <div className="text-[12px] text-ink-faint px-2 py-1">(empty)</div>}
        {rows.map((path) => (
          <Row key={path} fs={fs} path={path} highlighted={highlight === path} />
        ))}
      </div>
    </div>
  );
}

function Row({ fs, path, highlighted }: { fs: SimFS; path: string; highlighted: boolean }) {
  const entry = fs.get(path)!;
  const name = path.slice(path.lastIndexOf("/") + 1);
  const owned = isLoadoutOwned(fs, path);
  const broken = entry.kind === "symlink" && !fs.has(normalize(entry.target));
  return (
    <div
      className={`flex items-center gap-2 font-mono text-[12px] px-2 py-1 rounded border transition-colors ${
        highlighted ? "border-accent bg-accent-wash" : "border-line bg-paper-sunken"
      }`}
    >
      <span className={owned ? "text-accent-deep" : "text-ink-faint"}>
        {entry.kind === "symlink" ? "→" : entry.kind === "dir" ? "▸" : "·"}
      </span>
      <span className="truncate">{name}</span>
      {entry.kind === "symlink" && (
        <span className="text-ink-faint text-[10.5px] truncate hidden sm:inline">
          {entry.target.replace("/home/you/", "~/")}
        </span>
      )}
      <span className="ml-auto text-[10px] uppercase tracking-wide shrink-0">
        {owned ? (
          broken ? (
            <span className="text-warn">owned · broken</span>
          ) : (
            <span className="text-ink-faint">owned</span>
          )
        ) : (
          <span className="text-ok">yours</span>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: StepPlayer**

```tsx
import { useEffect, useState } from "react";
import type { Step } from "../sim/simEngine";

export function StepPlayer({
  steps,
  index,
  onIndexChange,
}: {
  steps: Step[];
  index: number;
  onIndexChange: (i: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    if (index >= steps.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => onIndexChange(index + 1), 900);
    return () => clearTimeout(t);
  }, [playing, index, steps.length, onIndexChange]);

  const current = index > 0 ? steps[index - 1] : null;
  const btn =
    "border border-line-strong rounded px-2.5 py-1 text-[12px] font-medium hover:border-ink-faint disabled:opacity-40 disabled:cursor-default";
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <button className={btn} onClick={() => { setPlaying(false); onIndexChange(0); }} disabled={index === 0}>
          ⏮ reset
        </button>
        <button
          className={btn}
          onClick={() => { setPlaying(false); onIndexChange(Math.max(0, index - 1)); }}
          disabled={index === 0}
        >
          ◀
        </button>
        <button
          className={btn}
          onClick={() => { setPlaying(false); onIndexChange(Math.min(steps.length, index + 1)); }}
          disabled={index >= steps.length}
        >
          step ▶
        </button>
        <button className={btn} onClick={() => setPlaying(!playing)} disabled={index >= steps.length}>
          {playing ? "❚❚ pause" : "▶ play"}
        </button>
        <span className="font-mono text-[11.5px] text-ink-faint ml-auto">
          {index} / {steps.length}
        </span>
      </div>
      <div className="mt-2 min-h-[20px] text-[12.5px] text-ink-soft font-mono">
        {current ? current.caption : steps.length ? "press play to run both passes" : ""}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/ui/
git commit -m "feat(web): how-it-works UI primitives — FileTree, StepPlayer, Terminal, CodeFold, Prose"
```

---

### Task 6: Rust snippets file

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/snippets.ts`

- [ ] **Step 1: Create snippets**

Quote real code from `crates/loadout-core/src/`. Copy the current text of each function from the repo when writing this file (do not retype from this plan — read the source files); the snippets below show which spans:

```ts
// Verbatim quotes from crates/loadout-core/src — keep in sync by copying,
// not paraphrasing. Each constant names its origin.

/** apply.rs: is_loadout_owned — the single ownership rule. */
export const SNIPPET_OWNERSHIP = `...apply.rs lines 9-28 verbatim...`;

/** apply.rs: reconcile_dir pass 1 + pass 2 (lines 59-115). */
export const SNIPPET_RECONCILE = `...apply.rs lines 59-115 verbatim...`;

/** store.rs: copy_into_store — immutable per (source, rev) (lines 91-101). */
export const SNIPPET_STORE = `...store.rs lines 91-101 verbatim...`;

/** apply.rs: journal write in apply_scope (lines 146-155) + recover_if_needed (lines 205-214). */
export const SNIPPET_JOURNAL = `...both spans verbatim, separated by a blank line and a // — comment...`;

/** apply.rs tests: never_clobbers_foreign_name_collision (lines 636-654). */
export const SNIPPET_CLOBBER_TEST = `...verbatim...`;
```

- [ ] **Step 2: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/sections/snippets.ts
git commit -m "feat(web): verbatim rust snippets for code folds"
```

---

### Task 7: §1 The problem

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/Problem.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx` (register section)

- [ ] **Step 1: Implement the section**

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";

const PILE = [
  "frontend-design", "tailwind", "react-best-practices", "testing-guidelines",
  "doc-coauthoring", "internal-comms", "go-concurrency", "grpc-conventions",
  "sql-migrations", "k8s-debugging", "terraform", "pdf-tools", "xlsx", "pptx",
  "brand-guidelines", "security-review", "api-design", "changelog-writing",
  "i18n", "accessibility", "performance", "code-review", "commit-style",
  "release-notes", "slack-gif-creator", "data-viz", "prompt-engineering",
  "mcp-builder", "cli-design", "video-editing",
];

const AGENT_DIRS = ["~/.claude/skills", "~/.cursor/skills", "~/.agents/skills"];

export function Problem() {
  const [dir, setDir] = useState(0);
  return (
    <div>
      <Prose>
        <p>
          Agent skills are great until you have thirty of them. Every installed skill is injected
          into <strong>every session of every agent</strong> — your React design guidelines tag
          along while you write Go, your PowerPoint skill rides shotgun in a Rust refactor. They
          burn context tokens, and overlapping descriptions degrade skill triggering. The only off
          switch today is uninstalling.
        </p>
        <p>Click through the agent directories. Notice anything?</p>
      </Prose>

      <div className="flex gap-1.5 mb-3">
        {AGENT_DIRS.map((d, i) => (
          <button
            key={d}
            onClick={() => setDir(i)}
            className={
              dir === i
                ? "bg-accent text-paper-raised text-[12px] font-mono px-3 py-1 rounded-full"
                : "border border-line-strong text-ink-soft hover:text-ink text-[12px] font-mono px-3 py-1 rounded-full"
            }
          >
            {d}
          </button>
        ))}
      </div>

      <div key={dir} className="border border-line rounded-lg bg-paper-raised p-3">
        <div className="flex flex-wrap gap-1.5">
          {PILE.map((s, i) => (
            <span
              key={s}
              className="rise-in font-mono text-[11px] px-2 py-0.5 rounded border border-accent/40 bg-accent-wash text-accent-deep"
              style={{ animationDelay: `${i * 0.012}s` }}
            >
              ● {s}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 rounded-full bg-paper-sunken border border-line overflow-hidden">
            <div className="h-full w-full bg-accent" />
          </div>
          <span className="font-mono text-[11.5px] text-ink-soft shrink-0">30/30 active, every session</span>
        </div>
      </div>

      <Prose>
        <p className="mt-6">
          Same pile, every directory, all lit. Loadout's answer is{" "}
          <strong>profiles</strong> — named skill sets you switch between — backed by three pieces
          of machinery: a store, a lockfile, and a reconciler. The rest of this post walks one
          skill, <code>frontend-design</code>, through all three.
        </p>
      </Prose>
    </div>
  );
}
```

- [ ] **Step 2: Register in HowItWorks.tsx**

```tsx
import { Problem } from "./sections/Problem";

const SECTIONS: SectionDef[] = [
  { n: "1", title: "Thirty skills. All of them. All the time.", body: <Problem /> },
];
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §1 — the all-on problem"
```

---

### Task 8: §2 Install → the store

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/StoreInstall.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";
import { CodeFold } from "../ui/CodeFold";
import { SNIPPET_STORE } from "./snippets";

const LOCK_ENTRY = `{
  "frontend-design": {
    "name": "frontend-design",
    "source": "github.com/anthropics/skills",
    "url": "https://github.com/anthropics/skills.git",
    "rev": "9b1f3c2",
    "track": "pinned",
    "description": "Create distinctive, production-grade interfaces",
    "installed_at": "2026-06-11T09:14:02Z"
  }
}`;

function TreeLine({ depth, text, on, ghost }: { depth: number; text: string; on?: boolean; ghost?: boolean }) {
  return (
    <div
      className={`font-mono text-[12px] leading-[1.8] ${on ? "rise-in text-ink" : ghost ? "text-ink-faint/40" : "text-ink-soft"}`}
      style={{ paddingLeft: depth * 16 }}
    >
      {text}
    </div>
  );
}

export function StoreInstall() {
  // 0 = not installed, 1 = installed, 2 = second install attempted
  const [stage, setStage] = useState(0);
  return (
    <div>
      <Prose>
        <p>
          Installing a skill never copies it into an agent directory. Content goes to one place:
          the store at <code>~/.loadout/store</code>, addressed by{" "}
          <strong>(source, revision, name)</strong>. A skill fetched from a git repo lands under
          the exact commit it came from; skills you wrote yourself live under{" "}
          <code>local/</code>.
        </p>
        <p>
          Store content is <strong>immutable per (source, rev)</strong>. Install the same skill at
          the same revision twice — from two profiles, two projects, whatever — and the second
          install is a no-op. Try it:
        </p>
      </Prose>

      <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="border border-line rounded-lg bg-paper-raised p-4 w-full sm:w-56">
          <div className="font-mono text-[13px] font-medium">frontend-design</div>
          <div className="text-[11.5px] text-ink-faint mt-0.5">github.com/anthropics/skills</div>
          <div className="font-mono text-[11px] text-ink-faint">@ 9b1f3c2</div>
          <button
            onClick={() => setStage(stage === 0 ? 1 : 2)}
            className="mt-3 w-full bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-3 py-1.5 rounded text-[12.5px] transition-colors"
          >
            {stage === 0 ? "Install" : "Install again"}
          </button>
          {stage === 2 && (
            <div className="rise-in mt-2 text-[11.5px] font-mono text-ok">
              already exists — 0 bytes copied
            </div>
          )}
        </div>

        <div className="border border-line rounded-lg bg-paper-raised overflow-hidden">
          <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
            ~/.loadout/store/
          </div>
          <div className="p-3">
            <TreeLine depth={0} text="github.com/anthropics/skills/" ghost={stage === 0} />
            <TreeLine depth={1} text="9b1f3c2/" ghost={stage === 0} />
            {stage > 0 && <TreeLine depth={2} text="frontend-design/" on />}
            {stage > 0 && <TreeLine depth={3} text="SKILL.md" on />}
            <TreeLine depth={0} text="github.com/vercel-labs/agent-skills/" />
            <TreeLine depth={1} text="4e8d7aa/vercel-react-best-practices/" />
            <TreeLine depth={0} text="local/" />
            <TreeLine depth={1} text="internal-comms/" />
          </div>
        </div>
      </div>

      {stage > 0 && (
        <div className="rise-in mt-4 border border-line rounded-lg bg-paper-raised overflow-hidden">
          <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
            ~/.loadout/lock.json — new entry
          </div>
          <pre className="px-4 py-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
            {LOCK_ENTRY}
          </pre>
        </div>
      )}

      <CodeFold title="store.rs · copy_into_store" code={SNIPPET_STORE} />
    </div>
  );
}
```

- [ ] **Step 2: Register section**

In `HowItWorks.tsx`:

```tsx
import { StoreInstall } from "./sections/StoreInstall";
// in SECTIONS:
  { n: "2", title: "Install puts content in one place: the store", body: <StoreInstall /> },
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §2 — content store with immutability demo"
```

---

### Task 9: §3 The lockfile

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/Lockfile.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";

const OLD_REV = "9b1f3c2";
const NEW_REV = "4e8d7aa";

export function Lockfile() {
  const [rev, setRev] = useState(OLD_REV);
  const [prevRev, setPrevRev] = useState<string | null>(null);
  const [track, setTrack] = useState<"pinned" | "latest">("pinned");

  const entry = {
    name: "frontend-design",
    source: "github.com/anthropics/skills",
    rev,
    ...(prevRev ? { prev_rev: prevRev } : {}),
    track,
  };

  const btn =
    "border border-line-strong rounded px-3 py-1.5 text-[12.5px] font-medium hover:border-ink-faint disabled:opacity-40 disabled:cursor-default";

  return (
    <div>
      <Prose>
        <p>
          The lockfile is the contract: every skill is <strong>pinned by default</strong> to the
          commit it was installed from. Upstream pushing a new prompt-injection masterpiece to a
          skill repo does not change what runs on your machine. Updates are explicit — and when you
          take one, the previous revision is kept as <code>prev_rev</code> so rollback is one
          click, not an archaeology project.
        </p>
      </Prose>

      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          className={btn}
          disabled={rev === NEW_REV}
          onClick={() => {
            setPrevRev(rev);
            setRev(NEW_REV);
          }}
        >
          ⬆ Update available → apply
        </button>
        <button
          className={btn}
          disabled={!prevRev}
          onClick={() => {
            const back = prevRev!;
            setPrevRev(rev);
            setRev(back);
          }}
        >
          ↩ Roll back
        </button>
        <button className={btn} onClick={() => setTrack(track === "pinned" ? "latest" : "pinned")}>
          track: {track} — toggle
        </button>
      </div>

      <div className="border border-line rounded-lg bg-paper-raised overflow-hidden">
        <div className="px-3 py-1.5 border-b border-line font-mono text-[11.5px] text-ink-faint">
          ~/.loadout/lock.json
        </div>
        <pre className="px-4 py-3 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
          {JSON.stringify({ skills: { "frontend-design": entry } }, null, 2)}
        </pre>
      </div>

      <Prose>
        <p className="mt-5">
          Because the store keeps each revision at its own path, "rollback" is not a download — both
          revisions are already on disk. Updating just changes which store path the lockfile points
          at. The next section is about who turns that pointer into reality.
        </p>
      </Prose>
    </div>
  );
}
```

- [ ] **Step 2: Register section**

```tsx
import { Lockfile } from "./sections/Lockfile";
  { n: "3", title: "The lockfile: pinned by default, rollback for free", body: <Lockfile /> },
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §3 — lockfile with working update/rollback"
```

---

### Task 10: §4 Reconcile (the centerpiece)

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/Reconcile.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

```tsx
import { useMemo, useState } from "react";
import { Prose } from "../ui/Prose";
import { CodeFold } from "../ui/CodeFold";
import { FileTree } from "../ui/FileTree";
import { StepPlayer } from "../ui/StepPlayer";
import { applySteps, reconcileDir, type SimFS } from "../sim/simEngine";
import { CLAUDE_DIR, initialAgentFs, targetsFor } from "../sim/fixtures";
import { SNIPPET_OWNERSHIP, SNIPPET_RECONCILE } from "./snippets";

const PROFILE_CHOICES = ["writing", "frontend", "everything"];

export function Reconcile() {
  const [fsBase, setFsBase] = useState<SimFS>(initialAgentFs);
  const [profile, setProfile] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  const result = useMemo(
    () => (profile ? reconcileDir(fsBase, CLAUDE_DIR, targetsFor(profile)) : null),
    [fsBase, profile],
  );
  const visible = result ? applySteps(fsBase, result.steps, index) : fsBase;
  const highlight = result && index > 0 ? result.steps[index - 1].path : null;
  const done = result !== null && index >= result.steps.length;

  function pick(p: string) {
    // commit whatever the previous run would have done, then start fresh
    setFsBase(result ? result.fs : fsBase);
    setProfile(p);
    setIndex(0);
  }

  return (
    <div>
      <Prose>
        <p>
          Agent directories like <code>~/.claude/skills</code> contain <strong>symlinks into the
          store</strong> — that's all "active" means. Switching profiles runs a reconciler that
          makes the directory contain exactly one link per skill in the profile. It has two passes
          and one rule.
        </p>
        <p>
          <strong>The rule:</strong> Loadout owns an entry if and only if it is a symlink whose
          target resolves into the store. The resolution is lexical, so a broken link (store
          content pruned) is still owned and still cleaned up. Everything else — your files, your
          dirs, your symlinks to somewhere else — is <strong>foreign, and never touched</strong>.
        </p>
        <p>
          <strong>Pass 1</strong> walks the directory and removes owned links that shouldn't be
          there. <strong>Pass 2</strong> creates the missing ones. Below is a real starting state:
          the <code>writing</code> profile applied, plus two foreign entries (<code>my-notes</code>,{" "}
          <code>team-link</code>). Pick a profile and step through:
        </p>
      </Prose>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {PROFILE_CHOICES.map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            className={
              profile === p
                ? "bg-accent text-paper-raised text-[12.5px] font-medium px-3 py-1 rounded-full"
                : "border border-line-strong text-ink-soft hover:text-ink text-[12.5px] px-3 py-1 rounded-full"
            }
          >
            switch to {p}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_minmax(220px,260px)] gap-4 items-start">
        <FileTree fs={visible} dir={CLAUDE_DIR} highlight={highlight} />
        <div>
          {result ? (
            <StepPlayer steps={result.steps} index={index} onIndexChange={setIndex} />
          ) : (
            <div className="text-[12.5px] text-ink-faint">pick a profile to run reconcile</div>
          )}
          {done && result && (
            <div className="rise-in mt-3 font-mono text-[11.5px] text-ink-soft border border-line rounded p-2 bg-paper-sunken">
              ApplySummary {"{"} added: {result.summary.added}, removed: {result.summary.removed},
              unchanged: {result.summary.unchanged}, conflicts: {result.summary.skippedConflicts.length} {"}"}
            </div>
          )}
        </div>
      </div>

      <Prose>
        <p className="mt-6">
          Three properties fall out of this design. It's <strong>idempotent</strong> — running it
          twice is a no-op, which is what makes crash recovery trivial (next section). It's{" "}
          <strong>non-destructive</strong> — the ownership rule means there is no code path that
          deletes a file Loadout didn't create. And it's <strong>instant</strong> — switching
          profiles rewrites a handful of symlinks, no copying.
        </p>
      </Prose>

      <CodeFold title="apply.rs · is_loadout_owned" code={SNIPPET_OWNERSHIP} />
      <CodeFold title="apply.rs · reconcile_dir (both passes)" code={SNIPPET_RECONCILE} />
    </div>
  );
}
```

- [ ] **Step 2: Register section**

```tsx
import { Reconcile } from "./sections/Reconcile";
  { n: "4", title: "Reconcile: two passes, one ownership rule", body: <Reconcile /> },
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §4 — step-through reconcile simulation"
```

---

### Task 11: §5 Try to break it

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/BreakIt.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";
import { CodeFold } from "../ui/CodeFold";
import { FileTree } from "../ui/FileTree";
import {
  applySteps,
  childrenOf,
  isLoadoutOwned,
  normalize,
  reconcileDir,
  type SimFS,
  type Summary,
  HOME,
} from "../sim/simEngine";
import { CLAUDE_DIR, SKILLS, initialAgentFs, storePathFor, targetsFor } from "../sim/fixtures";
import { SNIPPET_JOURNAL, SNIPPET_CLOBBER_TEST } from "./snippets";

/** Names of entries in the agent dir that Loadout does NOT own. */
function foreignNames(fs: SimFS): Set<string> {
  return new Set(
    childrenOf(fs, CLAUDE_DIR)
      .filter((p) => !isLoadoutOwned(fs, p))
      .map((p) => p.slice(p.lastIndexOf("/") + 1)),
  );
}

export function BreakIt() {
  const [fs, setFs] = useState<SimFS>(initialAgentFs);
  const [name, setName] = useState("frontend-design");
  const [journal, setJournal] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [runs, setRuns] = useState(0);
  const [eaten, setEaten] = useState(0);

  function plant(kind: "file" | "dir" | "symlink") {
    const clean = name.trim().replace(/[/\s]/g, "-") || "my-file";
    const path = `${CLAUDE_DIR}/${clean}`;
    if (fs.has(normalize(path))) return;
    const next = new Map(fs);
    next.set(
      path,
      kind === "symlink" ? { kind: "symlink", target: `${HOME}/elsewhere/${clean}` } : { kind },
    );
    setFs(next);
  }

  function deleteFromStore(skillName: string) {
    const skill = SKILLS.find((s) => s.name === skillName)!;
    const next = new Map(fs);
    next.delete(normalize(storePathFor(skill)));
    setFs(next);
  }

  function run(from: SimFS): SimFS {
    const before = foreignNames(from);
    const r = reconcileDir(from, CLAUDE_DIR, targetsFor("frontend"));
    const after = foreignNames(r.fs);
    let lost = 0;
    for (const n of before) if (!after.has(n)) lost += 1;
    setEaten((e) => e + lost);
    setRuns((n) => n + 1);
    setSummary(r.summary);
    setFs(r.fs);
    return r.fs;
  }

  function killMidApply() {
    const r = reconcileDir(fs, CLAUDE_DIR, targetsFor("frontend"));
    setFs(applySteps(fs, r.steps, Math.ceil(r.steps.length / 2)));
    setSummary(null);
    setJournal(true);
  }

  const btn =
    "border border-line-strong rounded px-3 py-1.5 text-[12.5px] font-medium hover:border-ink-faint disabled:opacity-40";

  return (
    <div>
      <Prose>
        <p>
          A tool that deletes symlinks in <code>~/.claude/skills</code> has exactly one
          release-blocking requirement: <strong>it must never delete anything that's yours</strong>.
          This sandbox runs the real algorithm against the <code>frontend</code> profile. Plant
          files. Name one <code>frontend-design</code> so it collides with a managed skill. Delete
          content out from under the store. Kill an apply halfway. The scoreboard is at the bottom.
        </p>
      </Prose>

      <div className="border border-line rounded-lg bg-paper-raised p-3 mb-4 flex flex-col gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-line-strong rounded px-2.5 py-1.5 font-mono text-[12.5px] bg-paper w-44"
            aria-label="name for your planted entry"
          />
          <button className={btn} onClick={() => plant("file")}>plant file</button>
          <button className={btn} onClick={() => plant("dir")}>plant dir</button>
          <button className={btn} onClick={() => plant("symlink")}>plant symlink → ~/elsewhere</button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {targetsFor("frontend").map(([n]) => (
            <button key={n} className={btn} onClick={() => deleteFromStore(n)}>
              rm store copy of {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            className="bg-accent hover:bg-accent-deep text-paper-raised font-semibold px-4 py-1.5 rounded text-[12.5px]"
            onClick={() => { setJournal(false); run(fs); }}
          >
            run apply (frontend)
          </button>
          <button className={btn} onClick={killMidApply} disabled={journal}>
            ⚡ kill it mid-apply
          </button>
          {journal && (
            <button className="rise-in border border-warn rounded px-3 py-1.5 text-[12.5px] font-medium text-warn" onClick={() => { setJournal(false); run(fs); }}>
              ↻ relaunch app (journal found → re-apply)
            </button>
          )}
        </div>
      </div>

      <FileTree fs={fs} dir={CLAUDE_DIR} />

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px] text-ink-soft">
        <span>applies run: {runs}</span>
        <span className="text-ok font-semibold">your files eaten: {eaten}</span>
        {journal && <span className="text-warn">journal on disk — apply incomplete</span>}
        {summary && summary.skippedConflicts.length > 0 && (
          <span className="basis-full text-warn">
            skipped_conflicts: {summary.skippedConflicts.join(" · ")}
          </span>
        )}
      </div>

      <Prose>
        <p className="mt-6">
          Two mechanisms are doing the work. The name collision and store-deletion cases fall out of
          pass 2: a foreign entry with a managed name is reported in{" "}
          <code>skipped_conflicts</code>, never replaced; missing store content is reported, never
          half-linked. The kill case is the <strong>journal</strong>: Loadout writes its intent to
          disk before mutating anything, and on launch a leftover journal means "re-apply
          everything" — safe precisely because reconcile is idempotent.
        </p>
      </Prose>

      <CodeFold title="apply.rs · journal write + recover_if_needed" code={SNIPPET_JOURNAL} />
      <CodeFold title="apply.rs · the never-clobber test" code={SNIPPET_CLOBBER_TEST} />
    </div>
  );
}
```

- [ ] **Step 2: Register section**

```tsx
import { BreakIt } from "./sections/BreakIt";
  { n: "5", title: "Try to break it", body: <BreakIt /> },
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §5 — try-to-break-it sandbox with journal recovery"
```

---

### Task 12: §6 Profiles & switching

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/Profiles.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";
import { FileTree } from "../ui/FileTree";
import { reconcileDir, type SimFS } from "../sim/simEngine";
import { AGENTS_DIR, CLAUDE_DIR, PROFILES, multiAgentFs, targetsFor } from "../sim/fixtures";

export function Profiles() {
  const [fs, setFs] = useState<SimFS>(multiAgentFs);
  const [active, setActive] = useState("writing");
  const [last, setLast] = useState<string | null>(null);

  function switchTo(p: string) {
    const targets = targetsFor(p);
    const r1 = reconcileDir(fs, CLAUDE_DIR, targets);
    const r2 = reconcileDir(r1.fs, AGENTS_DIR, targets);
    setFs(r2.fs);
    setActive(p);
    const added = r1.summary.added + r2.summary.added;
    const removed = r1.summary.removed + r2.summary.removed;
    setLast(`2 dirs reconciled · +${added} −${removed}`);
  }

  return (
    <div>
      <Prose>
        <p>
          A <strong>profile</strong> is just an ordered list of skill names — <code>writing</code>,{" "}
          <code>frontend</code>, <code>everything</code>. Switching means running the §4 reconciler
          once per detected agent directory, with the profile's skills as targets. One click, every
          agent, same kit:
        </p>
      </Prose>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {Object.keys(PROFILES).map((p) => (
          <button
            key={p}
            onClick={() => switchTo(p)}
            className={
              active === p
                ? "bg-accent text-paper-raised text-[12.5px] font-medium px-3 py-1 rounded-full"
                : "border border-line-strong text-ink-soft hover:text-ink text-[12.5px] px-3 py-1 rounded-full"
            }
          >
            {p} · {PROFILES[p].length} skills
          </button>
        ))}
        {last && <span className="font-mono text-[11.5px] text-ink-faint self-center ml-2">{last}</span>}
      </div>

      <div key={active} className="grid md:grid-cols-2 gap-4">
        <FileTree fs={fs} dir={CLAUDE_DIR} />
        <FileTree fs={fs} dir={AGENTS_DIR} />
      </div>

      <Prose>
        <p className="mt-6">
          Two scopes exist. A <strong>base profile</strong> applies to global agent dirs like the
          ones above. A project can additionally get its own profile, materialized into the repo's
          agent dirs (<code>.claude/skills</code> inside the project) — and{" "}
          <strong>only</strong> the project profile goes there. Base skills stay global, because
          agents already merge global and project directories; duplicating them into every repo
          would just pollute it with symlinks.
        </p>
      </Prose>
    </div>
  );
}
```

- [ ] **Step 2: Register section**

```tsx
import { Profiles } from "./sections/Profiles";
  { n: "6", title: "Profiles: one switch, every agent", body: <Profiles /> },
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §6 — profile switching across agent dirs"
```

---

### Task 13: §7 Sharing (runs production code)

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/Sharing.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

Note the import path: production share code lives at `apps/web/src/lib/share.ts`, three levels up from `sections/`.

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";
import {
  decodeLoadout,
  encodeLoadout,
  toLoadoutJson,
  type SharedLoadout,
} from "../../../lib/share";
import { PROFILES, SKILLS } from "../sim/fixtures";

export function Sharing() {
  const [selected, setSelected] = useState<Set<string>>(new Set(PROFILES.frontend));
  const [tab, setTab] = useState<"url" | "decoded" | "json">("url");

  const loadout: SharedLoadout = {
    by: "you",
    profile: "frontend",
    skills: SKILLS.filter((s) => selected.has(s.name)).map((s) => ({
      source: s.source,
      skill: s.name,
      ...(s.rev ? { rev: s.rev } : {}),
    })),
  };
  const encoded = encodeLoadout(loadout);
  const url = `https://loadout.gilla.fun/#L=${encoded}`;

  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  }

  const tabBtn = (t: typeof tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={
        tab === t
          ? "bg-ink text-paper text-[12px] font-medium px-3 py-1 rounded-t"
          : "text-ink-soft hover:text-ink text-[12px] px-3 py-1"
      }
    >
      {label}
    </button>
  );

  return (
    <div>
      <Prose>
        <p>
          "Share your loadout" had one design constraint: <strong>no accounts, no database, no
          server reads your skill list</strong>. So the entire loadout travels in the URL fragment —{" "}
          <code>#L=</code> followed by base64url-encoded JSON. Fragments are never sent in HTTP
          requests; the receiving page decodes everything client-side.
        </p>
        <p>
          This demo is not a mock. It imports <code>encodeLoadout</code> and{" "}
          <code>decodeLoadout</code> from the same <code>lib/share.ts</code> the share page uses.
          Toggle skills and watch the fragment change:
        </p>
      </Prose>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {SKILLS.map((s) => (
          <button
            key={s.name}
            onClick={() => toggle(s.name)}
            className={
              selected.has(s.name)
                ? "bg-accent text-paper-raised text-[11.5px] font-mono px-2.5 py-1 rounded-full"
                : "border border-line-strong text-ink-faint hover:text-ink text-[11.5px] font-mono px-2.5 py-1 rounded-full"
            }
          >
            {selected.has(s.name) ? "✓ " : ""}{s.name}
          </button>
        ))}
      </div>

      <div>
        <div className="flex gap-1 border-b border-line">
          {tabBtn("url", "share URL")}
          {tabBtn("decoded", "decoded")}
          {tabBtn("json", "loadout.json")}
        </div>
        <div className="border border-t-0 border-line rounded-b-lg bg-paper-raised">
          {tab === "url" && (
            <div className="p-4">
              <div className="font-mono text-[11.5px] leading-relaxed break-all text-ink-soft">
                <span className="text-ink-faint">https://loadout.gilla.fun/</span>
                <span className="text-accent-deep">#L=</span>
                {encoded}
              </div>
              <a
                href={`/#L=${encoded}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-3 text-[12.5px] text-accent-deep underline underline-offset-2"
              >
                open this link for real →
              </a>
              <span className="ml-3 font-mono text-[11px] text-ink-faint">{url.length} chars</span>
            </div>
          )}
          {tab === "decoded" && (
            <pre className="p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
              {JSON.stringify(decodeLoadout(encoded), null, 2)}
            </pre>
          )}
          {tab === "json" && (
            <pre className="p-4 overflow-x-auto text-[12px] leading-relaxed font-mono text-ink-soft">
              {toLoadoutJson(loadout)}
            </pre>
          )}
        </div>
      </div>

      <Prose>
        <p className="mt-6">
          The <code>loadout.json</code> tab is the team story: commit that file to a repo and{" "}
          <code>loadout apply</code> gives every teammate the identical, rev-pinned skill set. For
          prettier links there's an optional short-link API (<code>/s/your-slug</code>, Workers KV,
          immutable once created) — but the fragment format means sharing works even if that server
          disappears.
        </p>
      </Prose>
    </div>
  );
}
```

- [ ] **Step 2: Register section**

```tsx
import { Sharing } from "./sections/Sharing";
  { n: "7", title: "Sharing: the loadout travels in the URL", body: <Sharing /> },
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §7 — live share-link encoding via production share.ts"
```

---

### Task 14: §8 CI check + wire-up review

**Files:**
- Create: `apps/web/src/views/HowItWorks/sections/Ci.tsx`
- Modify: `apps/web/src/views/HowItWorks/HowItWorks.tsx`

- [ ] **Step 1: Implement the section**

Output strings mirror the real CLI (`crates/loadout-cli/src/main.rs`: `✓`/`✗` markers, `in sync` / `DRIFT detected`, exit 1 on drift).

```tsx
import { useState } from "react";
import { Prose } from "../ui/Prose";
import { Terminal, type TermLine } from "../ui/Terminal";

const IN_SYNC: TermLine[] = [
  { text: "$ loadout check", tone: "cmd" },
  { text: "  ✓ frontend-design               github.com/anthropics/skills @ 9b1f3c2", tone: "ok" },
  { text: "  ✓ tailwind                      github.com/anthropics/skills @ 9b1f3c2", tone: "ok" },
  { text: "  ✓ vercel-react-best-practices   github.com/vercel-labs/agent-skills @ 4e8d7aa", tone: "ok" },
  { text: "in sync", tone: "ok" },
  { text: "$ echo $?", tone: "cmd" },
  { text: "0", tone: "dim" },
];

const DRIFTED: TermLine[] = [
  { text: "$ loadout check", tone: "cmd" },
  { text: "  ✓ frontend-design               github.com/anthropics/skills @ 9b1f3c2", tone: "ok" },
  { text: "  ✗ tailwind                      not materialized in ~/.claude/skills", tone: "drift" },
  { text: "  ✓ vercel-react-best-practices   github.com/vercel-labs/agent-skills @ 4e8d7aa", tone: "ok" },
  { text: "DRIFT detected", tone: "drift" },
  { text: "$ echo $?", tone: "cmd" },
  { text: "1", tone: "dim" },
];

export function Ci() {
  const [drifted, setDrifted] = useState(false);
  const btn =
    "border border-line-strong rounded px-3 py-1.5 text-[12.5px] font-medium hover:border-ink-faint";
  return (
    <div>
      <Prose>
        <p>
          Everything above also ships as a CLI (<code>loadout switch / apply / check / doctor</code>),
          and <code>loadout check</code> is built for CI: it verifies the committed{" "}
          <code>loadout.json</code> against what's actually materialized and{" "}
          <strong>exits 1 on drift</strong>. A teammate deletes a symlink, pins drift from the
          lockfile, vendored content goes missing — the pipeline goes red instead of the agent
          quietly running with the wrong kit.
        </p>
      </Prose>

      <div className="flex gap-2 mb-3">
        <button className={btn} onClick={() => setDrifted(!drifted)}>
          {drifted ? "restore the symlink" : "rm ~/.claude/skills/tailwind"}
        </button>
      </div>

      <Terminal title="your-repo · ci" lines={drifted ? DRIFTED : IN_SYNC} />

      <Prose>
        <p className="mt-6">
          That's a one-line job: <code>loadout check || exit 1</code>. There's also{" "}
          <code>--json</code> for tooling that wants structured findings.
        </p>
      </Prose>
    </div>
  );
}
```

- [ ] **Step 2: Register section and review the final SECTIONS array**

In `HowItWorks.tsx` the complete array should now read:

```tsx
const SECTIONS: SectionDef[] = [
  { n: "1", title: "Thirty skills. All of them. All the time.", body: <Problem /> },
  { n: "2", title: "Install puts content in one place: the store", body: <StoreInstall /> },
  { n: "3", title: "The lockfile: pinned by default, rollback for free", body: <Lockfile /> },
  { n: "4", title: "Reconcile: two passes, one ownership rule", body: <Reconcile /> },
  { n: "5", title: "Try to break it", body: <BreakIt /> },
  { n: "6", title: "Profiles: one switch, every agent", body: <Profiles /> },
  { n: "7", title: "Sharing: the loadout travels in the URL", body: <Sharing /> },
  { n: "8", title: "loadout check: drift fails the build", body: <Ci /> },
];
```

- [ ] **Step 3: Build check, commit**

Run: `pnpm --filter web build` — expected clean.

```bash
git add apps/web/src/views/HowItWorks/
git commit -m "feat(web): how-it-works §8 — CI drift terminal; all sections wired"
```

---

### Task 15: verification pass

**Files:** none new — verification + fixes only.

- [ ] **Step 1: Full test + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: all engine tests pass; clean build.

- [ ] **Step 2: Manual browser pass**

**Ask Rohith before starting any dev server — he usually has one running.** With a dev server up, verify at `/how-it-works`:

1. §1 agent tabs re-animate the same 30 chips.
2. §2 Install → store path + lock entry appear; second click shows "0 bytes copied".
3. §3 Update sets `prev_rev`; Rollback swaps; track toggles.
4. §4 switch to `frontend` → step through: `doc-coauthoring`/`internal-comms` removed, 3 links created, `my-notes` + `team-link` skipped with captions, summary correct. Switch again mid-animation — no crash, state commits.
5. §5 plant `frontend-design` dir → run apply → conflict reported, dir survives, eaten stays 0. `rm store copy of tailwind` → run → "store content missing". Kill mid-apply → journal banner → relaunch → consistent end state.
6. §6 switching profiles updates both trees; foreign entries survive in `~/.claude/skills`.
7. §7 toggling skills changes the fragment live; "open this link for real" renders the actual SharePage; decoded tab round-trips; `loadout.json` tab is valid JSON.
8. §8 button toggles drift, exit codes 0/1 shown.
9. Dark mode (OS toggle) looks right; nothing unreadable at 375 px width.
10. Landing nav link navigates; browser back returns.

- [ ] **Step 3: Fix anything found, then commit**

```bash
git add -A apps/web
git commit -m "feat(web): how-it-works interactive post — verification fixes"
```

---

## Self-review notes (already applied)

- Spec coverage: §1–§8 + outro = Tasks 7–14 + shell (Task 4); simEngine + tests = Tasks 1–2 (spec's four test scenarios all present: round-trip, idempotency in round-trip test, never-clobber, broken-link); fixtures invariant test = Task 3; routing/nav/title = Task 4; no-new-runtime-deps holds (vitest is dev-only).
- Type consistency: `Summary.skippedConflicts` (TS camelCase of Rust `skipped_conflicts`) used consistently; `targetsFor` returns `Array<[string, string]>` consumed by `reconcileDir(fs, dir, targets)` everywhere; `TermLine` exported from Terminal and imported in Ci.
- The only intentional deviation from Rust: engine emits `skip-foreign`/`keep` *steps* for visualization where Rust silently `continue`s — counters match Rust exactly.
