#Requires -Version 5.1
# Compatibility launcher retained for users with earlier instructions.
# SiteDock releases live in the EXISTING PUBLIC source repository; no repository is created here.
[CmdletBinding()]
param(
    [string]$Repository='gigabytegrove/vscode-sitedock',
    [switch]$Create,
    [switch]$BuildAndPublish
)
$ErrorActionPreference='Stop'
if ($Create) {
    throw 'No new repository is required. Remove -Create and use the existing public gigabytegrove/vscode-sitedock repository.'
}
if ($Repository -ne 'gigabytegrove/vscode-sitedock') {
    throw 'SiteDock releases must be published in gigabytegrove/vscode-sitedock; another destination is not configured.'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'Install GitHub CLI and authenticate using gh auth login before publishing.'
}
$info = (& gh repo view $Repository --json visibility,isPrivate,defaultBranchRef | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or -not $info) { throw 'Cannot inspect the SiteDock source repository. Check GitHub CLI login and permissions.' }
if ($info.isPrivate -or $info.visibility -ne 'PUBLIC') { throw 'The source repository must be public for anonymous update downloads.' }
if (-not $info.defaultBranchRef.name) { throw 'The source repository has no initialized default branch.' }
Write-Host "SiteDock release destination: https://github.com/$Repository/releases" -ForegroundColor Green
if ($BuildAndPublish) {
    $script = Join-Path $PSScriptRoot 'Build-GitHub-Release.ps1'
    & $script -Repository $Repository -Publish
    if (-not $?) { throw 'SiteDock build or publication failed.' }
}
