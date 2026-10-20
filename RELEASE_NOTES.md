# SiteDock v0.5.0 — Site organization and remote filename search

**Status: development source, not yet a published release.** SiteDock v0.4.0 remains the accepted, published baseline.

## New in v0.5.0

- Persistent site groups in Site Manager, group filtering, and smart/name/hostname sorting.
- Duplicate an existing connection without copying credentials, SSH host fingerprint trust, private-key paths, or external-link permissions.
- Bounded, cancellable, filename-only remote search, with direct file opening and folder reveal.
- Search, group and duplication controls visible on Site Manager cards, with explorer context-menu and toolbar commands.
- Explorer supports multiple selected files/folders, with **Move Selected Remote Items** and **Delete Selected Remote Items** actions in the toolbar and context menu. Operations are bounded to one site, protect site roots, refuse conflicting moves, confirm destructive work, and record outcomes in Transfers & Activity.
- SFTP live saves and queued uploads now stage under a randomized temporary name, check the uploaded size, preserve existing Unix mode, and attempt rollback if replacement fails. **This is not a guaranteed atomic overwrite** on servers without atomic rename-over-existing. FTP and FTPS retain their previous direct-write behavior.
- Expanded automated security, persistence, and command/UI coverage.

## Release acceptance still required

- Package using official `@vscode/vsce`; inspect dependency payload and package checksums.
- Verify v0.4.0 → v0.5.0 upgrade, Site Manager rendering and site group/duplicate workflows in desktop VS Code.
- Verify remote search and batch move/delete against controlled FTP/FTPS/SFTP servers, including links, permissions, collisions and large folder trees.
- Verify SFTP staged uploads against real servers, including disk-full, permission failures, disconnects, concurrent edits, backup recovery, and confirmation that no `.sitedock-*.part` files remain after successful operations.
- Preserve existing saved sites and credentials; check fallback and cancellation behavior.
- Publish VSIX and `.sha256` under `gigabytegrove/vscode-sitedock/releases` only after acceptance. Do not use GitHub Actions.

### Further v0.6.0 development: remote clipboard and downloads

- Native **Copy Remote Items** and **Paste Remote Items** commands in the file explorer; same-site only, with bounded folder traversal and no existing-file overwrite.
- **Download Selected Remote Items** for multiple ordinary remote files and folders with a single destination/policy dialog.
- Jobs run through Transfers & Activity and temporary copy files are cleaned up.
- Clipboard is session-local to SiteDock; this is not OS clipboard interoperability or cross-server copying.
- These features are source-level additions requiring desktop and real-server validation before publication.
