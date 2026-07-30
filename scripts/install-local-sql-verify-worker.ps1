[CmdletBinding()]
param(
    [string]$RepositoryRoot,
    [switch]$NoStart,
    [switch]$ValidateOnly
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

$workerPath = Join-Path $scriptDirectory "local-sql-verify-worker.ps1"
$startScript = Join-Path $scriptDirectory "start-local-sql-verify-worker.ps1"
if (-not (Test-Path -LiteralPath $workerPath)) { throw "Worker script was not found: $workerPath" }

$startupDirectory = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDirectory "G2ERP-LocalSqlVerify-$(Get-RepositoryKey $RepositoryRoot).cmd"
$content = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -RepositoryRoot `"$RepositoryRoot`"`r`n"
$registrationExists = Test-Path -LiteralPath $startupFile
if ($ValidateOnly) {
    Write-Host "RepositoryRoot: $RepositoryRoot"
    Write-Host "WorkerScript: $workerPath"
    Write-Host "StartupFile: $startupFile"
    Write-Host "StartupRegistrationExists: $registrationExists"
    Write-Host "StartupCommand: $($content.Trim())"
    Write-Host "LOCAL SQL WORKER INSTALL VALIDATION: PASS"
    return
}
if (-not (Test-Path -LiteralPath $startupFile) -or (Get-Content -LiteralPath $startupFile -Raw) -ne $content) {
    Set-Content -LiteralPath $startupFile -Value $content -Encoding ASCII
    Write-Host "Startup registration created: $startupFile"
}
else {
    Write-Host "Startup registration already exists: $startupFile"
}

if (-not $NoStart) {
    & $startScript -RepositoryRoot $RepositoryRoot
}
else {
    Write-Host "Worker was not started because -NoStart was specified."
}
