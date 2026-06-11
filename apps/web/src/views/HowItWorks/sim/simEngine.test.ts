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
