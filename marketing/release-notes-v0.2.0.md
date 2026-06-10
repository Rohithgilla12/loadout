**Loadout v0.2.0 — Loadout learns your habits.**

Three features, one idea: switching kits should be ambient, and your own usage should do the curating.

🌐 https://loadout.gilla.fun · `brew install --cask rohithgilla12/loadout/loadout`

## ✦ Menu bar quick-switcher

Switch your base profile — or any project's kit — from the tray, two clicks, no window.
Closing the window now hides it; Loadout lives in your menu bar (quit from the tray or ⌘Q).
Tray and window stay in sync both ways.

## ✦ Context budget meter

Agents inject every installed skill's name + description into every session. Now you can see
the bill: a **Tok** column per skill in the Library, and every profile header shows
**“≈ N tok/session · M% of library.”** The case for slim kits, as arithmetic.

## ✦ Local skill-usage analytics

Loadout scans your Claude Code session transcripts — locally, incrementally, nothing leaves
your machine — and shows which skills *actually fire*: a **Used** column (count + last used),
an **unused** filter, and the headline: *“N of M skills used in the last 30 days.”*
Then the button that earns the release: **Build profile from usage** — a kit made of only
the skills you genuinely use.

## Also

- Project-scope apply now materializes only the project kit (base stays global; no more
  symlink piles in your repos — and agent dirs are gitignore-recommended)
- Homebrew tap is live, with automatic cask bumps on release

## Updating

v0.1.x installs get the in-app update banner — one click, signed, restart. Or `brew upgrade`.
