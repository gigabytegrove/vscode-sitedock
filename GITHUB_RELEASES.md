# SiteDock — GitHub-only releases and built-in updates

**Single official repository:** [`gigabytegrove/vscode-sitedock`](https://github.com/gigabytegrove/vscode-sitedock) (public).

**Download and update feed:** [`gigabytegrove/vscode-sitedock/releases`](https://github.com/gigabytegrove/vscode-sitedock/releases).

The source, release tags, installable `.vsix`, matching `.sha256`, and release notes all live in this same repository. **Do not create `sitedock-releases` or configure a separate repository.** GitHub Actions and the Microsoft Marketplace are not required. The v0.4.0 release is published and is the established working baseline; v0.5.0 is in source development.

## Existing SiteDock v0.3.1 installations

v0.3.1 already defaults to `sitedock.updates.repository = "gigabytegrove/vscode-sitedock"`, so users upgrading from that version should **not** have to change any settings. A user-defined override in VS Code Settings takes precedence over the default; check **SiteDock → Site Manager → Updates → Settings** if you changed it previously.

The v0.4.0 source briefly used an incorrect `sitedock-releases` default. The corrected code returns to the **same repository used by v0.3.1**. v0.4.0 is published. The v0.5.0 source becomes updater-visible only after official packaging and publication.

## 1. Prerequisites on the build computer

- Git clone or an exact checkout of the intended release commit.
- Node.js LTS with npm and registry access (Node.js 22 recommended).
- Authenticated GitHub CLI (`gh auth login`) with permission to publish releases under `gigabytegrove/vscode-sitedock`.
- A desktop VS Code installation and a controlled FTP/SFTP server for release acceptance testing.

No PAT, GitHub CLI, or GitHub Actions runner is required **on the machines receiving an update**.

## 2. Prepare and test source

```bash
git clone https://github.com/gigabytegrove/vscode-sitedock.git
cd vscode-sitedock
npm install --include=dev --no-audit --no-fund
npm run check
```

Verify `package.json` and `RELEASE_NOTES.md` reflect the proposed release. Commit the approved source before building; the release tag should identify that exact approved source commit.

## 3. Build an official VSIX and checksum

```bash
npm run release:build
npm run release:verify
```

Or on Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Build-GitHub-Release.ps1
```

For a future `0.5.0` package, the output would be:

```text
dist/sitedock-v0.5.0.vsix
dist/sitedock-v0.5.0.vsix.sha256
```

Both artifacts must pass the official `@vscode/vsce` packaging and checksum/extension-identity verifier. **Do not publish the manually packaged development VSIX** as an official release. If the official packager cannot run, the release remains blocked rather than substituting an unverified package.

## 4. Publish to the SAME repository

```bash
npm run release:publish
```

The publishing script defaults to `gigabytegrove/vscode-sitedock`, verifies the repository is public, and uploads the VSIX and `.sha256` together with the release notes. It does **not** create a repository or change permissions/visibility.

Windows build **and** publish:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Build-GitHub-Release.ps1 -Publish
```

Then verify the release at:

`https://github.com/gigabytegrove/vscode-sitedock/releases/tag/v0.5.0`

Use `v<package-version>` as the tag; a beta version must be published as a prerelease. There must be **exactly one** uploaded `sitedock-*.vsix` and its exact matching `<filename>.sha256`. The release publisher should be authenticated with GitHub CLI; SiteDock's updater does not use those credentials.

## 5. Install and test an upgrade from v0.3.1

1. Publish the new verified release assets and confirm they are anonymously accessible in a browser.
2. On a test installation of **SiteDock v0.3.1**, open **SiteDock → Site Manager → Updates**. Confirm the source is `gigabytegrove/vscode-sitedock` and the stable channel is selected.
3. Click **Check for Updates**. Verify the release version and notes appear.
4. Choose **Install Update**. SiteDock downloads the official VSIX, verifies the GitHub digest or `.sha256`, checks publisher/name/version, and invokes VS Code's VSIX installation command.
5. Reload VS Code and confirm the new extension version. Test saved sites, credentials, active/open-site state, browsing, editing, and transfers.
6. Record the VS Code and OS versions tested. Repeat on each supported platform before claiming broad compatibility.

Update source settings (defaults):

```json
{
  "sitedock.updates.enabled": true,
  "sitedock.updates.channel": "stable",
  "sitedock.updates.repository": "gigabytegrove/vscode-sitedock",
  "sitedock.updates.checkIntervalHours": 12,
  "sitedock.updates.autoInstall": false
}
```

The GitHub updater uses HTTPS, rejects ambiguous/bad assets, validates the checksum and package identity, and avoids downgrades. A GitHub release alone **does not prove the updater has worked on a real desktop client**.

## 6. Failure handling and release gate

- **No update found:** Confirm there is a published release newer than the installed version with the correct tag, one VSIX asset, a valid digest/checksum, and the requested stable/beta channel. A public repository with **zero releases** is not a new-version feed.
- **HTTP 404:** Check the configured repository and release existence. Do not embed a PAT in client builds.
- **HTTP 403:** Observe API rate limits; do not loop manual checks.
- **Checksum/identity mismatch:** Stop. Do not manually install the rejected artifact. Rebuild from approved source and republish correctly.
- **Packaging failure:** Confirm `npm install --include=dev` installed `@vscode/vsce`. Do not downgrade to a custom ZIP packager.
- **Install failure:** Inspect **Output → SiteDock**, verify the correct VS Code version, and report the error rather than claiming success.

For release acceptance, follow [QUALITY_GATES.md](QUALITY_GATES.md). Before declaring a release complete, verify the GitHub release URL, uploaded assets, official VSIX checksum and identity, UI discoverability, a real upgrade/reload from v0.4.0, and end-to-end FTP/SFTP operations.
