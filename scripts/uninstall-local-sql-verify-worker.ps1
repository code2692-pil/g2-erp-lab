[CmdletBinding()]
param(
    [string]$RepositoryRoot,
    [switch]$RemoveRuntime
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDirectory = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptDirectory) -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($scriptDirectory)) { throw "Unable to determine the current PowerShell script directory." }
if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    $RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory ".."))
}
else {
    $RepositoryRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
}
foreach ($requiredPath in @("package.json", "scripts", "server")) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot $requiredPath))) { throw "Repository root is missing required path: $requiredPath" }
}
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path

function Get-RepositoryKey {
    param([string]$Root)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ([BitConverter]::ToString($hash).Replace("-", "").Substring(0, 12))
}

$stopScript = Join-Path $scriptDirectory "stop-local-sql-verify-worker.ps1"
& $stopScript -RepositoryRoot $RepositoryRoot
$startupFile = Join-Path ([Environment]::GetFolderPath("Startup")) "G2ERP-LocalSqlVerify-$(Get-RepositoryKey $RepositoryRoot).cmd"
if (Test-Path -LiteralPath $startupFile) {
    Remove-Item -LiteralPath $startupFile -Force
    Write-Host "Startup registration removed: $startupFile"
}

if ($RemoveRuntime) {
    $runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\sql-verify"
    if (Test-Path -LiteralPath $runtimeDirectory) {
        Remove-Item -LiteralPath $runtimeDirectory -Recurse -Force
        Write-Host "Local verification logs and results were removed."
    }
}
else {
    Write-Host "Logs and results were retained. Use -RemoveRuntime to remove only this repository's local runtime files."
}
