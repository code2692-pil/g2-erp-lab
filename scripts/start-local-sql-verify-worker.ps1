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

function Test-ManagedWorker {
    param([string]$PidPath, [string]$WorkerPath, [string]$Root)
    if (-not (Test-Path -LiteralPath $PidPath)) { return $false }
    $workerPid = [int]((Get-Content -LiteralPath $PidPath -Raw).Trim())
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $workerPid" -ErrorAction SilentlyContinue
    return $null -ne $process -and $process.CommandLine -like "*$WorkerPath*" -and $process.CommandLine -like "*$Root*"
}

$workerPath = Join-Path $scriptDirectory "local-sql-verify-worker.ps1"
$runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\sql-verify"
$pidPath = Join-Path $runtimeDirectory "worker.pid"
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null

if (Test-ManagedWorker $pidPath $workerPath $RepositoryRoot) {
    Write-Host "Local SQL verification worker is already running."
    return
}

if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath -Force }
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$workerPath`" -RepositoryRoot `"$RepositoryRoot`""
Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $RepositoryRoot -WindowStyle Hidden | Out-Null
for ($attempt = 1; $attempt -le 10; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-ManagedWorker $pidPath $workerPath $RepositoryRoot) {
        Write-Host "Local SQL verification worker started."
        return
    }
}
throw "Local SQL verification worker did not create a valid PID record."
