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
| Updates in manager | Version/channel/status plainly visible; Check for Updates, Install, Release Notes, Settings work from manager |
| Update failures | Private/no-public-releases message, digest mismatch, invalid VSIX identity, failed download, no unsafe install |
| Update lifecycle | Release vN+1 publicly, install vN, check via UI, install verified update, reload, confirm vN+1 and saved sites |

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

## Published baselines and v0.6.0 acceptance

SiteDock v0.4.0 passed 153 automated tests, was packaged using official `@vscode/vsce`, and was publicly released with a verified SHA-256. The user independently confirmed in-app upgrade from v0.3.1, FTP/FTPS/SFTP connectivity, live editing, conflict handling and downloads. This is user confirmation on their VS Code installation; full platform coverage remains outstanding.

v0.5.0 was published with site grouping, sorting, duplication and filename search. v0.6.0 adds batch move/delete and staged SFTP uploads, which still require desktop and real-server acceptance.

## Additional v0.6 acceptance gates (pending)

- [ ] In desktop VS Code, Ctrl/Shift select 2+ remote files; run toolbar and context-menu batch Move/Delete; verify activity entries, collision refusal, symlink safety, and modal cancellation.
- [ ] Against controlled SFTP servers, verify staged live save and queued uploads, permission preservation, partial upload cleanup, concurrent edit detection, failed rename rollback, and orphan-backup recovery.
- [ ] On FTP/FTPS, confirm existing direct-write transfers still behave correctly; no unsupported atomicity claims.
