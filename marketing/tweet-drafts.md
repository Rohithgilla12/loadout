# Overnight progress — tweet drafts (2026-06-11)

Claude built these features overnight; tweets drafted but NOT posted
(Chrome had no CDP port, and I wasn't going to restart your browser with a
possibly-unsent launch thread in the composer). Post whichever you like,
ideally as replies to the launch thread.

## 1 — the CLI (shipped, c29dad3)

> Overnight, Loadout grew a CLI 👀
>
> loadout switch typescript — swap your whole skill set from the terminal
> loadout check — CI catches teammates drifting from the repo's loadout.json
>
> Same Rust engine as the app, now scriptable. Dotfiles people, this one's for you.

(attach: terminal screenshot of `loadout status` + `loadout switch`)

## 2 — auto-activation (shipped, 0d30534)

> Loadout now does direnv-for-skills.
>
> Register a project → it detects go.mod, package.json, Cargo.toml… and
> suggests the matching profile. One click to accept, or flip on "auto"
> per project and it just happens.
>
> Your agent walks into a Go repo carrying Go skills. As it should.

(attach: screenshot of the suggestion banner in Projects)

## 3 — skill editor (shipped, a3f077c)

> New in Loadout: a skill editor that lints your descriptions.
>
> The description IS the trigger — agents decide what to load from it.
> So the editor checks for "Use when…" phrasing, flags thin or bloated
> descriptions, and shows the token cost per session as you type.

(attach: editor screenshot — split view with lint panel)

## 4 — overlap report (shipped, 603f18f)

> Ran Loadout's new redundancy report on my own library:
>
> ✗ frontend-design ↔ impeccable — 74% similar descriptions
> ✗ "animations" claimed by 10 different skills
>
> No wonder agents pick the wrong skill sometimes. Doctor now catches this.

## 5 — the overnight recap (post in the morning)

> I went to sleep. Claude Code didn't.
>
> Overnight it shipped to Loadout, with tests:
> • a full CLI (loadout switch / check / suggest)
> • auto-activation — go.mod → go profile, suggested automatically
> • a skill editor with description linting
> • a redundancy report that found real duplicates in my library
>
> 4 features, 6 commits, all green. The future is weird. 🔥

(this one is the meta-story teaser — links well to the Day-7 thread)
