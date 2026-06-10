# Loadout — Skill Manager for AI Agents

**PRD v1.0 · June 2026 · Status: Draft for review**
*Working title. Alternatives considered: skill-peek, Skillset, Quiver. "Loadout" wins because the core feature — switchable sets of equipped skills — is literally what a loadout is.*

---

## 1. Overview

Loadout is an open-source desktop app for managing agent skills — the `SKILL.md`-based instruction sets used by Claude Code, Cursor, Codex, GitHub Copilot, and ~50 other coding agents. It is a GUI-first, profile-centric management layer on top of the open skills ecosystem (skills.sh / agentskills.io spec), built as a native app with no Node.js runtime dependency.

The headline feature is **profiles**: named, switchable sets of skills, layered as a global base plus per-project assignments. Working on a TypeScript frontend? Activate the `typescript` profile for that project. Switching to a Go backend? One click swaps the active skill set. Profiles are shareable files that teams commit to their repos, so an entire team gets an identical skill environment from a single click.

**Positioning:** "data-peek for agent skills." A polished, fast, OSS desktop tool that does one job extremely well, distributed as a single binary via GitHub Releases and Homebrew.

## 2. Problem

The skills ecosystem exploded in 2025–2026 (629K+ installs tracked on skills.sh, 17K+ stars on the CLI), but management tooling stopped at `npx skills add`. Today:

1. **Skills are all-on, all-the-time.** Every installed skill's name + description is injected into every agent session. Install 30 skills and your React design guidelines pollute context during Go backend work — wasted tokens, degraded skill triggering, and irrelevant behavior. The only "off switch" is uninstalling.
2. **No visibility.** Skills are scattered across `~/.claude/skills/`, `./.agents/skills/`, `~/.cursor/skills/`, and a dozen other directories as loose folders and symlinks. There is no single view of what's installed, where, for which agent, or at what version.
3. **Updates are manual and blind.** `npx skills update` pulls upstream HEAD with no notification that updates exist, no preview of what changed, and no rollback. Since skills are instructions injected directly into agents, a silently changed upstream skill is a prompt-injection vector.
4. **No reproducibility.** No lockfile, no pinning. Two teammates who ran the same install command on different days can have different skill content.
5. **No team story.** There is no way to declare "this project uses these skills" in a way tooling understands.
6. **CLI-only UX.** Browsing, comparing, reading, and editing skills through `npx` invocations and `cat` is a poor fit for what is fundamentally a curation activity.

## 3. Goals

1. **One screen of truth** — every skill, every agent, every scope, every version, visible and searchable in one place.
2. **Profiles as the core primitive** — create, edit, switch, layer, and share named skill sets. Switching is instant (symlink rewrite, no network).
3. **Safe-by-default updates** — pinned versions, update notifications, one-click apply, diff on demand, rollback.
4. **Trustworthy installs** — SKILL.md preview and skills.sh audit status before anything lands on disk.
5. **Full lifecycle** — discover (registry browse), install (registry/git URL/local), author (create + edit in-app), maintain (update/remove/doctor).
6. **Ecosystem-compatible, dependency-free** — interoperates with skills installed by `npx skills`; requires no Node, works offline for everything except discovery and update checks.

### Non-goals (v1)

- Auto-detection of project type / automatic profile activation (direnv-style). Manual switching only; auto-rules are a v2 candidate.
- Running or testing skills against live agents.
- Publishing skills to skills.sh (it indexes public GitHub repos; "publish" = push to GitHub, which we link out to).
- Menu bar / tray quick-switcher (v2 candidate; architecture must not preclude it).
- MCP servers, agent configs, hooks, or memory files. Skills only. (Adjacent surfaces are a roadmap item, not v1.)
- Windows-first polish. v1 targets macOS + Linux; Windows ships best-effort behind the symlink fallback (§10).

## 4. Target users

- **Primary:** individual power users of agentic coding tools — people with 10+ skills installed across 2+ agents who feel the context-pollution and sprawl problems daily.
- **Secondary:** tech leads standardizing agent setups across a team via committed profile files (the Fusang use case: every engineer gets the Blocktree brand skill + team conventions on clone).
- **Tertiary:** skill authors who want a comfortable editing/preview environment.

## 5. Core concepts & terminology

| Concept | Definition |
|---|---|
| **Skill** | A directory containing `SKILL.md` (YAML frontmatter: `name`, `description`) per the agentskills.io spec, plus optional supporting files/scripts. |
| **Source** | Where a skill comes from: a git repo (`owner/repo` or any git URL), or `local` (created in-app, no repo). |
| **Store** | Loadout's canonical, content-addressed copy of every installed skill on the machine. Agent directories only ever contain symlinks into the store. |
| **Profile** | A named, ordered list of skill references. The unit of activation. |
| **Base profile** | The one profile applied to *global* agent directories (`~/.claude/skills/` etc.). Always-on skills live here. |
| **Project** | A directory the user registers with Loadout. Each project has exactly one assigned profile (or none), applied to its *project-scope* agent directories (`./.claude/skills/`, `./.agents/skills/`, …). |
| **Profile file** | `loadout.json` committed at a repo root, declaring the profile that project should use. The team-sharing mechanism. |
| **Effective skill set** | What an agent actually sees in a project = base profile ∪ project profile (project wins on name collision). Loadout always renders this merged view. |
| **Pin** | Every skill resolves to an exact git commit SHA recorded in the lockfile. Default. A skill may be opted into `track: latest`. |

## 6. Architecture

**Stack:** Tauri 2 (Rust core) + React + TypeScript + Tailwind + shadcn/ui. pnpm workspace.

**Decision: native engine, no CLI dependency.** Loadout reimplements install/update/apply natively in Rust rather than shelling out to `npx skills`. Rationale: the profile feature requires owning the symlink layer anyway; GUI operations must be instant and offline-capable; output of an interactive CLI is not a stable API; and "single binary, no Node required" is a core distribution promise. The upstream MIT repo is treated as a *reference spec we track*, not a runtime dependency — in particular its agent-directory mapping table is vendored as data and refreshed via a sync script in CI.

**Compatibility contract** (the rules that keep us a good ecosystem citizen):

1. Read and respect the agentskills.io `SKILL.md` spec exactly; never write a frontmatter the CLI can't parse.
2. Use the same agent directory paths as the CLI's table for all supported agents.
3. Detect skills installed by other tools (CLI copies/symlinks) and offer **adopt** (import into the store, dedupe) rather than ignoring or clobbering them.
4. Never touch files inside agent skill directories that Loadout didn't create, except through explicit adopt/repair flows.

**Process model:** all filesystem and git operations live in the Rust core behind a typed Tauri command API. Git via system `git` if present, falling back to a bundled `gix`/`git2` path (decision spike in M1 — shallow clone + fetch by SHA are the only required operations). A lightweight background task in the app checks for upstream updates on a schedule (default: every 24h, on app launch) — no daemon in v1; checks run only while the app is open.

**State layout on disk:**

```
~/.loadout/
  store/
    github.com/vercel-labs/agent-skills/<sha>/skills/frontend-design/   # content-addressed by source+sha
    local/my-team-conventions/                                          # local-only skills, versionless
  profiles/
    base.json
    typescript.json
    go-backend.json
  projects.json      # registered projects → assigned profile, detected agents
  lock.json          # skill → {source, rev, pinned|latest, installedAt}
  settings.json
```

**Apply algorithm (the heart of the app):** applying profile P to scope S (global or a project) means: compute the target skill set; for each supported+detected agent at that scope, reconcile the agent's skills directory to contain exactly one symlink per skill into the store (plus any adopted/foreign entries, untouched); remove only Loadout-owned symlinks that are no longer in the set. Reconciliation is idempotent and crash-safe (write a journal entry before mutating, repair on next launch). Target: < 50 ms for a 30-skill profile across 5 agents.

**Profile file (`loadout.json`, repo-committed):**

```json
{
  "$schema": "https://loadout.dev/schema/v1.json",
  "profile": "data-peek-dev",
  "extends": [],
  "skills": [
    { "source": "vercel-labs/agent-skills", "skill": "vercel-react-best-practices", "rev": "9f3c2ab" },
    { "source": "anthropics/skills", "skill": "frontend-design", "rev": "1c44d01" },
    { "source": "local", "skill": "team-conventions", "vendored": ".loadout/skills/team-conventions" }
  ]
}
```

Local skills referenced by a shared profile must be vendored into the repo (`.loadout/skills/`) so teammates actually receive them. `rev` makes team installs reproducible; omitting it means "resolve latest at apply time, then pin in the local lockfile."

## 7. Features

Priority: **P0** = v1 cannot ship without it · **P1** = in v1 scope, cuttable under pressure · **P2** = post-v1.

### F1 · Library (P0)
The home screen: every skill in the store with name, description, source, version (SHA + date), pin mode, which profiles include it, which agents/scopes it's currently live in, and update status. Search and filter (by agent, profile, source, has-update). Detail view renders SKILL.md with full file tree of the skill directory. Bulk actions: update, remove, add-to-profile.

### F2 · Profiles (P0)
Create/rename/duplicate/delete profiles; drag or checkbox skills in and out; profiles can `extends` other profiles (single-level composition in v1 — `typescript` extends nothing, `nextjs` extends `typescript`; cycles rejected). Designate any profile as the **base**. Switching base re-applies global scope immediately with a summary toast ("+3 skills, −5 skills across 4 agents"). Empty-profile state doubles as onboarding.

### F3 · Projects (P0)
Register project directories (file picker or drag-onto-window). Per project: detected agents (which of CC/Cursor/Codex/Copilot dirs exist or are inferable), assigned profile, effective-skill-set view (base ∪ project, collision-resolved), and an Apply/Re-apply action. If a registered project contains `loadout.json`, Loadout surfaces it: "This repo declares profile *data-peek-dev* (12 skills) — Review & Apply." Review shows the full skill list with trust info (F7) before anything is installed. Export any profile to `loadout.json` for committing.

### F4 · Registry browse (P0)
In-app skills.sh: leaderboard, trending, search, topic pages via the skills.sh public API; skill pages show install counts, repo link, rendered SKILL.md (fetched from the source repo), and audit status. Install targets a profile, not an agent — "Add to profile: [typescript ▾]" — which is the conceptual shift from the CLI. Graceful offline/degraded mode (registry unavailable ≠ app broken).

### F5 · Install from git URL (P0)
Paste anything the CLI accepts: `owner/repo`, full GitHub/GitLab URLs, deep links to a skill subdirectory, any git URL, or a local path. Loadout clones shallow, discovers skills using the CLI's published search-location list (root, `skills/`, `.claude/skills/`, plugin manifests, recursive fallback), and presents a picker with previews. Multi-select → add to chosen profile.

### F6 · Local skills & in-app editor (P1)
"New skill" scaffolds a spec-compliant SKILL.md (frontmatter validated live) in `store/local/`. Editor: markdown with split live preview, frontmatter form view, description-quality lint hints (the description is the trigger — lint for "when to use" phrasing, length bounds). Local skills behave identically to remote ones in profiles. Editing a *remote* skill forks it to local (the store is immutable per SHA) with clear provenance shown. Out of scope: editing pushed back upstream (link out to the repo instead).

### F7 · Trust UX (P0)
Before any skill first lands in a profile, the user sees: rendered SKILL.md, the skill's file listing with **executable/script files flagged prominently** (skills can carry runnable code — this is the highest-risk surface), source repo + stars, and the skills.sh audit badge (audited/flagged/unknown) when available. One screen, one confirm. Re-installs and updates of the same skill skip the ceremony (updates have their own flow, F8).

### F8 · Updates (P0)
Background check compares pinned SHAs against upstream HEAD per source repo. Badge on the Library tab; per-skill and update-all actions; one click applies (per the chosen model: **notify → one-click**). A "view diff" affordance on each pending update (full diff of the skill directory between SHAs) exists but is not forced. Every update records the previous SHA → one-click rollback per skill. Skills set to `track: latest` auto-apply on check but still log to the same history. Update events are summarized ("frontend-design: upstream changed 2 files, +40 −12").

### F9 · Doctor (P1)
A status pane that detects and repairs drift: broken symlinks (store pruned, project moved), foreign skills in agent dirs (→ adopt flow), duplicate skill names across sources (collision report; project-profile wins at apply time, but the user should see it), agent dirs that exist for unsupported agents (informational), and journal-recovery results. "Fix all" where safe.

### F10 · App self-update (P1)
Tauri updater against GitHub Releases, signed artifacts, notify-and-restart (consistent with the skills update philosophy — nothing silently changes).

## 8. UX structure

Left-rail navigation: **Library · Profiles · Projects · Discover · Doctor · Settings**. Design language follows the data-peek lineage: dense, keyboard-friendly, fast. Command palette (⌘K) for switch-profile / search-skill / register-project. The single most important interaction in the app — assigning a profile to a project — must be ≤ 2 clicks from launch.

Key screens (wireframe-level intent, not pixel spec):

1. **Library** — table view, virtualized, with an inspector panel (skill detail) on row select.
2. **Profile detail** — two-pane: skills in profile ←→ all skills, with move controls; header shows where this profile is applied (base / N projects).
3. **Project detail** — agents row (icons, detected/active), profile selector, effective-set list with origin chips (`base` / `project` / `collision: project wins`).
4. **Discover** — skills.sh browse with the trust panel as the install interstitial.
5. **Update review** — pending updates list, expandable diffs, "Update all."

## 9. Security & privacy

- Skills are treated as **untrusted input**: trust interstitial on first install (F7), executable-file flagging, pin-by-default, notify-don't-auto-update, diff-on-demand, rollback. Loadout never executes any file inside a skill.
- `loadout.json` from a cloned repo is a **declaration, not an authorization**: applying it always goes through explicit review (a malicious repo must not be able to silently install skills by being opened).
- Symlink targets are validated to resolve inside the store before creation; reconciliation never follows symlinks out of managed directories; path traversal in skill names/sources rejected at parse time.
- Network surface: skills.sh API, git remotes the user explicitly adds, GitHub Releases for self-update. Nothing else. No telemetry in v1 (revisit post-launch with opt-in only, honoring `DO_NOT_TRACK`).
- App artifacts signed + notarized on macOS; checksums published for all platforms.

## 10. Platform notes

- **macOS + Linux:** full support, symlinks native.
- **Windows:** symlinks require Developer Mode or elevation; fall back to NTFS junctions for directories, else copy-mode with a `.loadout-managed` marker file enabling reconciliation. Copy-mode makes profile switching O(files) instead of O(1) — acceptable, documented.
- Agent table v1: **Claude Code, Cursor, Codex, GitHub Copilot** (+ OpenCode at near-zero cost since Cursor/Codex/Copilot already share `.agents/skills/`). Full table is data-driven, so expanding post-v1 is config, not code.

## 11. Milestones

Build phases (all within v1 scope per product decisions; order optimized so the differentiator demos earliest):

- **M1 — Engine (3 wks):** store, lockfile, git fetch-by-SHA spike, apply/reconcile with journal, agent detection, adopt-foreign-skills. CLI-installed skills import cleanly. Exit: round-trip install→apply→remove on all 5 agents, both scopes, via a throwaway debug UI.
- **M2 — Profiles + Projects UI (3 wks):** F1, F2, F3 minus loadout.json. Exit: the demo — switch a project from `typescript` to `go-backend` and show Claude Code's skill dir change instantly.
- **M3 — Acquisition (2 wks):** F4, F5, F7. Exit: find a skill on Discover, review trust panel, land it in a profile.
- **M4 — Team + safety (2 wks):** loadout.json export/review/apply, F8 updates with diff + rollback.
- **M5 — Authoring + polish (2 wks):** F6 editor, F9 doctor, F10 self-update, onboarding, docs site, Homebrew tap. Exit: public launch (Show HN / X / r/ClaudeAI), skills.sh community outreach.

~12 weeks part-time. Cut order under pressure: F6 editor → F9 doctor → diff view (keep notify+rollback).

## 12. Success metrics

- **Activation:** % of installs that create ≥1 profile and apply it to ≥1 project within first session (target 60%).
- **Retention proxy:** profile switches per active user per week — the metric that proves the core thesis (target ≥3).
- **Ecosystem:** GitHub stars (1K in 3 months given the skills wave), Homebrew installs, ≥5 public repos with a committed `loadout.json` not authored by us.
- **Quality:** zero data-loss bugs in agent dirs (reconciliation must never destroy user content) — release-blocking class.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Vercel ships profiles/GUI into the CLI or skills.sh | Speed + native UX moat; stay format-compatible so we benefit from their ecosystem growth either way; profiles-as-committed-files creates adoption gravity they'd have to match, not just copy. |
| Agent vendors change skill-loading paths/behavior | Data-driven agent table, CI sync against upstream repo, Doctor detects breakage in the field. |
| skills.sh API changes/rate-limits | Thin client, cache aggressively, degrade to git-URL installs (P0 path doesn't depend on the API). |
| Symlink edge cases (cloud-synced homes, containers, WSL) | Copy-mode fallback is first-class, not an afterthought; Doctor repairs. |
| Scope creep into MCP/agent-config management | Explicit non-goal; revisit only after profile-switch retention proves out. |

## 14. Open questions

1. Name + domain final call (loadout.dev availability check).
2. Bundled git (`gix`) vs system git — resolve in M1 spike.
3. Should base-profile changes prompt before applying (they affect all sessions machine-wide) while project applies stay instant? Leaning yes.
4. `loadout.json` location: repo root vs `.loadout/` dir. Root is more discoverable (.nvmrc precedent); dir keeps vendored skills co-located. Leaning root file + `.loadout/skills/` for vendoring.
5. Skills.sh install counts come from CLI telemetry — do we ping their endpoint so app installs count toward the ecosystem numbers, or stay silent? (Community-relations question more than technical.)
