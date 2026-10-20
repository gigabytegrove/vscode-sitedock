#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$vsixPath = Join-Path $PSScriptRoot 'SiteDock-v0.2.0-GigabyteGrove-Official.vsix'
$logPath = Join-Path $PSScriptRoot 'SiteDock-build.log'

function Invoke-Checked {
    param([Parameter(Mandatory)][string]$Exe, [Parameter(Mandatory)][string[]]$Arguments)
    Write-Host ("`n> " + $Exe + ' ' + ($Arguments -join ' ')) -ForegroundColor Cyan
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE`: $Exe" }
}

function Test-OfficialPackage {
    param([Parameter(Mandatory)][string]$File)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($File)
    try {
        $entries = @{}
        foreach ($entry in $zip.Entries) {
            if ($entries.ContainsKey($entry.FullName)) { throw "Duplicate VSIX entry: $($entry.FullName)" }
            $entries[$entry.FullName] = $entry
        }
        foreach ($required in @(
            '[Content_Types].xml',
            'extension.vsixmanifest',
            'extension/package.json',
            'extension/src/extension.js',
            'extension/node_modules/basic-ftp/package.json',
            'extension/node_modules/ssh2-sftp-client/package.json'
        )) {
            if (-not $entries.ContainsKey($required)) {
                throw "Official package is incomplete. Missing: $required"
            }
        }

        $reader = [System.IO.StreamReader]::new($entries['extension.vsixmanifest'].Open())
        try { [xml]$xml = $reader.ReadToEnd() }
        finally { $reader.Dispose() }
        $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
        $ns.AddNamespace('v', 'http://schemas.microsoft.com/developer/vsx-schema/2011')
        $id = $xml.SelectSingleNode('//v:Metadata/v:Identity', $ns)
        if (-not $id -or $id.GetAttribute('Publisher') -cne 'GigabyteGrove' -or
            $id.GetAttribute('Id') -cne 'sitedock' -or $id.GetAttribute('Version') -ne '0.2.0') {
            throw 'Unexpected VSIX identity; upload aborted.'
        }
        $engine = $xml.SelectSingleNode('//v:Property[@Id="Microsoft.VisualStudio.Code.Engine"]', $ns)
        if (-not $engine -or $engine.GetAttribute('Value') -ne '^1.100.0') {
            throw 'Official VSIX is missing the expected VS Code engine metadata.'
        }
        $flags = $xml.SelectSingleNode('//v:Metadata/v:GalleryFlags', $ns)
        if (-not $flags -or $flags.InnerText -notmatch 'Public') {
            throw 'Official VSIX is missing the Public Marketplace flag.'
        }
        Write-Host "VSIX verified: correct publisher, version, engine, and packaged FTP/SFTP libraries." -ForegroundColor Green
    }
    finally { $zip.Dispose() }
}

$transcript = $false
try {
    Start-Transcript -Path $logPath -Force | Out-Null
    $transcript = $true
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js is not installed or is not on PATH. Install Node.js LTS, reopen the terminal, and rerun this builder.'
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'npm.cmd is unavailable. Repair the Node.js LTS installation and rerun this builder.'
    }
    Invoke-Checked -Exe 'node' -Arguments @('--version')
    Invoke-Checked -Exe 'npm.cmd' -Arguments @('--version')

    # This must install both runtime libraries and the *official* Microsoft VSCE packager.
    Invoke-Checked -Exe 'npm.cmd' -Arguments @('install','--include=dev','--omit=optional','--no-audit','--no-fund')
    Invoke-Checked -Exe 'npm.cmd' -Arguments @('run','check')

    $tool = Join-Path $PSScriptRoot 'node_modules\.bin\vsce.cmd'
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw 'The official @vscode/vsce CLI is not present after npm install.'
    }
    if (Test-Path -LiteralPath $vsixPath) { Remove-Item -LiteralPath $vsixPath -Force }
    Invoke-Checked -Exe $tool -Arguments @('package','--allow-missing-repository','--out',$vsixPath)
    if (-not (Test-Path -LiteralPath $vsixPath -PathType Leaf)) { throw 'The official packager did not create a VSIX.' }
    Test-OfficialPackage -File $vsixPath
    Write-Host "`nSUCCESS: $vsixPath" -ForegroundColor Green
    Write-Host 'Upload this VSIX to the GigabyteGrove publisher portal.'
}
catch {
    Write-Host "`nBUILD FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Build log: $logPath" -ForegroundColor Yellow
    exit 1
}
finally {
    if ($transcript) { Stop-Transcript | Out-Null }
}
