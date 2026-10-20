# SiteDock GitHub-only distribution and updates

This is the official release procedure for SiteDock starting with **v0.3.0**. No Marketplace publisher, Azure DevOps, GitHub Actions runner, GitHub-hosted CI build or extension-side GitHub credentials are required.

## 1. Select a PUBLIC release repository

**Current source:** `gigabytegrove/vscode-sitedock` (currently private).

The GitHub Releases API returns no anonymous release information for private repositories. Consequently, there are two supported layouts:

- **Public source + releases together:** make `gigabytegrove/vscode-sitedock` public once you decide its contents are ready for general distribution, and publish all VSIX assets there. SiteDock's default `sitedock.updates.repository` setting already matches.
- **Private source + public binary releases:** keep this repository private and create a separate PUBLIC repository (example name `gigabytegrove/sitedock-releases`). Publish only official VSIX packages, checksums and release notes there. Point `sitedock.updates.repository` to the public distribution repository in your deployment configuration **before the initial VSIX is distributed**.

No third-party tokens should be bundled in an extension. The second layout is best when source must remain private. Neither repository's visibility is changed by the release scripts.

## 2. Install local prerequisites

- Node.js LTS and npm (Node 22 recommended)
- Git (for cloning, committing and optionally tagging source)
- GitHub CLI (`gh`) for publishing; sign in on the **publisher machine** with `gh auth login`
- Permission to publish releases in the selected PUBLIC destination repository

The extension itself does not need `gh` or a PAT to receive updates.

## 3. Prepare the source

```bash
git clone https://github.com/gigabytegrove/vscode-sitedock.git
cd vscode-sitedock
npm install --include=dev --no-audit --no-fund
npm run check
```

Before releasing, increment the `version` in `package.json`, commit the release to your source repository and prepare `RELEASE_NOTES.md`. The GitHub release tag must use `v` followed by precisely the same version (for example `v0.3.0` or `v0.3.1-beta.1`). `-beta` releases must be flagged as **pre-releases** when published.

**Do not package with the legacy `scripts/build_vsix.py` tool.** Distribution builds must use `@vscode/vsce` through the local official build script.

## 4. Build the VSIX and checksum (offline with respect to GitHub)

```bash
npm run release:build
npm run release:verify
```

Or on Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Build-GitHub-Release.ps1
```

The commands validate source/tests, use the installed official `@vscode/vsce`, inspect `extension/package.json` inside the VSIX, and generate:

```text
dist/sitedock-v0.3.0.vsix
dist/sitedock-v0.3.0.vsix.sha256
```

The checksum file is in conventional `sha256sum` format: `<sha256>  <exact VSIX filename>`. The SHA-256 and extension identity MUST be verified before release publication.

## 5. Publish the release (manual, no CI)

**Confirm your destination repository is PUBLIC and initialized with a `main` branch.** The publication script refuses private repositories. It will **not** create a new repository or change repository privacy.

```bash
npm run release:publish -- --repo gigabytegrove/vscode-sitedock
```

For a separate public release repository replace `--repo` with its actual owner/repo.

The publisher invokes `gh release create`, includes **both** artifacts, marks pre-release versions correctly, includes `RELEASE_NOTES.md`, and refuses to publish if checksum, VSIX identity, or destination visibility validation fails. `gh release create` creates a version tag at the release destination's `main` if the tag does not exist. For traceable source history, tag the exact commit in the source repository separately.

PowerShell build-and-publish in one command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Build-GitHub-Release.ps1 -Publish -Repository gigabytegrove/sitedock-releases
```

The release URL should be of the form `https://github.com/OWNER/REPO/releases/tag/v0.3.0`. Check that it displays one VSIX and its matching `.sha256` checksum. **Do not upload multiple differently named SiteDock VSIX files to one release**: the updater deliberately rejects ambiguous artifacts.

## 6. Configure initial VSIX clients

Open VS Code settings and find `SiteDock Updates`, or run **SiteDock: Update Settings**.

```json
{
  "sitedock.updates.enabled": true,
  "sitedock.updates.channel": "stable",
  "sitedock.updates.repository": "gigabytegrove/vscode-sitedock",
  "sitedock.updates.checkIntervalHours": 12,
  "sitedock.updates.autoInstall": false
}
```

Change `repository` to the exact public binary releases repository if you use that layout. For family or team distribution, document this value alongside the first installer; the initial users must configure it once unless the build uses the chosen repository as its default. Stable clients ignore prereleases; beta clients see compatible newer beta or stable versions.

### Install, update and reload

- Bootstrap: VS Code → **Extensions: Install from VSIX...** → first official VSIX.
- Update: Command Palette → **SiteDock: Check for Updates**. Or wait for the background check in the running extension host.
- Choose **Install Update** or enable **Auto Install** in settings, which still prompts to reload after installation.
- The VSIX is SHA-256 verified and its identity checked before SiteDock calls the VS Code installation command.
- **SiteDock: View GitHub Releases** opens the configured release repository for human review.

**Updates do not change the extension ID**, so VS Code retains existing profiles, SecretStorage secrets, favorite/open-site settings and saved editor state. Always keep backups of remote servers before major application changes.

## 7. Security and supported limitations

- A private GitHub source repo cannot be used as an anonymous public release feed. A 404 typically means private, missing, or no visible releases.
- For a release, `tag_name` must be a semantic version, `draft` must be false, and there must be exactly one uploaded asset matching `sitedock-*.vsix`. Release assets need GitHub's SHA-256 digest or a companion `.vsix.sha256` asset.
- Downloads use HTTPS and permit GitHub-hosted redirect endpoints only; archives are capped at 120 MiB and metadata at 2 MiB. The extension performs no credentialed or token-based GitHub requests.
- SHA-256 detects mismatch or accidental substitution. It is not proof that a GitHub publisher account is uncompromised. Protect release publishing permissions and MFA accordingly.
- Installation uses VS Code's built-in VSIX install command and then offers a reload. Live user acceptance of that command remains necessary on the target VS Code version/platform; a simulated test is not an end-to-end proof.
- If no newer compatible release exists, manual checks report "up to date". Automatic checks are rate-limited, and update failures are logged in **Output → SiteDock**.
- Network interruption, unexpected redirect, digest mismatch, incorrect publisher ID, version mismatch, and malformed archives **block installation**. Temp downloads are removed afterward.

## Troubleshooting

1. **No update found:** Check repository, release tag, prerelease flag, asset count, digest/checksum, channel and local version.
2. **404/private:** Publish through a *public* GitHub release repository or change source visibility deliberately; never embed a PAT in the VSIX.
3. **403/rate limit:** Retry later; unauthenticated GitHub API calls have rate limits. Avoid forcing constant refreshes.
4. **Checksum mismatch:** Stop and rebuild from source; never bypass the verifier.
5. **Installation command unavailable:** Try the VSIX manually using VS Code → Extensions → **Install from VSIX...**, and report VS Code/version and logs. Do not report automatic success in this case.
6. **Failed package build:** Ensure `npm install --include=dev` finished. Use a supported Node LTS version and check that the official `@vscode/vsce` tool is in `node_modules/.bin`.

## Validation checklist before announcing a public release

- [ ] Source version, release tag and VSIX package version match.
- [ ] Source checks and tests pass.
- [ ] Official vsce packaging and checksum verification pass.
- [ ] Public GitHub release contains one VSIX and exact matching sidecar.
- [ ] On a clean Windows desktop VS Code installation, initial VSIX installs successfully.
- [ ] A test client on an older version detects the newer release on the correct channel.
- [ ] Release notes link works; verified download, install and reload succeed.
- [ ] Existing SiteDock sites, credentials and workspace preferences remain unchanged after the upgrade.
- [ ] Repeat on macOS/Linux if those platforms are part of the announced support scope.
