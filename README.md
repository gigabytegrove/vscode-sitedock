# SiteDock — Multi-site Live FTP/SFTP for Visual Studio Code

SiteDock is a graphical FTP, FTPS and SFTP site manager for desktop VS Code. Browse multiple saved servers in the Activity Bar, open remote files directly in the editor, and press **Ctrl+S** to save back to the server. SiteDock uses VS Code SecretStorage for credentials rather than storing plaintext passwords in the site profiles.

## Public publisher and first release notes

This public-publisher build uses **GigabyteGrove.sitedock**, matching the publisher ID shown in the Visual Studio Marketplace publisher portal. This is SiteDock **0.1.9** with its editing, connection, and file-handling implementation unchanged. The accompanying Windows build kit uses the official `@vscode/vsce` packager.

**Important for existing local testers:** Earlier SiteDock builds used the extension ID `sitedock-local.sitedock`. Changing the publisher creates a **separate extension identity**, with its own VS Code globalState and SecretStorage. Existing servers, SSH host fingerprints, preferences and saved passwords do **not** automatically transfer. Record your server settings before switching, keep the old extension until your new site connections work, and re-enter credentials directly in the new extension. Do not copy secrets into plaintext files.

**Dependency requirement:** This build still uses npm on first connection to install `basic-ftp` and `ssh2-sftp-client` in VS Code's extension storage. It is **not** a self-contained offline extension. Node.js/npm and registry access are required for the first connection. These dependencies are cached afterward. Treat this as a public-release candidate, not a fully verified general-audience build.

## What's new in v0.1.9

- Native image previews, media viewers and VS Code file associations for remote files.
- Explicit **Open as Text** and **Open in Desktop App** actions. The desktop-app action downloads a local copy, and changes are not silently uploaded.


### Working with symbolic links

- **SFTP symbolic links to folders are expandable** in the server sidebar. SiteDock differentiates SFTP `lstat` (the link itself) from `stat` (the link's target), so a link to a website folder is treated as a directory rather than being opened as a file.
- Symbolic links to regular files can be opened and edited. Broken links are marked as such in the sidebar and aren't presented as openable files.
- Directory-link expansion checks resolved SFTP paths for ancestor loops and has a depth limit to prevent endlessly expanding recursive links. On SFTP servers where `realPath` isn't available, browsing still works with a depth limit.
- **Deleting a directory symlink unlinks the link**. Recursive deletion of a normal directory never traverses directory symlinks, even when they target folders outside the selected site root.
- Site root path normalization has been corrected, including removing trailing separators that some remote servers handle inconsistently.

### Transfers and activity

- A new **Transfers & Activity** panel is available below **My Servers** in the SiteDock Activity Bar.
- Manual file uploads/downloads run in a **FIFO background queue** instead of blocking the UI. Current byte counts and percentages are shown during streaming transfers of local files. An item records its state: queued, running, completed, failed, skipped, cancelled or interrupted.
- **Ctrl+S live saves, remote opens, renames, creations and deletions** also appear in the activity history.
- Click a history item to open its details in **Output → SiteDock**. Right-click a failed transfer to **Retry Failed Transfer** while the original transfer handler remains available in the same VS Code session. A failed operation is never marked as successful just because it was queued.
- Right-click a *queued* transfer to cancel it before starting. **Running transfers cannot be cancelled mid-write:** this avoids falsely reporting that a remote upload was cancelled after the server has already received it.
- Recent history persists between VS Code sessions, limited to the most recent 200 completed items. Operations unfinished at restart are marked *interrupted* and are never automatically replayed. Use the Clear Finished Activity action to clear past results.
- The VS Code status bar shows active work or failures. The queue uses bounded persistence and batches updates to limit UI/storage overhead.
- Manual local-file transfers use streams instead of reading entire files into memory. Downloads write to a temporary local file first and only replace the chosen destination after a successful transfer.

### Folder transfers

- **Upload Folder** recursively uploads a folder, keeping its subfolder layout. **Download Folder** recursively downloads a selected remote folder.
- Before a bulk operation begins, choose whether to **Replace Existing Files** or **Skip Existing Files**; skipped files are clearly identified in the queue.
- The extension preflights the complete operation plan before queueing anything. The limit is 3,000 entries and 32 levels deep, to prevent accidental runaway bulk operations.
- Local folder symlinks are skipped during recursive upload; linked *subdirectories* are skipped during recursive download, to avoid loops and unexpectedly crawling outside the selected tree. You can expand an individual linked remote folder and work with its files normally.

### Existing capabilities preserved

- FTP, explicit FTPS, implicit FTPS and SFTP server profiles.
- SFTP password, keyboard-interactive and private-key login, including SSH host-key fingerprint verification and an SSH authentication-method diagnostic.
- Test connection, graphical site editing, file/folder creation, renaming, deletion, remote workspace browsing, normal VS Code editing and Ctrl+S upload.
- FTPS certificate verification, connection reuse, read/write conflict checks using remote file metadata, and credential storage via SecretStorage.

## Installation

1. In **Visual Studio Code**, press `Ctrl+Shift+P` and choose **Extensions: Install from VSIX...**. Select the VSIX produced by the official build kit. Do not double-click the VSIX in Windows Explorer (which may launch the unrelated Visual Studio installer).
2. Run **Developer: Reload Window**.
3. Run **SiteDock: Show Diagnostics** and verify the running version is `0.1.9`.
4. If this is your first SiteDock installation, run **SiteDock: Install Connection Libraries**. This version retains the *existing* runtime dependency installer: the FTP and SFTP libraries are downloaded and cached once using your computer's installed Node.js/npm, not packaged in the VSIX. Users who reached working FTP/SFTP connections in previous versions can reuse cached dependencies.
5. Expand an existing server under **SiteDock → My Servers**. Linked folders should now expand like normal folders. Look below that view for **Transfers & Activity**.

## Operational and security notes

- **SFTP symlink traversal** works through the server's normal filesystem permissions and can lead to files outside the named starting-directory path when an administrator intentionally placed a link there. The UI shows linked items; recursive delete and recursive bulk transfer protect against traversing directory links.
- Live remote file writes and manual uploads are **not guaranteed atomic**; keep server-side backups and use caution editing production sites. Folder downloads protect existing local files from partial downloads; uploading to a remote destination can still leave a partial remote file if the network or server fails during the transfer.
- Currently, manual queued transfer cancellation applies only to **queued**, not already-running, jobs. Failed transfers can be retried during the same session but not across VS Code restarts.
- Remote file conflict detection compares metadata exposed by the server. Not all servers provide sufficiently precise timestamps or file sizes to guarantee detection of every conflicting edit.
- Plain FTP sends credentials and data without encryption. Prefer SFTP or FTPS.
- For dependency setup, the machine needs Node.js/npm and registry.npmjs.org access once. The extension itself does **not** download npm libraries during activation.

## Verification

Run `npm run check` in the source directory. The test suite exercises SFTP link classification, linked directory browsing, non-recursive link deletion, simulated FTP/SFTP operations, streaming progress and failed-transfer cleanup, queue order, cancellation, persistence and retry, bulk folder planning, saved-credential handling, authentication and activation.

**Testing limit:** Automated tests run against simulated transport clients and filesystem fixtures. The extension has not been end-to-end tested against your actual server or a running desktop VS Code session by this build environment. The VSIX is validated for package integrity and contribution metadata, but a successful connection must still be confirmed using the installed extension.

## Source layout

- `src/connection.js` — FTP/SFTP adapters, symlink handling and streaming transfers
- `src/filesystem.js` — VS Code remote file system provider, saves and safe deletion
- `src/tree.js` — linked-file/linked-folder-aware server explorer
- `src/activity.js` — FIFO transfer queue and recent activity view
- `src/bulk.js` — recursive folder upload/download preflight planner
- `src/extension.js` — UI commands, background work and activation
- `src/storage.js`, `src/runtime.js`, `src/editor.js`, `src/paths.js` — existing site profiles, credentials, dependencies, editor and path utilities
- `test/` — Node.js automated tests
- `Build-Official-VSIX.cmd` / `Build-Official-VSIX.ps1` — official VSIX packaging and verification (`scripts/build_vsix.py` is the earlier, superseded manual packager)

MIT licensed. Third-party FTP/SFTP transport libraries retain their own license terms.

## Symlink boundary protection (v0.1.8)

Links that resolve outside the configured **Starting directory** are visible but cannot be opened, expanded, uploaded through, or downloaded through by default. They are labeled **outside site root** and their canonical targets appear in their tooltips. To deliberately access an external link destination, enable **Allow symbolic links outside the starting directory** in the server editor. This permission applies to the complete server connection; turn it on only if you trust the server filesystem layout. FTP does not support reliable realpath boundary enforcement; this boundary protection is for SFTP.

## Opening remote files (v0.1.9)

- **Click a remote image:** SiteDock calls VS Code's built-in Image Preview (`imagePreview.previewEditor`) instead of forcing text. PNG, JPEG, GIF, WEBP, AVIF, SVG, BMP and ICO are supported. If the built-in preview fails, a read-only fallback image viewer is provided for images up to 12 MB.
- **Audio and video:** SiteDock selects the built-in VS Code media viewers for common MP3/WAV/OGG and MP4/WEBM formats.
- **Other files:** SiteDock delegates to `vscode.open`, honoring editors associated with the file in VS Code where supported. Install a VS Code extension for additional format-specific previewers such as PDF.
- **Open as Text:** Right-click a remote file and select **Open as Text** to edit SVG markup or view raw source. Save uses the existing direct-to-server filesystem provider.
- **Open in Desktop App (Local Copy):** Right-click a file, select this command, choose where to save it on your computer, and SiteDock will ask your OS to open the saved copy with its default application. **Changes made in the desktop app do not automatically sync to the server**; upload them through SiteDock when ready. Scripts and executables require explicit confirmation.

Custom VS Code editor extensions can have limitations with virtual filesystems (`sitedock://`). Open in Desktop App is the supported local-file alternative when that happens.
