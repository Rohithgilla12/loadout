# Releasing Loadout

Releases are built and published by `.github/workflows/release.yml` when a `v*` tag is pushed.
macOS artifacts are signed and notarized; the release is created as a **draft** for a final
look before publishing.

## One-time setup: repository secrets

Settings → Secrets and variables → Actions → New repository secret:

| Secret | What it is |
|---|---|
| `APPLE_CERTIFICATE` | Base64 of your **Developer ID Application** `.p12` export: `base64 -i cert.p12 | pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | The certificate's full name, e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | An **app-specific password** (appleid.apple.com → Sign-In & Security) |
| `APPLE_TEAM_ID` | 10-character team ID from developer.apple.com/account |

To export the `.p12`: Keychain Access → My Certificates → right-click the
"Developer ID Application" cert → Export, choose a password.

### Auto-update signing

| Secret | What it is |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Updater minisign private key (`~/.tauri/loadout-updater.key`) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password (`~/.tauri/loadout-updater.password.txt`) |

The matching public key is committed in `tauri.conf.json` (`plugins.updater.pubkey`).
The app checks `releases/latest/download/latest.json` on launch and offers a
one-click "Update & restart" — nothing installs silently. **Back up the key
files**: lose them and shipped apps can never accept another update.

## Cutting a release

```bash
# bump versions (keep in sync): apps/desktop/src-tauri/Cargo.toml,
# apps/desktop/src-tauri/tauri.conf.json, apps/desktop/package.json
git tag v0.1.0
git push origin v0.1.0
```

The workflow produces:
- macOS: universal `.dmg` + `.app` (signed + notarized)
- Linux: `.AppImage` + `.deb`

Then: review the draft release on GitHub, write release notes, publish.

## Homebrew tap

Live at [Rohithgilla12/homebrew-loadout](https://github.com/Rohithgilla12/homebrew-loadout)
(`brew install --cask rohithgilla12/loadout/loadout`). The `update-tap.yml` workflow bumps the
cask automatically when a release is **published** — it needs a `TAP_GITHUB_TOKEN` repo secret
(fine-grained PAT with contents:write on homebrew-loadout). Without the secret it skips politely
and you bump version+sha256 in `Casks/loadout.rb` by hand.

### Original manual notes

Create a `Rohithgilla12/homebrew-loadout` repo with `Casks/loadout.rb`:

```ruby
cask "loadout" do
  version "0.1.0"
  sha256 "<shasum -a 256 of the dmg>"
  url "https://github.com/Rohithgilla12/loadout/releases/download/v#{version}/Loadout_#{version}_universal.dmg"
  name "Loadout"
  desc "Switchable skill sets for AI coding agents"
  homepage "https://github.com/Rohithgilla12/loadout"
  app "Loadout.app"
end
```

Users then install with `brew install --cask Rohithgilla12/loadout/loadout`.

## Versioning

`0.x` until the v1 PRD scope is fully shipped. Pre-1.0 releases may break the
`~/.loadout` layout; after 1.0 the store/lockfile format is stable.
