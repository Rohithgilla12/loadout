import { describe, expect, test } from "vitest";
import {
  type Entry,
  type SimFS,
  STORE_ROOT,
  childrenOf,
  isLoadoutOwned,
  normalize,
  reconcileDir,
  applySteps,
} from "./simEngine";
import { CLAUDE_DIR, initialAgentFs, targetsFor } from "./fixtures";

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

  test("matches rust Path::starts_with at the boundary", () => {
    const fs = baseFs();
    fs.set(`${DIR}/root-link`, { kind: "symlink", target: STORE_ROOT });
    fs.set(`${DIR}/sibling`, { kind: "symlink", target: `${STORE_ROOT}-extra/x` });
    expect(isLoadoutOwned(fs, `${DIR}/root-link`)).toBe(true);
    expect(isLoadoutOwned(fs, `${DIR}/sibling`)).toBe(false);
  });

  test("foreign entries are never owned", () => {
    const fs = baseFs();
    fs.set(`${DIR}/elsewhere`, { kind: "symlink", target: "/home/you/dotfiles/skill" });
    expect(isLoadoutOwned(fs, `${DIR}/foreign-skill`)).toBe(false); // plain dir
    expect(isLoadoutOwned(fs, `${DIR}/elsewhere`)).toBe(false); // link out of store
    expect(isLoadoutOwned(fs, `${DIR}/nope`)).toBe(false); // doesn't exist
  });
});

describe("childrenOf", () => {
  test("direct children only, sorted", () => {
    const fs = baseFs();
    fs.set(`${DIR}/zz`, { kind: "file" });
    fs.set(`${DIR}/aa/nested`, { kind: "file" });
    fs.set(`${DIR}/aa`, { kind: "dir" });
    expect(childrenOf(fs, DIR)).toEqual([`${DIR}/aa`, `${DIR}/foreign-skill`, `${DIR}/zz`]);
  });
});

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

  test("replay matches even when the agent dir must be created", () => {
    const fs = baseFs();
    fs.delete(DIR); // dir does not exist yet — reconcile creates it
    const r = reconcileDir(fs, DIR, [["alpha", ALPHA]]);
    expect(applySteps(fs, r.steps, r.steps.length)).toEqual(r.fs);
    expect(r.fs.get(DIR)).toEqual({ kind: "dir" });
  });
});

describe("fixtures", () => {
  test("starting state is the writing profile, already in sync", () => {
    const r = reconcileDir(initialAgentFs(), CLAUDE_DIR, targetsFor("writing"));
    expect(r.summary.added).toBe(0);
    expect(r.summary.removed).toBe(0);
    expect(r.summary.unchanged).toBe(2);
    expect(r.summary.skippedConflicts).toEqual([]);
  });
});
