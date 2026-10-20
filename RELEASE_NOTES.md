# SiteDock v0.4.0 — Site management and safety improvements

**Status:** Release candidate source; not yet published as a GitHub Release. Do not treat a manually packaged development VSIX as an official release.

## Included in the source

- Site Manager with active-site and multiple-open-site views; persistent favorites and quick switching.
- Version/update status and GitHub Releases actions available directly inside Site Manager.
- **Import Sites** and **Export Sites** in Site Manager, with one-click access to portable connection-profile backups. Exports never contain passwords, SSH passphrases, SSH fingerprint trust, or private-key paths. Imported sites require credential setup and host re-verification.
- **Compare with Local File** opens VS Code's read-only comparison view for a remote file without uploading or changing it.
- **Change SFTP File Permissions** reads the current mode, validates octal values, and asks for confirmation before applying chmod. External SFTP links remain blocked by the canonical path boundary.
- FTP/FTPS/SFTP connections, direct editing, media previews, transfer activity, and GitHub update code retained.

## Verification still required before public release

- Build the distributable VSIX through the official `@vscode/vsce` package on a machine with npm access. Package must contain production transport dependencies.
- Install the exact VSIX on a desktop VS Code test host; verify the Site Manager, import/export, diff editor, SFTP chmod, login, transfers, reload persistence, and GitHub updating.
- Publish exactly one VSIX plus matching `.sha256` in a **public** GitHub Releases repository. The source repository can stay private.
- Run the release acceptance procedures in [QUALITY_GATES.md](QUALITY_GATES.md) and [GITHUB_RELEASES.md](GITHUB_RELEASES.md).

A local automated test run and a mocked webview smoke test do not substitute for real FTP/SFTP and desktop-release acceptance tests.
