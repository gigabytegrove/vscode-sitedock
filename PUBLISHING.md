# SiteDock v0.2.0 — Official Marketplace packaging

**Publisher:** `GigabyteGrove`

**Extension:** `GigabyteGrove.sitedock`

**Version:** `0.2.0`

## Build an official VSIX on Windows

1. Extract the official packaging kit.
2. Install Node.js LTS (which includes npm), if it is not already installed.
3. Run `Build-Official-VSIX.cmd` from this directory.
4. Wait for `SUCCESS` and locate `SiteDock-v0.2.0-GigabyteGrove-Official.vsix`.
5. Upload the output file at https://marketplace.visualstudio.com/manage/publishers/.

The builder executes `npm install`, runs the entire automated test suite,
invokes Microsoft's real `@vscode/vsce` packager, and inspects the resulting
archive for the expected publisher ID, engine metadata and transport packages.
It writes `SiteDock-build.log` for diagnostics. **Do not upload a VSIX when
this builder reports failure.**

For manual builds after `npm install`, use:

```powershell
npm run check
.\node_modules\.bin\vsce.cmd package --allow-missing-repository --out SiteDock-v0.2.0-GigabyteGrove-Official.vsix
```

## Known limitations

The public build includes the transport dependencies in the package, but the v0.2.0 runtime loads those packaged libraries first, without npm or network access at first connection. Older/incomplete VSIX builds can still use the legacy one-time npm fallback. This packaging kit isolates Microsoft upload
errors from the earlier manually built VSIX files; it is not a claim that the
runtime has been redesigned or tested end-to-end.

## If Microsoft still reports TF400898

The error does not identify whether the issue is the package, a Microsoft
backend error, or the publisher's account status. Keep the Activity ID and
email VSMarketplace@microsoft.com, mentioning the publisher ID,
`GigabyteGrove.sitedock`, the official `vsce` packaging attempt and the
prior preferred-email verification error. Do not send secrets, passwords or
publishing tokens.

The local build environment for this project has no access to npm, so the
Windows `vsce` build itself must run where npm has connectivity. A successful
local test suite is not proof of acceptance by Microsoft's Marketplace.
