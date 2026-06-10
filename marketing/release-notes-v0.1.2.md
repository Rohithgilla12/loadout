**Loadout v0.1.2** — one important fix for project applies.

🌐 https://loadout.gilla.fun · [v0.1.1 notes](https://github.com/Rohithgilla12/loadout/releases/tag/v0.1.1)

## Fixed

- **Project applies no longer copy your base profile into the repo.** Applying a
  profile to a project (including *Review & apply* from a repo's `loadout.json`)
  used to symlink the *entire* base profile into the project's agent dirs —
  `ls .claude/skills` in a repo with a 5-skill loadout would show 100+ entries.
  Project scope now materializes only the project's profile; base skills stay in
  your global agent dirs, where agents already pick them up. Re-applying a
  project from the Projects view cleans up any previously-copied base links.

## Updating

Existing installs: the in-app banner will offer this update (signed, from
GitHub Releases) — or Settings → *Check for updates*, or grab the artifacts below.
