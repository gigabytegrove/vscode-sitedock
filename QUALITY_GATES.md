# SiteDock — Product Acceptance & Release Gates

This is a blocking acceptance contract for every SiteDock feature, not a list of optional polish items. **A passing unit-test suite by itself does not mean a feature is complete.**

## Definition of done

Before describing a feature as **complete**, collect evidence for all of these:

1. **Requirements and user journey.** Identify how a new user discovers, starts, uses, recovers from errors in, and exits the feature. Write down the expected result and failure behavior.
2. **Visible entry point.** The capability must be accessible through the relevant SiteDock UI (Site Manager, sidebar, file context menu, status, transfer view, or settings). Command Palette support alone is insufficient for primary workflows. Use ordinary language and show appropriate status/disabled states.
3. **Full wiring.** Confirm the visible control triggers a registered VS Code command or valid webview message, reaches the implementation, and returns meaningful success/error feedback. No buttons that only look interactive.
4. **Persistence and compatibility.** Verify sites, login secrets, per-site preferences, editor tabs, and workspace state are neither lost nor unexpectedly changed. Document migration behavior when identity/storage schemas change.
5. **Happy paths, errors, and boundaries.** Test successes, auth/permission/network failures, cancellation, empty states, malicious/untrusted inputs, and retries where applicable. Security checks may not be bypassed to make a test pass.
6. **Automated checks.** Run `npm run check`, including `test/product-contract.test.js` and feature-specific integration tests. All must pass. Document which workflows were mocked.
7. **Official package.** Use the supported `@vscode/vsce` tool for release artifacts, run `npm run release:verify`, check the exact publisher/name/version, and install that resulting VSIX—not a separately built sample.
8. **Desktop smoke test.** In a real desktop VS Code window, exercise the precise shipped controls and successful/error paths. Where a remote service is required, use a controlled test server. Verify reinstall/update and reload persistence. Provide tested OS and versions.
9. **GitHub verification.** Commit the complete working change to `main`; read back the actual commit SHA and key files from GitHub. Confirm release assets and checksums exist when claiming that a version is downloadable or auto-updatable. Do not equate a local file with a GitHub release.
10. **Honest release status.** If any applicable gate is incomplete, label the work **implemented but not release-verified**, specify exactly what's missing, and do not claim a working public release.

## Primary product acceptance scenarios

| Workflow | Desktop acceptance proof |
| --- | --- |
| First install | Install **official** VSIX; SiteDock is visible in Activity Bar; no manual secret injection or dev setup required for expected normal installation |
| Site Manager | Launch from UI; add/edit/test/remove a connection; clear empty and error states |
| Single-site focus | Open site A; only site A appears in Active Site view; switch to B without losing A's editor/session |
| Multiple sites | Open A+B; All Open Sites shows both; closing B hides it without deleting its saved profile or files |
| Credentials | Password/key/keyboard-interactive paths; host fingerprint mismatch warning; secrets persist safely after reload |
| Remote editing | Browse, open file, Ctrl+S, independently inspect remote content; test disconnect, conflict and denied writes |
| Media and desktop copy | Image/media preview, text override, and desktop local copy; confirm desktop edits are **not** silently uploaded |
| File operations | Upload/download, folder transfer, progress, skip/replace, error, queued cancellation, delete and rename |
| Link protection | Normal, broken, cyclic, and outside-root SFTP symbolic links; forbidden traversal stays blocked |
| Batch file management | Multi-select files/folders in the native explorer; batch move/delete confirmations, collision preflight, parent/child deduplication, clear errors and activity records |
| Staged SFTP saves | Test existing/new uploads, failure during staging, rename and rollback, chmod preservation, concurrent modification, cleanup of partial and backup files |
| Updates in manager | Version/channel/status plainly visible; Check for Updates, Install, Release Notes, Settings work from manager |
| Update failures | Private/no-public-releases message, digest mismatch, invalid VSIX identity, failed download, no unsafe install |
| Update lifecycle | Release vN+1 publicly, install vN, check via UI, install verified update, reload, confirm vN+1 and saved sites |

| Drag-and-drop upload | Drop files and directories from both VS Code Explorer and OS file manager onto a site and ordinary folder; verify Skip/Replace; reject symlink and file-target drops |
| Remote clipboard | Copy files/folders within one site, paste into ordinary folder, verify bytes and layout; reject cross-site, collisions and links |
| Multi-item downloads | Ctrl/Shift select mixed files/folders, download into one local folder with policy prompt; verify actual bytes, unchanged existing files, and failures |
| Download retry | Induce controlled disconnect after partial local download; confirm temp cleanup, bounded reconnect and accurate final activity status; no retry for authentication or permission errors |

## Required command-line gates

```bash
npm run check
npm run release:build
npm run release:verify
```

The first gate requires no internet when Node.js is available. The packaging gates require the official packaging dependency; failure to run them is a **blocker to claiming a release**, not grounds for substituting a manually assembled VSIX.

> [!IMPORTANT]
> The public source repository `gigabytegrove/vscode-sitedock` is also the **only official GitHub Releases feed**. A local build without published release assets cannot validate the end-to-end updater. No separate releases repository is needed.

## Evidence format for future completion reports

Always report: **commit SHA**, **files/areas changed**, **test command + pass/fail count**, **official VSIX build verification**, **desktop VS Code scenarios actually exercised**, **live FTP/SFTP scenarios actually exercised**, **release URL or blocker**, and **remaining limitations**. Explicitly distinguish *not run*, *mocked*, *passed locally*, and *confirmed on GitHub*.

## Published baseline and v0.6.0 acceptance

v0.4.0 was built using `@vscode/vsce`, passed 153 automated tests, and published directly as a GitHub Release with verified SHA-256. The user confirmed in-app upgrade, FTP/FTPS/SFTP connectivity, live editing, conflict handling and downloads. These are user-tested on their VS Code environment; cross-platform acceptance remains outstanding.

v0.5.0 is now publicly published under the same GitHub repository. Its enhanced site organization is release-available but has not been independently accepted across every desktop and live server environment.

v0.6.0 is a **published GitHub prerelease for user testing**. Its native remote clipboard, batch downloads, drag-and-drop uploads and bounded download retries require desktop and live-server acceptance. Do not treat a passing mocked test as proof that an OS file-manager drop or a transient network retry works in production.
### v0.7.0 transfer-visibility acceptance (outstanding)

- Install an officially packaged build and validate live transfer speed, ETA and status bar updates with large files on FTP, FTPS and SFTP.
- Test restart during a transfer, retry after a transient network failure, stalled progress, completion, and sanitized error text.
- Verify no silent replay of uploads, deletes or previously interrupted work; confirm history and saved connections persist after reload.

### Stale explorer / remote-opening regression gate

- Delete a saved server while its My Servers tree is expanded and another saved server exists. The deleted server must disappear from every filtered mode; the other server's credentials and data must remain unchanged.
- If VS Code retains a cached tree node, Remove Server refreshes its tree identity without deleting any remote file or unrelated saved connection. Clicking a stale remote file must show a useful connection error and must not offer to create a remote replacement.
- Open a regular PHP/text file from the newly saved connection, verify bytes and normal live editing, and verify wrong Starting Directory produces a clear error without changing server contents.
