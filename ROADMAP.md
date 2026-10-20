# SiteDock development roadmap

## Released and user verified: v0.4.0

The GitHub-only v0.4.0 VSIX was officially packaged and published with SHA-256 verification. In-app upgrade from v0.3.1, FTP/FTPS/SFTP connectivity, live editing, conflict handling, and downloads were successfully tested in a desktop VS Code installation. Cross-platform coverage remains incomplete.

## v0.5.0 source in development — NOT RELEASED

- Persistent site groups, filter by group, smart/name/hostname sorting.
- Credential-safe duplication that requires configuring new authentication.
- Bounded, cancellable remote filename search, with no symlink traversal or file-content reads.
- Native VS Code explorer multi-selection: bounded batch deletion and remote moves, with confirmation, collision checks, and a visible transfer log.
- SFTP staged uploads for live saves and queued file/folder uploads; size verification, mode preservation, change checks and rollback attempts. This is not guaranteed atomic replacement without a server-specific rename extension. FTP/FTPS retain their existing direct-write behavior.
- Source-level automated tests; official VSIX packaging, desktop and live-server tests remain necessary before release.

## Subsequent feature development

1. Drag-and-drop upload, safe remote copy/paste, and multi-file downloads/rename.
2. Stronger remote concurrency detection and native server-side atomic rename when supported; investigate interrupted staging cleanup.
3. Durable transfer retries/recovery, parallelism controls, pause/resume where supported, speed and ETA.
4. Synchronization: local/remote folder maps, dry-run, excludes, one-way/two-way policy and deletion safeguards.
5. Site-level deployment profiles, staging previews and rollback.
6. Remote refresh/monitoring, connection diagnostics, SSH agent/jump host support.
7. Accessible keyboard navigation, screen reader verification, cross-platform QA, smaller VSIX payload.

No feature is called complete without visible UI access, automated behavior tests, release packaging and real VS Code/remote-server acceptance.

### v0.6.0 next batch (source-level, not yet released)

- Same-site Copy/Paste on ordinary remote files and folders, with explicit destination confirmation, directory traversal bounds, and collision refusal.
- Download Selected on multiple files/folders using one local destination and policy prompt; interrupted downloads remain visible as failures.
- Still outstanding: actual Windows desktop drag-and-drop, transfer pause/resume, restart-safe retry recovery, and verification on real servers.
