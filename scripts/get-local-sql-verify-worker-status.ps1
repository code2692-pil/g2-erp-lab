[CmdletBinding()]
param([string]$RepositoryRoot, [switch]$AsJson)

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

$runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\sql-verify"
$pidPath = Join-Path $runtimeDirectory "worker.pid"
$statePath = Join-Path $runtimeDirectory "worker-state.json"
$workerPath = Join-Path $scriptDirectory "local-sql-verify-worker.ps1"
$verificationPath = Join-Path $scriptDirectory "verify-local-sql.ps1"
$workerState = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$workerPid = if (Test-Path -LiteralPath $pidPath) { [int]((Get-Content -LiteralPath $pidPath -Raw).Trim()) } else { $null }
$process = if ($null -ne $workerPid) { Get-Process -Id $workerPid -ErrorAction SilentlyContinue } else { $null }
$currentHash = if ((Test-Path -LiteralPath $workerPath) -and (Test-Path -LiteralPath $verificationPath)) {
    $content = "$(Get-FileHash -LiteralPath $workerPath -Algorithm SHA256 | Select-Object -ExpandProperty Hash)|$(Get-FileHash -LiteralPath $verificationPath -Algorithm SHA256 | Select-Object -ExpandProperty Hash)"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    ([BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes))).Replace("-", "")
}
else { $null }
$status = [ordered]@{
    running = $null -ne $process
    pid = $workerPid
    workerVersion = if ($null -ne $workerState) { $workerState.workerVersion } else { $null }
    loadedScriptHash = if ($null -ne $workerState) { $workerState.loadedScriptHash } else { $null }
    currentScriptHash = $currentHash
    restartRequired = if ($null -ne $workerState) { [bool]$workerState.restartRequired -or $workerState.loadedScriptHash -ne $currentHash } elseif ($null -ne $process) { $true } else { $null }
    activeRequestId = if ($null -ne $workerState) { $workerState.activeRequestId } else { $null }
    lastCompletedRequestId = if ($null -ne $workerState) { $workerState.lastCompletedRequestId } else { $null }
    heartbeatAt = if ($null -ne $workerState) { $workerState.heartbeatAt } else { $null }
}

if ($AsJson) { $status | ConvertTo-Json -Depth 4 }
else {
    $status.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key): $($_.Value)" }
}
