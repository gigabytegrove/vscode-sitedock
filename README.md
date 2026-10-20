<div align="center">
  <img src="media/icon.png" alt="SiteDock icon" width="88">

# SiteDock

### Manage your sites. Edit where they live.

**A Dreamweaver-inspired site manager and live FTP, FTPS & SFTP editor for Visual Studio Code.**

![Version](https://img.shields.io/badge/version-0.3.0-blue) ![VS Code](https://img.shields.io/badge/VS%20Code-1.100%2B-007ACC) [![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**[Get started](#getting-started) · [Site Manager](#site-manager) · [GitHub updates](#github-only-updates) · [Features](#features) · [Troubleshooting](#troubleshooting) · [Build & release](GITHUB_RELEASES.md)**
</div>

> [!IMPORTANT]
> **GitHub-only distribution.** SiteDock does not require the Visual Studio Marketplace. Install the first official VSIX manually; subsequent GitHub Releases can be checked and installed from inside VS Code. **The source repository is currently private:** updates require a *public* release repository. See [distribution setup](GITHUB_RELEASES.md) before attempting to publish.

## Why SiteDock?

SiteDock keeps live website editing where it belongs—in your code editor. Instead of switching between a traditional FTP client, a local file manager and VS Code, create named site connections and work directly with the remote content.

- **A real Site Manager** rather than just a permanent list of every server.
- **Focused editing:** choose one site and work on only that site's files.
- **Multiple open sites:** keep production, staging and clients open at once and switch between them.
- **Direct server saves:** open a remote text file and press **Ctrl+S** to upload the change.
- **A first-class activity queue:** see uploads, downloads, file changes and failures.
- **Native previews:** use VS Code's built-in image and media viewers when supported.
- **GitHub-delivered updates:** stable and beta channels, integrity checking, and VS Code-native installation.

## Site Manager

Open **SiteDock → Site Manager** or run **SiteDock: Open Site Manager** from the Command Palette. The manager provides searchable site cards, favorites, recently opened/active sites, batch opening and connection actions.

| Explorer layout | Behavior |
| --- | --- |
| **Active Site** | The server tree shows only your selected website, even if others are open. |
| **All Open Sites** | The tree shows every site you have chosen to open, but hides dormant connections. |
| **All Sites** | The original full server list, available whenever you prefer it. |

You can **open several sites concurrently**, change the active site using the status bar or **SiteDock: Switch Site**, and open a site in a separate VS Code window. Closing a site in Site Manager **does not delete it**, close its open editor tabs, or erase its credentials.

The Site Manager stores its layout, open-site selection and favorites between sessions.

## Features

| Area | Features |
| --- | --- |
| **Connections** | FTP, explicit FTPS, implicit FTPS, SFTP; customizable port and starting directory |
| **Authentication** | SFTP password, keyboard-interactive and SSH key support; SSH host fingerprint review |
| **Live editing** | VS Code filesystem provider, remote text editing, Ctrl+S remote saves, workspace opening |
| **File management** | Create, rename, delete, upload/download individual files and folders |
| **Transfers** | FIFO queue with byte progress, replacement/skip options, failed job details, and session retry |
| **Previews** | Images, audio/video (where VS Code supports them), associated editors, and Open as Text |
| **Desktop programs** | Explicitly download and open a **local copy** in your operating system's default app |
| **Links** | SFTP symbolic link navigation with site-root containment by default |
| **Updates** | GitHub Releases discovery, stable/beta channels, automatic checks, verified VSIX installs |
| **Preferences** | Configurable update source, interval, update notifications and optional auto-install |

### Transfers & Activity

Manual uploads and downloads run in a FIFO background queue. The **Transfers & Activity** sidebar tracks activity states—queued, running, completed, failed, skipped, cancelled and interrupted—and exposes details under **Output → SiteDock**.

You can cancel **queued** jobs, retry failures during the current VS Code session, and choose whether bulk folder operations replace or skip existing files. Finished history is capped at **200 operations**; unfinished jobs are marked interrupted on restart, **not silently replayed**. Bulk folder operations enforce a **3,000-entry / 32-level** preflight limit.

## Getting started

### Requirements

- Desktop **Visual Studio Code 1.100.0+** on Windows, macOS or Linux.
- Authorized access to an FTP, FTPS or SFTP server.
- An official SiteDock VSIX file built from source or downloaded from a published GitHub Release.

The **officially packaged** extension includes its FTP/SFTP transport dependencies and prefers those packages. A fallback installer remains for development/legacy builds and may need **Node.js/npm plus npm registry access** on first connection.

### Install SiteDock

1. Obtain the latest *verified official* `sitedock-vX.Y.Z.vsix` from the [GitHub Releases page](https://github.com/gigabytegrove/vscode-sitedock/releases) **once the project has a public release feed**. Until then, use [Build from source](#build-from-source).
2. In VS Code run **Extensions: Install from VSIX...** (Command Palette: `Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Select the `.vsix` file and **Reload Window** if requested.
4. Open the SiteDock Activity Bar view and launch **Site Manager**.
5. Add a connection, use **Test Connection**, and save it.

> On Windows, install VSIX files **from VS Code**, not by double-clicking them in File Explorer; Visual Studio and VS Code use different VSIX installers.

### Connect and edit

1. Choose **Add Server** and name your site (for example, `Production Website`).
2. Select **SFTP** (recommended), FTPS, implicit FTPS, or legacy FTP; enter host, port, username and starting directory.
3. Provide a password or SFTP key. Verify SSH fingerprints independently before approving them.
4. **Test Connection** and **Save Server**.
5. In Site Manager, click **Open** to show that site's files. Select text/code files to edit them.
6. Press **Ctrl+S** to save remotely. Check Transfers & Activity for results.

For other file types, choose **Open as Text** or **Open in Desktop App (Local Copy)**. **Changes made in your desktop app do not automatically synchronize back to the server.**

## GitHub-only updates

SiteDock checks releases from the public GitHub repository configured in the **SiteDock Updates** settings. It does **not** use Microsoft Marketplace APIs or require a Marketplace publisher account.

1. Open **SiteDock: Check for Updates** at any time. Automatic checks are enabled by default when VS Code starts and then periodically while it remains open.
2. If a newer suitable release exists, choose **Install Update**, **Release Notes**, or **Later**.
3. SiteDock downloads the VSIX into temporary local storage and verifies the **SHA-256 hash** from GitHub's asset digest or a matching `*.vsix.sha256` asset.
4. It inspects the VSIX to verify its publisher (`GigabyteGrove`), extension ID (`sitedock`) and version match the release before asking VS Code to install it.
5. Reload VS Code to activate the update.

**Optional:** Turn on **Auto Install** to install verified updates without a confirmation prompt, followed by a reload prompt. By default, downloads/installation require your approval.

| Setting | Default | Description |
| --- | --- | --- |
| `sitedock.updates.enabled` | `true` | Automatic update checks |
| `sitedock.updates.channel` | `stable` | `stable` or `beta` (beta also allows stable releases) |
| `sitedock.updates.repository` | `gigabytegrove/vscode-sitedock` | Public GitHub Releases repository (`owner/repo`) |
| `sitedock.updates.checkIntervalHours` | `12` | Check interval, clamped to 1–168 hours |
| `sitedock.updates.autoInstall` | `false` | Automatically install a verified update |

**Private source, public distribution:** The source repository can remain private, but clients cannot access a private repo's releases anonymously. Use a separate **public** GitHub repository for the official VSIX files, then configure `sitedock.updates.repository` to that repository. No embedded PAT or personal GitHub credentials are used. See [GITHUB_RELEASES.md](GITHUB_RELEASES.md) for publishing instructions.

**Safety behavior:** Unverified archives, wrong publisher IDs, unexpected versions, unsupported download hosts and ambiguous release assets are rejected. SiteDock never intentionally downgrades an installed version. Updates replace the extension code **under the same extension ID**, preserving your sites and VS Code SecretStorage. This is not a substitute for keeping server backups.

## Security and operational behavior

- **Prefer SFTP or FTPS.** Standard FTP transmits credentials and files unencrypted.
- **SSH fingerprints** must be reviewed for first connections or changed host keys.
- **VS Code SecretStorage** stores credentials and private-key passphrases, not plaintext site configuration.
- **SFTP symbolic links outside the Starting directory** are visible but blocked by default; enable external-link access only when you trust the destination. This realpath protection does not apply reliably to FTP/FTPS.
- **Uploads and live saves are not guaranteed atomic.** Interrupted connections can leave partial files. Keep backups, especially for production servers.
- **Conflict detection is metadata-based.** It may not catch every concurrent edit if the server has imprecise timestamps.
- **Remote editors differ.** Some third-party VS Code editors cannot open `sitedock://` virtual files. For those, use an explicit local copy.
- **Checksums protect download integrity**, but the trust of the published artifact still depends on controlling the GitHub account/repository. For additional assurance, compare the published SHA-256 independently.

## Troubleshooting

<details><summary><b>GitHub updates report HTTP 404 or cannot see releases</b></summary>

The selected repository may be private, missing or contain no public GitHub Releases. Open **SiteDock: Update Settings** and select an accessible public `owner/repo` source. A private GitHub repository cannot deliver anonymous updates without user credentials. Read **Output → SiteDock** for the exact error.
</details>

<details><summary><b>The release exists but SiteDock finds no update</b></summary>

The GitHub release must be published (not a draft), have a valid semantic version tag such as `v0.3.1`, and contain **exactly one** uploaded `sitedock-*.vsix` asset with a GitHub SHA-256 digest **or** its matching `.vsix.sha256` file. Stable ignores pre-releases. Use **Check for Updates** to bypass the automatic-check interval.
</details>

<details><summary><b>Update verification fails</b></summary>

Do not install the rejected VSIX manually. Check that the `.sha256` asset matches the VSIX exactly, the version in `extension/package.json` matches the release tag, and the publisher ID is `GigabyteGrove`. If the release artifact was replaced, create a corrected release and regenerate the checksum.
</details>

<details><summary><b>SFTP authentication fails</b></summary>

Verify host, port, username and SFTP authentication method. **Check SSH methods** shows methods advertised by the server without transmitting your saved password/key. Some hosts use keyboard-interactive authentication rather than the standard password method. Check **Output → SiteDock** for details.
</details>

<details><summary><b>A symbolic link is visible but cannot be opened</b></summary>

It may be broken, inaccessible, or outside the server's configured starting directory. Inspect its tooltip and verify the target. SiteDock can allow trusted external links using the site editor's **Allow symbolic links outside the starting directory** option.
</details>

<details><summary><b>My existing sites disappeared after switching publisher builds</b></summary>

Early test builds used `sitedock-local.sitedock`. Current builds use `GigabyteGrove.sitedock`. VS Code treats those as different extensions with separate storage; credentials and site profiles are **not migrated automatically**. Keep the prior installation until connections are reconfigured. Future updates using the current identity retain that storage.
</details>

## Build from source

Use Node.js LTS. The project includes automated tests and Microsoft's `@vscode/vsce` packager as a development dependency.

```bash
git clone https://github.com/gigabytegrove/vscode-sitedock.git
cd vscode-sitedock
npm install --include=dev
npm run check
npm run release:build
npm run release:verify
```

The verified official VSIX and its SHA-256 sidecar appear in `dist/`. The Windows equivalent is **`Build-GitHub-Release.ps1`**; see [GITHUB_RELEASES.md](GITHUB_RELEASES.md) for release publication without GitHub Actions or the Visual Studio Marketplace.

**Testing scope:** Node.js tests cover the site manager, simulated remote operations, update filtering, checksum/ZIP verification, and mocked VS Code update installation. They **do not** constitute an end-to-end desktop VS Code/real-server test. Confirm those environments before calling a build production ready.

## Project structure

```text
src/              Site manager, connection adapters, explorer, FS provider
  updates.js      VS Code update lifecycle, preferences and notifications
  update-utils.js Release selection, semantic versions and checksum rules
  update-network.js  HTTPS GitHub API and bounded streaming download
  update-vsix.js  SHA-256 and VSIX package identity verification
ui/               Site editor and site manager
media/            Icons
scripts/          Release creation, validation and local publishing
  build-release.js
  verify-release.js
  publish-release.js
test/             Automated Node.js tests
```

## License and contributions

MIT licensed; third-party FTP/SFTP libraries retain their own license terms. Report issues and suggest improvements via [GitHub Issues](https://github.com/gigabytegrove/vscode-sitedock/issues). Please include version, OS, VS Code version, reproducible steps and **redacted** output logs; never include server passwords, API tokens or private keys.

<div align="center">

**[Gigabyte Grove](https://github.com/gigabytegrove)** · *Manage your sites. Edit where they live.*

</div>
