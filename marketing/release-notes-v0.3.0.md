# Loadout v0.3.0 — the CLI release


## The `loadout` CLI

The engine moved into its own crate (`loadout-core`) and grew a command line:

```
loadout status                  # agents, base profile, counts
loadout list                    # profiles (* = active base)
loadout switch typescript       # set base + re-apply everywhere
loadout switch web --project .  # assign a profile to this project
loadout suggest [--accept]      # detect the stack, suggest a profile
loadout check                   # CI drift detection — exit 1 on drift
loadout doctor                  # health + redundancy report
```

`--json` everywhere. `loadout check` validates the repo's committed
`loadout.json` (vendored skills present, declared skills installed, revs
match, symlinks materialized) — structural checks run even on machines with
no Loadout state, so it drops straight into CI.

## Auto-activation rules (direnv for skills)

Register a project and Loadout detects what it is — `package.json` /
`tsconfig.json` → typescript/react/nextjs, `go.mod` → go, `Cargo.toml` →
rust, plus python, ruby, java, docker, terraform, tauri — and suggests the
matching profile by name. One click to accept. Flip on **auto** per project
and unassigned projects pick up their suggestion on launch. Auto never
overrides an explicit assignment.

## Skill editor with description linting

Local skills now open in a split editor: markdown on the left, live preview
on the right, ⌘S to save. The lint panel checks what actually matters for
triggering: "Use when…" phrasing, description length, name↔directory
mismatch, frontmatter validity — plus a live token count of what the skill
costs every session. Remote skills get **Fork & edit**.

## Doctor: redundancy report

Doctor now flags library redundancy, not just drift: near-duplicate
descriptions (token similarity) and contested trigger keywords ("animations"
claimed by 10 skills). Merging or sharpening those descriptions makes
triggering predictable again.

## Under the hood

- Engine extracted to `crates/loadout-core` — desktop app, CLI, and future
  GitHub Action all share it; CI tests it on macOS + Linux
- Editing a SKILL.md keeps the lockfile description in sync
- README: install-first, app screenshot, OG card for link previews
