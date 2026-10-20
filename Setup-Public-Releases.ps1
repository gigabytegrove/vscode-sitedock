#Requires -Version 5.1
[CmdletBinding()]
param([string]$Repository='gigabytegrove/sitedock-releases', [switch]$Create, [switch]$BuildAndPublish)
$ErrorActionPreference='Stop'
if ($Repository -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*/[-A-Za-z0-9_.]+$') { throw 'Repository must be owner/name.' }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI and run gh auth login before proceeding.' }

$existing = $null
try {
    $existing = (& gh repo view $Repository --json visibility,isPrivate,defaultBranchRef 2>$null | ConvertFrom-Json)
} catch { $existing = $null }
if ($LASTEXITCODE -ne 0 -or -not $existing) {
    if (-not $Create) { throw "Repository $Repository does not exist or is inaccessible. Re-run with -Create to intentionally create it PUBLIC." }
    Write-Host "Creating PUBLIC GitHub repository: $Repository" -ForegroundColor Yellow
    & gh repo create $Repository --public --add-readme --description 'SiteDock VS Code extension official GitHub Releases (VSIX and SHA-256 files)'
    if ($LASTEXITCODE -ne 0) { throw 'Could not create public repository. Check organization creation permissions.' }
    $existing = (& gh repo view $Repository --json visibility,isPrivate,defaultBranchRef | ConvertFrom-Json)
}
if ($existing.isPrivate -or $existing.visibility -ne 'PUBLIC') {
    throw "Repository $Repository is private. No visibility changes were made. Select an existing PUBLIC release repository."
}
if (-not $existing.defaultBranchRef.name) { throw 'Release repository is missing a default branch.' }
Write-Host "PUBLIC RELEASE FEED READY: https://github.com/$Repository/releases" -ForegroundColor Green
Write-Host "Set VS Code: sitedock.updates.repository = `"$Repository`"" -ForegroundColor Cyan
if ($BuildAndPublish) {
    $script = Join-Path $PSScriptRoot 'Build-GitHub-Release.ps1'
    & $script -Repository $Repository -Publish
    if ($LASTEXITCODE -ne 0) { throw 'GitHub release build or publication failed.' }
}
