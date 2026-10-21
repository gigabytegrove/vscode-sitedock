# SiteDock v0.7.1 — My Servers view reconstruction (development only)

**Not released.** v0.7.0 is a published GitHub prerelease for desktop testing; v0.5.0 remains the latest stable release.

## Source additions

- Running Transfers & Activity entries show measured throughput and an ETA where total bytes are known.
- VS Code status bar displays aggregate running transfer speed and keeps its existing Activity navigation.
- Retry progress resets speed samples, and stalled progress drops stale rate estimates.
- Activity errors redact connection URLs, Bearer/Basic authorization, and common credential fields, including previously persisted errors.
- Unfinished work is still marked interrupted after VS Code restart, never silently replayed. No new automatic mutation retries.

## Acceptance pending

- Exact-source full test suite on an npm-equipped checkout, official `@vscode/vsce` packaging, and desktop FTP/FTPS/SFTP testing.
- Cross-platform VS Code validation and persisted activity history compatibility checks on real user installations.

No GitHub Actions are used. New releases, when approved, go directly to `gigabytegrove/vscode-sitedock`.

## v0.6.0 field-test corrective work (v0.7.0 source)

A screen recording showed an obsolete server under My Servers although Site Manager contained only a different saved site and reported 0 open sites. The cached old server offered a PHP file, but VS Code reported the file did not exist. Site identity revisions now invalidate stale explorer nodes on membership changes; the Remove Server action can refresh an already-deleted connection without touching remote files; file opens check that the saved connection and file still exist before passing its URI to VS Code. User validation in installed VS Code is pending.

## Corrective v0.7.1 change

- Reconstruct the My Servers TreeView instance from saved-site state (dispose/recreate) when a deleted connection is removed, the connection list changes, the displayed-site set changes, or the user selects Refresh.
- Do not confuse a refresh notification with the actual disappearance of an orphaned row. The old TreeView is disposed before a replacement is registered.
- No remote files, saved credentials or legitimate site profiles are deleted by stale-entry recovery.
- Regression tests check the actual TreeView lifecycle. Real desktop VS Code validation remains pending.
