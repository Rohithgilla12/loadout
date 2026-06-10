# Loadout roadmap

v0.1 shipped the thesis: skills as switchable kits. Everything below serves one number —
**profile switches per user per week** — or grows the number of users who have a reason to switch.
Issues and PRs welcome; tell us what to bump up.

## Shipped (v0.2 — switching is ambient)

- ✅ **Menu bar quick-switcher** — switch the base profile or any project's kit from the tray.
- ✅ **Context budget meter** — token estimate per skill and per profile; the invisible problem
  is a number now.
- ✅ **Skill usage analytics (local-only)** — actual invocations parsed from agent transcripts,
  plus *build a profile from what I actually use*. Nothing leaves the machine.
- ✅ **Auto-activation rules** — direnv for skills: `package.json` → suggest the `typescript`
  kit, `go.mod` → `go`. Suggest-first nudge, one-click accept, per-project `auto` opt-in.

## Shipped early (pulled forward from v0.3/v1.x)

- ✅ **`loadout` CLI** — the engine now lives in `crates/loadout-core`; the `loadout` binary
  exposes `switch`, `apply`, `check` (CI drift detection, exit 1), `suggest`, `doctor`, `list`,
  `skills`, all with `--json`.
- ✅ **Collision & overlap report** — Doctor flags near-duplicate descriptions and contested
  trigger keywords ("animations" claimed by 10 skills).
- ✅ **Full in-app editor** — split markdown editor with live preview and description linting
  ("Use when…" phrasing is the trigger; we lint for it).

## Soon (v0.3 — make sharing a loop)

- **Public loadout gallery** — opt-in directory at loadout.gilla.fun: trending kits, "starter
  loadout for Next.js," one-click install into the app. Shares already live in KV; this adds
  discovery on top. The growth loop: see a kit → install → make yours → share.
- **Prebuilt CLI binaries + GitHub Action** — ship `loadout` in releases/Homebrew; a
  `loadout-check` action so teams get drift detection on every PR.
- **Per-agent scoping** — profiles can target specific agents ("design skills → Cursor only"),
  instead of every kit landing in every detected agent.
- **Branch-pattern activation rules** — the other half of direnv-for-skills.

## Later (v1.x — make it the layer)

- **Windows support** — junction/copy-mode fallback, already designed in the PRD.
- **Team org profiles** — a shared remote profile a whole team subscribes to, updates reviewed
  like skill updates: notify → diff → apply.
- **Skill eval harness** — run a prompt suite against a profile and see which skills trigger;
  authoring without guesswork.
- **Beyond skills** — MCP servers, agent configs, hooks as switchable kit (the PRD's explicit
  non-goal until profile-switching proves out — the architecture already treats "what agents
  load" as data).

## Non-goals, still

- Running skills against live agents in v0.x
- Accounts, telemetry, or anything that phones home (`DO_NOT_TRACK` honored forever)
- A new skill format — agentskills.io SKILL.md is the spec; we stay a good citizen
