**Loadout v0.1.1** — sharing, polish, and fixes from the first day of real use.

🌐 https://loadout.gilla.fun · [v0.1.0 notes](https://github.com/Rohithgilla12/loadout/releases/tag/v0.1.0)

## New

- **Share a profile from the app** — Profiles → *Share…* creates a short link
  (`loadout.gilla.fun/s/your-slug`) with an optional **custom slug** and live
  availability check; *Copy loadout.json* puts a committable file on your clipboard.
- **Custom slugs on the web builder** too, with ✓ available / ✕ taken / 🔒 reserved feedback.
- **Settings → Updates** — see your version, check manually, one-click update & restart.
- **Settings → Sharing** — admin key field (unlocks reserved slugs).

## Improved

- Discover marks skills **already in your library** — picker rows and
  trending/search results show an *installed* badge instead of letting you double-install.
- Library: proper empty states for the Updates/Local filters; close the inspector
  with the ✕ button or **Escape**.
- Migration (Doctor → Import all): optional **backup first** (tar.gz of every agent
  dir) and a **live progress bar** through backup → import → re-apply.
- Dark mode 🌙 — System / Light / Dark in Settings, follows the OS.

## Fixed

- Installing from the source browser failed with `cannot parse 'github.com/owner/repo'` —
  canonical source ids now round-trip everywhere.

## Updating

Existing v0.1.0 installs: the in-app banner will offer this update (signed, from
GitHub Releases) — or grab the artifacts below.
