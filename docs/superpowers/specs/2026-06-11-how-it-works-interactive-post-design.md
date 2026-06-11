# "How Loadout Works" — interactive deep-dive post

**Date:** 2026-06-11
**Status:** Approved
**Where:** `loadout.gilla.fun/how-it-works`, a new view in `apps/web`

## Goal

An engineering deep-dive for HN-style readers that explains how Loadout works
by letting them *operate* each mechanism in the browser. Launch content: one
canonical link to share, hosted on the product domain, shipped with the
existing Wrangler deploy.

## Audience & tone

Technical readers who have never heard of Loadout. The post must establish the
problem in the first screen, then earn attention with mechanics, not claims.
Prose is direct and first-person-product ("Loadout does X"), no marketing
fluff. Every claim about behavior is demonstrated by a simulation or backed by
a quoted Rust snippet.

## Routing & shell

- New path route `/how-it-works`. `App.tsx` gets a `readPostFromPath()` check
  alongside `readSlugFromPath()`. The Worker's
  `not_found_handling: "single-page-application"` already serves the SPA for
  deep links — zero worker changes.
- New view directory `apps/web/src/views/HowItWorks/` containing the post
  component and its section components.
- `Landing.tsx` nav gains a "How it works" link.
- `document.title` set in the view (`Loadout — How it works`). Site-wide OG
  meta is reused; a route-specific OG card is out of scope.
- Same design system: paper/ink/accent tokens from `styles.css`, IBM Plex
  Sans/Mono, `.blueprint` grid for the hero, `.rise-in` entrances.

## Narrative structure: one skill's journey

The reader follows a single skill — `frontend-design` from a public skills
repo — through the entire system. Eight sections:

### 1. The problem (hook)

Skills today are all-on, all-the-time, duplicated per agent. Interactive: a
grid of ~30 skill chips, all lit; a context meter shows the always-on cost.
Toggling agents (Claude Code / Cursor / Codex) shows the same pile duplicated
in each. One paragraph, one toy, point made in five seconds.

### 2. Install → the store

Reader clicks Install on `frontend-design`. The simulation shows:

- the lock entry JSON written to the lockfile (name, source, url, rev,
  track: "pinned", installed_at),
- content landing at `store/<source>/<rev>/<name>` in an animated file tree.

Then a second Install from the same rev: "already exists — 0 bytes copied."
Store content is immutable per `(source, rev)`; that is the dedupe story.
**Accuracy note:** the store is addressed by `(source, rev, name)`, not a
content hash. Locals live at `store/local/<name>`. No fake hashes anywhere.

### 3. The lockfile

Rendered lockfile with the installed entry. Interactions:

- toggle `track` pinned ↔ latest, with one sentence on pin-by-default,
- an Update button that moves `rev` and records `prev_rev`,
- a working Rollback button that swaps them back.

### 4. Reconcile (the centerpiece)

A simulated `~/.claude/skills/` containing mixed entries:

- Loadout-owned symlinks (targets resolve into the store),
- a foreign directory (`my-notes/`),
- a foreign symlink pointing outside the store.

Reader picks a profile from a dropdown; the two passes run step-by-step with
captions:

- **Pass 1:** every entry tested with the ownership rule — "is this a symlink
  whose target resolves (lexically, so broken links count) into the store?"
  Owned-but-unwanted links are removed; foreign entries are visibly skipped.
- **Pass 2:** missing links created; an existing foreign entry with a managed
  skill's name is skipped into `skipped_conflicts`, never clobbered.

A live `ApplySummary` (added / removed / unchanged / skipped_conflicts)
updates as steps run.

### 5. Try to break it

Free-play on the same simulated dir. The reader can:

- add their own file/dir/symlink (any name, including colliding with a
  managed skill),
- delete content from the store (making a managed link dangle),
- kill an apply mid-flight, then "relaunch" to watch journal recovery
  (re-apply everything; reconcile is idempotent).

Reconcile never deletes anything it doesn't own. This section is the
release-blocking invariant made tangible. A small scoreboard tracks attempts
("your files eaten: 0").

### 6. Profiles & switching

Profile cards (e.g. `writing`, `frontend`, `everything`). Switching reconciles
several agent dirs at once in a side-by-side diff animation. One callout on
project scope: a project gets ONLY its project profile materialized — base
skills stay in global agent dirs, which agents already merge.

### 7. Sharing

Reader assembles a small loadout; the share URL builds live:
`loadout.gilla.fun/#L=<base64url>` — using the **actual production functions**
imported from `lib/share.ts` (`encodeLoadout`, `decodeLoadout`,
`toLoadoutJson`). A decode box proves the round trip; a tab shows the
committable `loadout.json`. One line on short links (`/s/:slug` via Workers
KV) and that fragment links never touch a server.

### 8. CI

Simulated terminal: `loadout check` passes (exit 0), reader introduces drift
in the simulated dir, re-runs, gets the drift report and exit 1. One sentence
on wiring it into CI.

### Outro

Install links (app + CLI), GitHub repo, share-your-loadout CTA pointing at the
Builder.

Each section = short prose + simulation + a collapsible real Rust snippet
(`apply.rs`, `store.rs`) quoted verbatim.

## Architecture

```
apps/web/src/
  views/HowItWorks/
    HowItWorks.tsx        — post shell: hero, sections, outro
    sections/             — one component per section (Problem, Store,
                            Lockfile, Reconcile, BreakIt, Profiles,
                            Sharing, Ci)
    sim/
      simEngine.ts        — faithful TS port of reconcile_dir +
                            is_loadout_owned + normalize (pure functions
                            over an in-memory FS model)
      simEngine.test.ts   — vitest, ports the Rust test scenarios
      fixtures.ts         — skill/profile/lockfile sample data
    ui/                   — small shared pieces: FileTree, StepPlayer,
                            CodeFold (collapsible Rust snippet), Terminal
```

**simEngine.ts is the fidelity trick and the post's meta-point.** It ports the
real algorithm — two passes, lexical path normalization, never-touch-foreign —
over a tiny in-memory filesystem model (`Map<path, Entry>` where Entry is
file | dir | symlink{target}). Every simulation that mutates the fake agent
dir calls this one engine, so the post can honestly say "this demo runs the
same algorithm as the app." Sections own their React state; the engine stays
pure (state in, `{state', summary, steps[]}` out — `steps[]` drives the
step-by-step animations).

`StepPlayer` is the shared animation primitive: takes `steps[]` from the
engine, exposes play/pause/step, highlights the file-tree row each step
touches, and renders the caption.

## Data flow

fixtures → section component state → simEngine (pure) → steps + new state →
StepPlayer renders. Sharing section is the exception: it imports the real
`lib/share.ts` and runs it on the reader's assembled loadout directly.

## Error handling

Simulations are closed worlds — no user text input parsing except the
break-it section's "name your file" field, which accepts anything (that's the
point) and renders it inert as text. The share section reuses production
encode/decode which is already defensive. No network calls anywhere in the
post (short links are only *mentioned*).

## Testing

- Add `vitest` (devDependency) to `apps/web` with a `test` script.
- `simEngine.test.ts` ports the Rust scenarios from `apply.rs` tests:
  1. round trip — apply two skills, narrow to one, foreign dir survives,
  2. idempotency — second apply is all-unchanged,
  3. never-clobber — foreign entry with managed name → skipped_conflicts,
     content untouched,
  4. broken-link ownership — dangling store target still owned and cleaned.
- UI/sections: not unit-tested; verified by hand in the browser.
- CI: the existing workflow gains `pnpm --filter web test` only if trivial;
  otherwise local-only for now (post ships at launch pace).

## Dependencies

None at runtime. CSS transitions + React state for all animation. `vitest`
dev-only.

## Out of scope

- Route-specific OG image / SSR meta rewriting in the Worker.
- A general blog system (this is a single hand-built post; if a second post
  ever happens, extract then).
- Mobile-perfect simulations — they must be usable on mobile, but the target
  reading experience is desktop.
- Localization, comments, analytics.
