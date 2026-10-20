#Requires -Version 5.1
[CmdletBinding()]
param([string]$Repository='gigabytegrove/vscode-sitedock',[switch]$Publish)
$ErrorActionPreference='Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS before building SiteDock.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd is required.' }
    & npm.cmd install --include=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    & npm.cmd run release:build
    if ($LASTEXITCODE -ne 0) { throw 'SiteDock release build or tests failed.' }
    & npm.cmd run release:verify
    if ($LASTEXITCODE -ne 0) { throw 'SiteDock release verification failed.' }
    if ($Publish) {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install and authenticate GitHub CLI (gh auth login) to publish.' }
        & npm.cmd run release:publish -- --repo $Repository
        if ($LASTEXITCODE -ne 0) { throw 'GitHub release publication failed.' }
    } else {
        Write-Host 'VERIFIED RELEASE ASSETS ready in dist/. Use -Publish and a PUBLIC GitHub repository to publish.' -ForegroundColor Green
    }
}
finally { Pop-Location }
