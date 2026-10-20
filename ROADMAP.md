# SiteDock Feature Roadmap

SiteDock is intended to be a practical, approachable replacement for complex, configuration-driven remote editors. This document distinguishes **implemented and test-covered behavior** from work that is planned. Nothing here implies a feature has been tested against all production servers.

## Current: v0.2.0

- Two browsing modes: Site Manager and All Sites.
- Site Manager with one active site or all currently open sites in the explorer.
- Multiple simultaneously open sites; quick switching, favorites, recently selected sites, and open in separate VS Code windows.
- Persistent workspace view state without changing saved connection IDs or credentials.
- FTP, FTPS, implicit FTPS, and SFTP; password, keyboard-interactive, and SSH key options.
- Native remote file editing, media previews, file operations, safe symlink browsing, and root-boundary policy on SFTP.
- Queued file/folder transfers, progress and activity history, cancellation while queued, and same-session retry.
- Bundled transport libraries preferred at runtime if present; fallback for incomplete/legacy packages.
- Node.js automated tests, source packaging scripts, and VSIX packaging guidance.

## Highest-priority next work

1. **Release hardening.** Build using the official vsce packager with bundled dependencies, smoke-test install on clean Windows/macOS/Linux desktops, verify SFTP/FTPS against real servers, and validate Marketplace acceptance.
2. **Reliable deployment.** Atomic remote uploads where supported (temporary file + verified rename), recovery after interrupted writes, retry and backoff policy, and remote change/concurrency detection better than metadata-only checks.
3. **Synchronization.** Local/remote directory mapping, upload-on-save options, dry-run reconciliation, one-way/two-way sync policies, deletion safeguards, per-site excludes, and visible confirmation before destructive actions. Do not claim this exists yet.
4. **Compare and conflict resolution.** Explicit local-vs-remote diff, staging/dry-run changes, conflict previews, overwrite decisions, and a safe rollback workflow.
5. **File manager polish.** Drag-and-drop uploads, inline rename, multi-selection, batch delete with confirmation, cut/copy/paste across folders, server-side move/copy when supported, permission/CHMOD editing, and timestamps.
6. **Transfer queue maturity.** Durable retry metadata, controlled parallelism, priority/reordering, per-server concurrency limits, pause/resume where supported, elapsed time, speed/ETA, and recovery after VS Code restarts.
7. **Site organization.** Groups/tags, sorting, pinning, duplicate connection, safe import/export with secrets excluded, per-site settings/policies, and optional VS Code profiles/workspace integration.
8. **Remote monitoring.** Configurable refresh/poll intervals, change notifications, selective refresh, and avoidance of excessive remote LIST/STAT calls.

## Longer-term ideas

- Site snapshots and deployment profiles for production/staging.
- Customizable keyboard shortcuts, file filters, language associations, search and remote directory find.
- Audit log export with secret/path redaction and diagnostics safe for issue reports.
- Authentication improvements: SSH agent use, encrypted keys, proxy/jump hosts, connection keepalives and SSH config interoperability.
- Internationalization, accessibility review, keyboard navigation, more robust screen reader experience, and a comprehensive usability pass.
- Optional editor integration for external desktop app changes with **explicit** upload/confirmation (not silent background sync).

## Non-goals and safety constraints

- Never copy secrets into plaintext exports or Git commits.
- Closing a Site Manager workspace must never delete server files or saved credentials.
- Never follow dangerous remote directory links by default or allow recursive destructive operations to escape site-root safeguards.
- Never silently overwrite remote edits detected to be newer than an open local document.
- Preserve established SiteDock commands, saved site IDs, and existing profiles unless a migration is explicitly introduced.

## Testing gates

Before labeling an item production-ready, add automated tests **and** exercise the complete behavior against a real server. Unit tests and VSIX ZIP validation alone are not proof of working FTP/SFTP connectivity.