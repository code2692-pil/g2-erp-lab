[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$Reason,
    [string]$RepositoryRoot,
    [switch]$Wait,
    [ValidateRange(1, 3600)][int]$TimeoutSeconds = 1800
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

function Write-AtomicJson {
    param([string]$Path, [object]$Value)
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    $Value | ConvertTo-Json -Depth 6 | Set-Content -Path $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Read-JsonStable {
    param([string]$Path)
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Test-ManagedWorker {
    param([string]$PidPath, [string]$WorkerPath, [string]$Root)
    if (-not (Test-Path -LiteralPath $PidPath)) { return $false }
    $workerPid = [int]((Get-Content -LiteralPath $PidPath -Raw).Trim())
    $process = Get-Process -Id $workerPid -ErrorAction SilentlyContinue
    return $null -ne $process -and $process.ProcessName -in @("powershell", "pwsh")
}

$runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\sql-verify"
$requestPath = Join-Path $runtimeDirectory "request.json"
$resultPath = Join-Path $runtimeDirectory "result.json"
$pidPath = Join-Path $runtimeDirectory "worker.pid"
$workerPath = Join-Path $scriptDirectory "local-sql-verify-worker.ps1"

if (-not (Test-ManagedWorker $pidPath $workerPath $RepositoryRoot)) {
    throw "Local SQL verification worker is not running. Run pnpm run qa:sql:worker:install once."
}

if (Test-Path -LiteralPath $resultPath) {
    $currentResult = Read-JsonStable $resultPath
    if ($currentResult.status -eq "RUNNING") {
        throw "A local SQL verification request is already running: $($currentResult.requestId)"
    }
}

$branch = (& git -C $RepositoryRoot branch --show-current).Trim()
$head = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw "Unable to read repository branch and HEAD." }
$requestId = [Guid]::NewGuid().ToString()
$request = [ordered]@{
    requestId = $requestId
    requestedAt = (Get-Date).ToUniversalTime().ToString("o")
    requestedBy = "$env:USERNAME@$env:COMPUTERNAME"
    gitBranch = $branch
    gitHead = $head
    reason = $Reason
    requestedChecks = @("sql-tcp-tls", "pre-residue", "runner-api-smoke", "sql-integration-tests", "post-residue")
}
Write-AtomicJson $requestPath $request
Write-Host "Local SQL verification requested: $requestId"

if (-not $Wait) { exit 0 }

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
    Start-Sleep -Seconds 2
    if (Test-Path -LiteralPath $resultPath) {
        $result = Read-JsonStable $resultPath
        if ($result.requestId -eq $requestId -and $result.status -ne "RUNNING") {
            Write-Host "Local SQL verification result: $($result.status)"
            if ($result.status -eq "PASS") { exit 0 }
            exit 1
        }
    }
} while ((Get-Date) -lt $deadline)

Write-Error "Timed out waiting for local SQL verification request $requestId."
exit 1
