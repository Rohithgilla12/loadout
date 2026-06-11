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
