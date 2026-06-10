**Loadout v0.1.0** — the first release. Switchable skill sets for AI coding agents.

🌐 **Website:** https://loadout.gilla.fun · 📖 [README](https://github.com/Rohithgilla12/loadout#readme)

## What's in the box

- **Profiles** — named skill kits, layered as an always-on base plus per-project assignments. Switching rewrites symlinks: instant, offline, reversible.
- **Library** — one screen of truth: every skill, every agent (Claude Code, Cursor, Codex/Copilot via `.agents`), every version, with rendered SKILL.md and full file trees.
- **One-click import** — Doctor finds skills installed by other tools (e.g. `npx skills`), dedupes through symlinks, and migrates everything into a managed profile — with an automatic backup first.
- **Trust-first installs** — from skills.sh (trending/search built in) or any git URL: rendered skill, file listing, executable scripts flagged, all before anything lands on disk.
- **Safe updates** — pinned to exact commits in a lockfile; see the diff, apply in one click, roll back in one click.
- **Team loadouts** — commit `loadout.json` and teammates get the identical, commit-pinned skill environment after an explicit review.
- **Share your loadout** — https://loadout.gilla.fun: your kit as a link. No account; the loadout travels in the URL (with optional short links).
- **Auto-updates** — the app checks GitHub Releases on launch and offers a signed, one-click update. Nothing installs silently.

## Install

**macOS** (universal, signed & notarized): download `Loadout_0.1.0_universal.dmg` below.
**Linux:** `.AppImage`, `.deb`, or `.rpm`.

Loadout interoperates with the existing skills CLI — same SKILL.md spec, same directories, and it adopts what's already installed rather than replacing it.

## Notes

- Pre-1.0: the `~/.loadout` store/lockfile layout may change between releases.
- Windows is not supported yet (symlink semantics); planned.
- Zero-data-loss invariant: Loadout never deletes or modifies files it didn't create.
