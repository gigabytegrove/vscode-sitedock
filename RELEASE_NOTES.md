# SiteDock v0.7.0 — Transfer visibility and safety (development only)

**Not released.** v0.6.0 is available as a GitHub prerelease for desktop testing; v0.5.0 is the latest stable release.

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
