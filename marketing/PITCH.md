# Loadout — launch pitch & recording script

## The pitch (internalize this, then say it your way)

**One-liner:** Loadout turns your pile of AI-agent skills into switchable kits — equip the right
skills per project, one click, instant.

**The setup (why now):** Skills exploded — most heavy Claude Code / Cursor users have dozens
installed. But skills are all-on, all-the-time: every skill is injected into every session.
Your React design guidelines ride along while you write Go. The only off switch is uninstalling.

**The insight (the name is the product):** Gamers solved this decades ago. You don't carry every
weapon — you carry a *loadout*. Named, switchable, situational.

**The proof points (pick 3, never list all):**
- Profiles: a base kit that's always on + per-project kits. Switching rewrites symlinks — instant, offline.
- One screen of truth: every skill, every agent, every version. Imports your existing skills in one click.
- Safe updates: pinned by default, diff before applying, one-click rollback. Skills are prompt
  injection surface — treat them like dependencies.
- Team loadouts: commit `loadout.json`, teammates get the identical setup, pinned to exact commits.
- Share: loadout.gilla.fun — your loadout as a link, no account, the data lives in the URL.

**What it is NOT (credibility):** Not a registry (skills.sh is great, we browse it in-app). Not a
new format (same SKILL.md spec, same directories — `npx skills` and Loadout coexist). Not a
subscription (free, MIT, single native binary, no Node).

---

## Recording script — ~2:30 demo (screen + voice)

Record at 1920×1080. Dark mode on (it demos better). Have ready: a terminal, the app, and one
real project repo. Don't read the lines verbatim — they're beats, not a teleprompter.

### Beat 1 — the problem, in YOUR terminal (0:00–0:20)

**Screen:** terminal, type: `ls ~/.claude/skills | wc -l` → shows your real count.

**Voice:**
> "I have a hundred and six skills installed for my coding agents. Claude Code reads every single
> one of them, in every single session. My React design guidelines are in context while I write
> Go. There's no off switch — until now."

*(Beat works because it's verifiably real. Show YOUR number.)*

### Beat 2 — one screen of truth (0:20–0:45)

**Screen:** open Loadout → Library. Scroll the table slowly. Click one skill → inspector shows
rendered SKILL.md + file tree.

**Voice:**
> "This is Loadout. Every skill on my machine — every agent, every version, one screen.
> It found everything my other tools installed and imported it in one click, with a backup first.
> Click any skill and you see exactly what your agent reads — and any script files it carries,
> flagged."

### Beat 3 — the headline: profiles (0:45–1:25)

**Screen:** Profiles tab. Show `everything` (base) and a small `work` profile. Then split screen
or picture-in-picture with a terminal showing `ls <project>/.claude/skills`. In Projects, switch
the project's profile from one kit to another. Re-run `ls` — contents changed.

**Voice:**
> "Here's the headline feature. A profile is a named kit of skills. My TypeScript kit. My Go kit.
> My writing kit. Assign one to a project — and watch the project's skills directory. One click…
> and the whole kit swaps. It's symlinks. Instant, offline, reversible. Your agent's context
> only carries what the job needs."

*(This is the money shot — the `ls` before/after is the proof. Rehearse it once.)*

### Beat 4 — trust & updates (1:25–1:50)

**Screen:** Discover tab → trending list from skills.sh → click Add on something → trust panel
with a `scripts` badge visible. Then Library → a pending update → click `diff`.

**Voice:**
> "Installing is trust-first. Before anything lands on disk: the rendered skill, the full file
> list, executable scripts flagged. Skills are instructions injected into your agent — read them
> like you'd read a dependency. Updates are pinned by default: see the diff, apply in one click,
> roll back in one click."

### Beat 4b — update with diff, then rollback (optional ~35s insert, the trust money-shot)

**Setup (already staged):** `agent-browser` is pinned at an older upstream commit, so a real
update is waiting. The diff is dramatic: upstream rewrote the skill — 11 files, +29 −1758.

**Screen:**
1. Library — the orange badge on the tab and the `Updates (3)` filter. Click it.
2. On `agent-browser`, click **diff** (don't click Update yet). Scroll the diff slowly for ~4
   seconds — let the wall of red deletions land.
3. Close, click **Update**. Toast fires; badge count drops.
4. Open the skill in the inspector — point at the new rev and the **Roll back** button. Click it.
   Rev flips back. (Click Update once more if you want to end on latest.)

**Voice:**
> "Loadout's telling me three skills have upstream changes. Before I take one — let's see what
> actually changed. Eleven files. Seventeen hundred lines deleted. Upstream rewrote this skill
> completely — and remember, this text gets injected straight into my agent. I want to SEE that
> before it lands. Looks intentional — one click to update… and if I ever regret it, one click
> to roll back. Pinned by default, diff on demand, rollback always. Skills are dependencies.
> Treat them like it."

*(The other two updates have no content diff — upstream moved but those skills didn't change.
If you show one, say exactly that: "and these two? Repo moved, skill unchanged — safe.")*

### Beat 5 — share & team (1:50–2:15)

**Screen:** loadout.gilla.fun → the share page from your real link (e.g. `/s/...`). Then flash
`loadout.json` in an editor for two seconds.

**Voice:**
> "And your loadout is shareable. This is my kit, as a link — no account, the loadout travels in
> the URL itself. For teams, commit a loadout.json to the repo: every engineer gets the identical
> skill environment, pinned to exact commits, from a single click."

### Beat 6 — close (2:15–2:30)

**Screen:** the landing page hero, then the GitHub repo.

**Voice:**
> "Free, open source, no Node required — one native binary for macOS and Linux. It's called
> Loadout. Link below. Go build your kit."

---

## Post copy (ready to paste)

### X / Twitter (lead post)

> Your AI agent reads every installed skill, in every session. All 106 of mine. While I write Go,
> my React guidelines are burning context.
>
> So I built Loadout — switchable skill *kits* for Claude Code, Cursor & Codex. One click swaps
> the whole set.
>
> Free & open source 🧵

*(attach the launch video, follow with: profiles demo gif → trust panel → share link → repo link)*

### Show HN

**Title:** `Show HN: Loadout – Switchable skill sets for AI coding agents`

**Text:**
> AI-agent skills (the SKILL.md ecosystem used by Claude Code, Cursor, Codex…) have one big
> problem: they're all-on, all-the-time. Every installed skill is injected into every session.
>
> Loadout is an open-source desktop app (Tauri/Rust, no Node runtime) that manages skills as
> "profiles" — named kits you switch per project. It works by owning a content-addressed store
> and writing symlinks into the agents' skill directories, so switching is instant and offline.
> Everything is pinned to exact git SHAs in a lockfile, updates show diffs and roll back, and
> installs go through a trust review that flags executable files (skills are a prompt-injection
> surface).
>
> Teams commit a loadout.json so everyone gets an identical, pinned skill environment. There's
> also a small share page where a loadout travels base64-encoded in the URL fragment — no
> accounts, no server storage.
>
> It interops with the existing `npx skills` CLI (same spec, same directories, it adopts what's
> already installed). macOS + Linux. I'd love feedback on the reconciliation model and what
> agents to support next.

### r/ClaudeAI

> Built a free desktop app that fixes my biggest Claude Code annoyance: 100+ skills all loaded
> in every session. Loadout groups them into switchable profiles per project — symlink-based, so
> switching is instant. It imported all my existing skills in one click (with a backup), shows
> diffs before skill updates, and flags scripts inside skills before you install them.
> Open source, works with Cursor/Codex too. [link]

---

## Practical recording notes

- **Pace:** speak ~10% slower than feels natural; cut silences in the edit instead.
- **The `ls` before/after in Beat 3 is the whole video.** If you only rehearse one thing, rehearse that.
- Numbers: say "a hundred and six", not "one-zero-six".
- Use the rendered launch video (`loadout-launch.mp4`) as the post's attached video; the recorded
  demo works best as the follow-up post or the YouTube link in the HN thread.
- End every post with the two links: loadout.gilla.fun + github.com/Rohithgilla12/loadout.
