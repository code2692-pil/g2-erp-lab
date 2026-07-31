[CmdletBinding()]
param([string]$RepositoryRoot)

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

$workerPath = Join-Path $scriptDirectory "local-sql-verify-worker.ps1"
$pidPath = Join-Path $RepositoryRoot ".local-runtime\sql-verify\worker.pid"
$verificationPidPath = Join-Path $RepositoryRoot ".local-runtime\sql-verify\verification.pid"
if (-not (Test-Path -LiteralPath $pidPath)) {
    Write-Host "Local SQL verification worker is not running."
    return
}

$workerPid = [int]((Get-Content -LiteralPath $pidPath -Raw).Trim())
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $workerPid" -ErrorAction SilentlyContinue
if ($null -eq $process -or $process.CommandLine -notlike "*$workerPath*" -or $process.CommandLine -notlike "*$RepositoryRoot*") {
    throw "Refusing to stop PID $workerPid because it is not this repository's worker."
}

if (Test-Path -LiteralPath $verificationPidPath) {
    throw "A local SQL verification is still running. Wait for result.json before stopping the worker."
}

Stop-Process -Id $workerPid -ErrorAction Stop
Start-Sleep -Milliseconds 300
if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath -Force }
Write-Host "Local SQL verification worker stopped."
