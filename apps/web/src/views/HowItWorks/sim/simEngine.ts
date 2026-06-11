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
  const root = normalize(STORE_ROOT);
  const abs = normalize(absolute);
  return abs === root || abs.startsWith(root + "/");
}

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
