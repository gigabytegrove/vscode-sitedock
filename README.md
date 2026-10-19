<div align="center">

<img src="media/icon.png" alt="SiteDock icon" width="88">

# SiteDock

**Live FTP, FTPS & SFTP editing for Visual Studio Code.**

Manage multiple servers, browse remote files, edit them in VS Code, and save changes directly back to the server—without juggling separate FTP clients or hand-written connection files.

[![Build and tests](https://github.com/gigabytegrove/vscode-sitedock/actions/workflows/build.yml/badge.svg)](https://github.com/gigabytegrove/vscode-sitedock/actions/workflows/build.yml)
![VS Code 1.100+](https://img.shields.io/badge/VS_Code-1.100%2B-007ACC)
![Version 0.1.9](https://img.shields.io/badge/version-0.1.9-informational)
[![MIT License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE)

**[Get started](#getting-started) · [Features](#features) · [Build from source](#build-from-source) · [Troubleshooting](#troubleshooting) · [Report an issue](https://github.com/gigabytegrove/vscode-sitedock/issues)**

</div>

> [!IMPORTANT]
> **Development release — v0.1.9.** SiteDock has not yet been published to the VS Code Marketplace. This version also requires **Node.js/npm and access to the npm registry for its first FTP/SFTP connection**. Do not expect a fully offline, self-contained installation. The automated tests use simulated servers; compatibility with every hosting environment is not guaranteed.

## Why SiteDock?

Remote editing shouldn't require a new project, a JSON configuration file, or a separate FTP application just to change one line on a website.

SiteDock brings the familiar file explorer and editor experience into VS Code:

- **All your servers in one place.** Save separate websites, environments, and hosting accounts in a dedicated sidebar.
- **Edit on the server.** Open a remote text file and press **Ctrl+S** to write your changes directly to its remote path.
- **Use the right viewer.** Open images in VS Code's image preview, play supported media, or use a registered VS Code editor.
- **See what's happening.** Track uploads, downloads, saves, errors, and recent file operations in **Transfers & Activity**.
- **Keep credentials out of config files.** Passwords and key passphrases are stored with VS Code's SecretStorage.

## Features

| Area | What SiteDock supports |
| --- | --- |
| **Connections** | Multiple named sites; FTP, explicit FTPS, implicit FTPS, and SFTP |
| **SFTP authentication** | Password, keyboard-interactive password prompts, and SSH private keys |
| **Remote editing** | VS Code filesystem integration and direct-to-server saves |
| **File operations** | Create, rename, delete, upload, download, and open a remote server as a workspace |
| **Folder transfers** | Recursive upload/download with replace-or-skip choices and preflight limits |
| **Activity** | FIFO transfer queue, streaming byte progress, failure details, current-session retry, and recent history |
| **Previews** | Common image, audio, and video formats; other registered VS Code editors where compatible |
| **Security** | SSH host-key fingerprint review, FTPS certificate verification, and SFTP site-root link protections |

### Files open in the right place

Selecting a remote file uses VS Code's file associations where possible:

- **Images:** PNG, JPG/JPEG, GIF, WEBP, SVG, BMP, ICO, and AVIF open in an image preview. A read-only fallback is available for supported images up to 12 MB.
- **Media:** MP3, WAV, OGG, MP4, and WEBM use supported VS Code media viewers.
- **Code and text:** Open in VS Code and save back to the server with **Ctrl+S**.
- **Other formats:** SiteDock asks VS Code to use a registered editor; some third-party editors do not work with virtual filesystems.

Right-click **Open as Text** to inspect a file's source, including SVG markup. **Open in Desktop App (Local Copy)** lets you save a remote file locally and open it in your operating system's default application.

> **Desktop-app edits do not sync automatically.** Open in Desktop App creates a *local copy*, not a live-editing connection. Upload the modified file through SiteDock when you're ready.

## Getting started

### Requirements

- Desktop **Visual Studio Code 1.100.0 or newer** (the project is not a browser-based FTP client).
- Access to an FTP, FTPS, or SFTP server.
- **Node.js with npm**, plus connectivity to `registry.npmjs.org`, for the one-time transport-library setup in this version.

### Install the extension

SiteDock is not yet available for one-click Marketplace installation. Until it is published, you can:

1. Build a VSIX from source using the instructions [below](#build-from-source), **or** download the VSIX artifact from a **successful** [GitHub Actions build](https://github.com/gigabytegrove/vscode-sitedock/actions/workflows/build.yml).
2. In **VS Code**, press **Ctrl+Shift+P** (or **Cmd+Shift+P** on macOS).
3. Run **Extensions: Install from VSIX...**, select the VSIX, and reload the window.
4. Run **SiteDock: Install Connection Libraries** from the Command Palette. The libraries are cached for subsequent connections.

**Windows note:** Install a VS Code VSIX **inside VS Code**. Double-clicking it in File Explorer may launch the unrelated Visual Studio VSIX installer.

### Add your first server

1. Open the **SiteDock** icon in VS Code's Activity Bar, then click **Add Server** in **My Servers**.
2. Select **SFTP** (recommended), **FTPS**, **Implicit FTPS**, or **FTP**.
3. Enter a recognizable **Site name**, **Server hostname**, **Port**, **Username**, and **Starting directory**.
4. Choose an authentication method and enter your password or SSH key details.
5. Click **Test Connection**. For SFTP, check the server's host-key fingerprint against a trusted source before approving it.
6. Click **Save Server**, then expand the site under **My Servers**.

For an existing server, leaving the password field empty means **keep the saved password**. It does not mean the saved credential is missing.

### Edit a remote file

1. Expand a saved site and browse to the file.
2. Select a text or code file to open it in VS Code.
3. Make your changes and press **Ctrl+S**.
4. Check **Transfers & Activity** for the save or any reported error.

**Changes are made to the live server.** Keep backups and test carefully before editing production files.

## Transfers & Activity

SiteDock includes a dedicated **Transfers & Activity** view under **My Servers**, as well as the **SiteDock: Show Transfers & Activity** command.

**Manual transfers** are placed in a FIFO background queue. Transfer entries may be *queued, running, completed, failed, skipped, cancelled,* or *interrupted*. Streaming local-file uploads and downloads display byte progress.

You can:

- Upload files or folders and download files or folders using the explorer context menu.
- Choose **Replace Existing Files** or **Skip Existing Files** for bulk folder transfers.
- Cancel a transfer **while it is queued**; already-running writes cannot be cancelled through this command.
- Retry a failed transfer **during the same VS Code session**, while its original operation handler is still available.
- Inspect error details under **Output → SiteDock**.

Recent activity includes remote opens, live saves, creations, renames, deletions, and transfers. Up to **200 finished operations** are retained between sessions; unfinished operations are marked interrupted after restart and are **not automatically resumed**.

Bulk transfers have a preflight limit of **3,000 entries** and **32 directory levels**. Local directory symlinks are skipped during recursive upload, and linked subdirectories are skipped during recursive download to avoid unexpected traversal.

## Symbolic links and site boundaries

SFTP site listings can contain symbolic links to files or directories. SiteDock identifies these links and allows normal file/folder navigation when their destinations are accessible and permitted.

For SFTP connections:

- Links that resolve **outside the configured Starting directory** are **blocked by default**.
- A blocked link remains visible, and its resolved destination is shown in the tooltip when available.
- To access a trusted external link, edit the connection and explicitly enable **Allow symbolic links outside the starting directory**.
- Deleting a symlink removes **the link itself**, not the linked directory's contents.
- Recursive operations avoid traversing directory links, and browsing has protections against loops.

The containment mechanism relies on SFTP path resolution. **FTP/FTPS do not offer the same reliable realpath-based boundary enforcement.** A starting directory is not a substitute for server-side permissions or isolation.

## Security and operational limitations

SiteDock is intended for authorized remote-server access.

- **Prefer SFTP or FTPS.** Plain FTP sends credentials and file contents without encryption.
- **Check SSH fingerprints** before trusting a new or changed host key. Authentication diagnostics can show SSH methods offered by the server without sending your saved password or private key.
- **Credentials:** Passwords and SSH key passphrases use VS Code SecretStorage instead of being written into site profiles.
- **Live writes are not guaranteed atomic.** Interrupted network transfers may leave incomplete remote uploads; keep server-side backups.
- **Conflict checks are best-effort.** They compare server-provided file metadata, which may not detect every concurrent edit.
- **External apps are separate.** Opening a downloaded local copy in another application does not enable automatic synchronization.
- **Transport installation is not bundled into startup.** The v0.1.9 runtime invokes npm once to prepare `basic-ftp` and `ssh2-sftp-client` in VS Code's writable extension storage.

## Troubleshooting

<details>
<summary><strong>Connection rejected / “All configured authentication methods failed”</strong></summary>

Check the host, port, username, and selected SFTP authentication method. In the server editor, use **Check SSH methods** to view the methods advertised by the SSH server without submitting saved credentials. Some hosts require keyboard-interactive rather than password authentication; others disallow password-based root login. The advertised methods do not guarantee that your account is authorized.

Compare the connection with an independent SSH/SFTP client before changing server security settings.

</details>

<details>
<summary><strong>Connection libraries won't install</strong></summary>

Install Node.js LTS and ensure `node` and `npm` are accessible on your PATH. Confirm access to `registry.npmjs.org`, then run **SiteDock: Install Connection Libraries** again. Read **Output → SiteDock** for the underlying npm error.

</details>

<details>
<summary><strong>A symbolic link is visible but can't be opened</strong></summary>

Hover over the link to inspect its target. It may be broken, inaccessible to the login account, or outside the site root. If the target is deliberately outside your starting directory, you can enable external-link access in that server's settings—but only after verifying the destination.

</details>

<details>
<summary><strong>An image, PDF, or other file isn't previewing correctly</strong></summary>

Common images use VS Code's built-in preview, with a fallback for supported images. Other types depend on installed VS Code editor support; for example, PDFs may require a compatible preview extension. Some editors cannot open `sitedock://` resources. Use **Open in Desktop App (Local Copy)** when needed, then upload any changes manually.

</details>

<details>
<summary><strong>SiteDock says a command is missing or shows the wrong version</strong></summary>

Run **Developer: Reload Window** and then **SiteDock: Show Diagnostics**. Verify that VS Code loaded the intended extension/version before troubleshooting a connection.

</details>

<details>
<summary><strong>My sites disappeared after switching from a local test build</strong></summary>

Older test packages used the identity `sitedock-local.sitedock`. The Gigabyte Grove build uses `GigabyteGrove.sitedock`, which VS Code treats as a **different extension** with separate global state and SecretStorage. Sites and credentials are **not automatically migrated**. Keep the older installation until you've recreated and tested your connections. Never export passwords into plaintext configuration files.

</details>

For reproducible defects, [open an issue](https://github.com/gigabytegrove/vscode-sitedock/issues) with the SiteDock version, VS Code version, operating system, protocol, reproduction steps, and a **redacted** excerpt from **Output → SiteDock**. Do not include passwords, private keys, tokens, or server secrets.

## Build from source

The repository includes the extension source, automated tests, and an official `@vscode/vsce` packaging workflow.

```bash
git clone https://github.com/gigabytegrove/vscode-sitedock.git
cd vscode-sitedock
npm install
npm run check
npm run package
```

The resulting `.vsix` can be installed through **Extensions: Install from VSIX...**. The project uses Node.js 22 in [GitHub Actions](.github/workflows/build.yml).

On Windows, you can also run **`Build-Official-VSIX.cmd`** to build and validate a release candidate; see [PUBLISHING.md](PUBLISHING.md) for Marketplace packaging details.

### Project structure

```text
src/
  extension.js    VS Code activation, commands, and views
  connection.js   FTP/FTPS/SFTP transport and remote operations
  filesystem.js   VS Code remote filesystem provider
  tree.js         Multi-site explorer and symlink presentation
  activity.js     Transfer queue and activity history
  bulk.js         Recursive folder transfer planning
  opening.js      Media previews and desktop-app handling
  editor.js       Connection editor integration
  storage.js      Site profiles and secure credential access
  runtime.js      One-time transport library preparation
  paths.js        Remote path helpers
ui/
  editor.html     Graphical connection editor
media/            Extension icon and Activity Bar artwork
test/             Automated Node.js tests
.github/workflows/build.yml   CI checks and VSIX artifact
```

The automated suite covers file handling, authentication behavior, activity/transfer logic, and filesystem simulations. **Passing unit tests is not proof of successful integration against every live FTP/SFTP server.**

## Contributing and publishing

Bug reports, reproducible test cases, documentation improvements, and pull requests are welcome. Please run `npm run check` before submitting code changes, and do not include credentials or production-server information in issues or commits.

The VS Code Marketplace publishing process is tracked separately from source development. See [PUBLISHING.md](PUBLISHING.md) for instructions; a GitHub build artifact does **not** mean that a Marketplace release has been approved.

## License

SiteDock is open source under the [MIT License](LICENSE). Third-party FTP/SFTP libraries are subject to their respective licenses.

<div align="center">

Built by [Gigabyte Grove](https://github.com/gigabytegrove) · **Manage your sites. Edit where they live.**

</div>
