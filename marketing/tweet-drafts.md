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
