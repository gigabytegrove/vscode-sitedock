# SiteDock v0.3.0 — GitHub Releases updates

- GitHub-only update checks with stable/beta selection and configurable public release repository.
- Optional automatic installation and scheduled checks while VS Code is open.
- Check for Updates, Update Settings and View GitHub Releases commands.
- SHA-256 verification of downloaded packages and publisher/extension/version validation before installation.
- VS Code-native installation and optional reload. Files and credentials are not migrated or deleted.
- Local official VSIX + SHA-256 build and publication scripts, without a GitHub Actions dependency.

**Required for updates:** a publicly accessible GitHub Release containing exactly one `sitedock-*.vsix`, together with a corresponding `.sha256` checksum (or GitHub-provided SHA-256 digest). Private repositories cannot serve unauthenticated update clients.

**Installation:** Start with an officially packaged VSIX in VS Code via **Extensions: Install from VSIX...**, then use **SiteDock: Check for Updates** for later releases.
