# SiteDock v0.6.0 — Remote file-management improvements (development)

**Status: unreleased source.** v0.5.0 is the latest published GitHub Release; v0.4.0 was verified by the user for connectivity, editing, conflicts and downloads.

## Changes in v0.6.0 development

- Native multi-selection: batch move/delete with confirmation, collision and root guards.
- SFTP staged uploads with size checks, permissions preservation, change detection and rollback attempts; full atomic replacement is not guaranteed across all servers.
- Remote Copy/Paste of ordinary files/folders within the same site, bounded to 3,000 entries and 32 levels with symlink and collision checks.
- Download Selected for multiple files/folders with one destination and Skip/Replace dialog.
- Drag local files/folders into SiteDock's remote explorer. Dropped items are preflighted, confirmed and queued, with symlink exclusions and limits on in-memory files.
- Bounded retries for transient **downloads only**, with no automatic replay of uploads/deletes/permission failures or restart-interrupted work.

## Required release acceptance

- Produce and verify the official `@vscode/vsce` package from the exact approved GitHub commit.
- Use desktop VS Code to test all new controls including Windows Explorer drag/drop, file selection, activity and cancellation.
- Test FTP/FTPS/SFTP copy/download, staged SFTP uploads, failures and collision behavior on controlled remote servers.
- Confirm saved connections, credentials, open sites and settings survive upgrade.
- Publish VSIX and matching SHA-256 to the **existing** `gigabytegrove/vscode-sitedock` repository only, using local direct publication, without GitHub Actions.

Passing mocked/unit tests is not the same as these end-to-end checks.
