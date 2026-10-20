# SiteDock development roadmap

## Released baseline: v0.4.0

The v0.4.0 VSIX was officially packaged, SHA-256 checked and published directly on GitHub. The user verified the in-app upgrade from v0.3.1, FTP/FTPS/SFTP connectivity, live editing, conflict handling and downloads in desktop VS Code.

## v0.5.0 published baseline (source tag 2c15268)

- Persistent site groups, group filtering and smart/name/hostname sorting.
- Credential-safe duplication requiring new authentication setup.
- Bounded and cancellable remote filename search with symlink traversal disabled.
- Source regression tests. Desktop and live-server testing and an official release are still pending.

## Next large feature milestones

1. Drag-and-drop uploads, multi-selection, and bulk remote copy/move/rename/delete.
2. Atomic uploads with partial-write and interruption recovery.
3. Durable transfer retries, restart recovery, priority, parallelism and speed/ETA.
4. Synchronization: local/remote mappings, dry-run, exclusions, one-way/two-way policies and deletion safeguards.
5. Deployment profiles, staging review, rollback and remote change monitoring.
6. Advanced SSH options, keyboard accessibility, screen-reader validation, and VSIX packaging improvements.

No feature is called complete until its UI is visible, behavior is covered, and the release is tested on real VS Code and remote servers.

## v0.6.0 work (source, not yet released)

- Native remote tree multi-selection for bounded move and delete with collision/root protections, confirmation and activity reporting.
- SFTP staged uploads with size checks, permission preservation and rollback attempts. This is **not guaranteed POSIX atomic overwrite** on all SFTP servers; FTP/FTPS remain direct-write.
- Next: drag-and-drop, safe remote copy/paste, transfer resumability and end-to-end desktop/real-server QA.
