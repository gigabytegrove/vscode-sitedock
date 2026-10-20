# Changelog

All notable SiteDock releases and migration concerns are recorded here. Features are marked as completed only when implemented in source. End-to-end production compatibility still requires independent verification.

## 0.2.0 — Site Manager

- Added a searchable visual Site Manager with saved and opened site cards.
- Added **Site Manager: Active Site**, **Site Manager: All Open Sites**, and preserved **All Sites** classic browsing.
- Added simultaneous open sites, fast active-site switching, favorites, batch open, close all, close others, and independent VS Code windows.
- Persists open-site selection, active site, favorites and explorer mode between restarts.
- Closing a managed site hides it from the explorer without deleting a saved connection, credentials, or server files.
- Existing live editing, file previews, transfer activity, FTP/FTPS/SFTP operations, site-root protections and connection editor remain in place.
- Prefers bundled FTP/SFTP library installations in a properly packaged VSIX, keeping the legacy npm installation fallback for older/incomplete packages.
- Extended simulated automated tests for workspace state, concurrent updates, persistence, filtering and bundled-runtime resolution.

**Migration:** No saved connection migration required from v0.1.9 when the publisher and extension ID remain `GigabyteGrove.sitedock`. Users coming from `sitedock-local.sitedock` still have a separate VS Code extension identity and should re-enter their credentials.

## 0.1.9 — Previews and associations

- Native file association routing for images, common audio/video and compatible VS Code editors.
- Explicit Open as Text and Open in Desktop App (local copy) options.

## 0.1.8 — Boundary protection

- SFTP symlinks resolving outside the selected site root blocked by default, with explicit opt-in and target visibility.

## 0.1.7 — Transfers and symlinks

- Linked-folder traversal and safe unlink behavior, transfer queue, streaming progress, bulk folder upload/download, and activity history.

## 0.1.6 and earlier

- Authentication diagnostics, password/keyboard-interactive/SSH key selection, runtime library preparation, and foundational multi-site remote editing.
