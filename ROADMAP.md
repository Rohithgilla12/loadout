# Loadout roadmap

v0.1 shipped the thesis: skills as switchable kits. Everything below serves one number —
**profile switches per user per week** — or grows the number of users who have a reason to switch.
Issues and PRs welcome; tell us what to bump up.

## Next (v0.2 — make switching ambient)

- **Menu bar quick-switcher** — switch the base profile or any project's kit from the tray,
  without opening the app. If switching costs an app launch, nobody switches three times a week.
- **Auto-activation rules** — direnv for skills: `package.json` → suggest the `typescript` kit,
  `go.mod` → the `go` kit, branch patterns later. Suggest-first (a nudge, not a surprise),
  one-click accept, per-project opt-in to fully automatic.
- **Context budget meter** — show what your equipped skills *cost*: every skill's name +
  description is injected into every session, so the Library and each profile get a token
  estimate ("base kit: ~3.1k tokens/session"). Makes the invisible problem a number — and makes
  trimming feel like a win.
- **Skill usage analytics (local-only)** — parse agent transcripts (e.g. Claude Code's session
  logs) for actual skill invocations: "12 of your 106 skills fired in the last 30 days." Then the
  killer button: *build a profile from what I actually use*. Nothing leaves the machine.

## Soon (v0.3 — make sharing a loop)

- **Public loadout gallery** — opt-in directory at loadout.gilla.fun: trending kits, "starter
  loadout for Next.js," one-click install into the app. Shares already live in KV; this adds
  discovery on top. The growth loop: see a kit → install → make yours → share.
- **`loadout` CLI** — the engine is a Rust lib already; expose `loadout switch <profile>`,
  `loadout check` (CI: does the repo's loadout.json match the lockfile?), `loadout apply`.
  Unlocks scripting, dotfiles, and a GitHub Action for team drift detection.
- **Per-agent scoping** — profiles can target specific agents ("design skills → Cursor only"),
  instead of every kit landing in every detected agent.
- **Collision & overlap report** — two skills both claiming `tailwind`, near-duplicate
  descriptions that confuse triggering. Doctor learns to flag redundancy, not just drift.

## Later (v1.x — make it the layer)

- **Windows support** — junction/copy-mode fallback, already designed in the PRD.
- **Full in-app editor** — split markdown editor with live preview and description linting
  ("Use when…" phrasing is the trigger; lint for it).
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
