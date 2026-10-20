# SiteDock v0.5.0 — Site organization and remote filename search

**Status: development source, not yet a published release.** SiteDock v0.4.0 remains the established working baseline.

## New in v0.5.0

- Persistent site groups, group filtering, and smart/name/hostname sorting in Site Manager.
- Safe connection duplication without copying passwords, SSH fingerprints, private key paths, or external-link permissions.
- Bounded and cancellable remote filename search, with direct file opening and folder reveal, without following symlinks.
- Search, group and duplication buttons on Site Manager cards plus server context actions.
- Regression tests for persistence, duplication, search limits, cancellation, security, and visible UI integration.

## Acceptance remaining before release

- Official `@vscode/vsce` packaging and SHA-256 verification.
- Desktop VS Code v0.4.0 → v0.5.0 upgrade and group/duplicate/search interactions.
- Controlled FTP/FTPS/SFTP search tests, including large trees, symlinks and permission failures.
- Verify original server profiles and secrets remain unchanged.
- Publish only under `gigabytegrove/vscode-sitedock/releases` after acceptance. Do not use GitHub Actions.

## Further v0.5.0 development changes (not released)

- Multi-select files/folders directly in the remote explorer, then Move Selected or Delete Selected using toolbar/context menu.
- Move operations require a single server, existing destination folder, safe paths and no name collisions; delete batches require modal confirmation.
- SFTP uses sibling temporary files and previous-version backups for staged uploads and rollback attempts. **Not POSIX atomic replacement on every server.** FTP/FTPS remain direct-write.
- Automated unit/mocked-transport tests must be followed by desktop VS Code acceptance and controlled real-server tests before publication.
