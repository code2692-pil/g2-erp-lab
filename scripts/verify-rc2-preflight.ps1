[CmdletBinding()]
param(
    [string]$RepositoryRoot,
    [switch]$AllowDirty
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

$runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\rc2-preflight"
$lockPath = Join-Path $runtimeDirectory "active.json"
$requestScript = Join-Path $scriptDirectory "request-local-sql-verify.ps1"
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$steps = New-Object System.Collections.ArrayList
$startedAt = Get-Date
$lockCreated = $false
$finalExitCode = 1
$originalLocation = Get-Location

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Detail, [TimeSpan]$Duration)

    [void]$steps.Add([pscustomobject][ordered]@{
            name = $Name
            status = $Status
            durationSeconds = [math]::Round($Duration.TotalSeconds, 1)
            detail = $Detail
        })
    Write-Host "[$Name] $Status ($([math]::Round($Duration.TotalSeconds, 1))s) - $Detail"
}

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $detail = & $Action
        $stopwatch.Stop()
        Add-Step $Name "PASS" ([string]$detail) $stopwatch.Elapsed
    }
    catch {
        $stopwatch.Stop()
        Add-Step $Name "FAIL" $_.Exception.Message $stopwatch.Elapsed
        throw
    }
}

function Invoke-External {
    param([string]$FilePath, [string[]]$Arguments)

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $FilePath @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($null -ne $output) { $output | ForEach-Object { Write-Host $_ } }
    if ($exitCode -ne 0) { throw "$FilePath exited with code $exitCode." }
    return "exit 0"
}

function Get-LockProcessId {
    if (-not (Test-Path -LiteralPath $lockPath)) { return $null }
    try {
        return [int]((Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json).processId)
    }
    catch {
        return $null
    }
}

try {
    Push-Location -LiteralPath $RepositoryRoot
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    $existingProcessId = Get-LockProcessId
    if ($null -ne $existingProcessId -and $null -ne (Get-Process -Id $existingProcessId -ErrorAction SilentlyContinue)) {
        throw "RC2 preflight is already running in process $existingProcessId."
    }
    [ordered]@{ processId = $PID; startedAt = $startedAt.ToUniversalTime().ToString("o") } |
        ConvertTo-Json | Set-Content -LiteralPath $lockPath -Encoding UTF8
    $lockCreated = $true

    Invoke-Step "Repository and environment" {
        $branch = (& git -C $RepositoryRoot branch --show-current).Trim()
        $head = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
        if ($LASTEXITCODE -ne 0) { throw "Unable to read Git branch and HEAD." }
        $status = @(& git -C $RepositoryRoot status --short)
        if (-not $AllowDirty -and $status.Count -gt 0) { throw "Working tree is not clean. Re-run only during development with -AllowDirty." }
        "branch=$branch; head=$head; clean=$($status.Count -eq 0)"
    }
    Invoke-Step "Git diff check" { Invoke-External "git" @("-C", $RepositoryRoot, "diff", "--check") }
    Invoke-Step "package.json" {
        Get-Content -LiteralPath (Join-Path $RepositoryRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
        "valid JSON"
    }
    Invoke-Step "SQL integration cleanup policy" {
        $integrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot "server\G2Erp.Api.Tests") -Filter "*SqlServer*IntegrationTests.cs" -File)
        $forbiddenPatterns = @("DeleteMatching", "Encrypt\\s*=\\s*False", "G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL")
        foreach ($pattern in $forbiddenPatterns) {
            $match = @($integrationFiles | Select-String -Pattern $pattern)
            if ($match.Count -gt 0) { throw "Forbidden SQL integration-test pattern '$pattern' found in $($match[0].Path)." }
        }
        "no prefix cleanup, plaintext connection, or unencrypted bypass"
    }
    Invoke-Step "TypeScript typecheck" { Invoke-External $nodeExecutable @(".\\node_modules\\typescript\\bin\\tsc", "--noEmit", "-p", "tsconfig.json") }
    Invoke-Step "Production build" { Invoke-External $nodeExecutable @(".\\node_modules\\vite\\bin\\vite.js", "build") }
    Invoke-Step ".NET solution build" { Invoke-External "dotnet" @("build", "server/G2Erp.sln", "--no-restore") }
    Invoke-Step "Grid preferences unit test" { Invoke-External $nodeExecutable @("--experimental-strip-types", "--test", "tests/unit/grid-view-preferences.test.ts") }
    Invoke-Step "AI file intelligence unit test" { Invoke-External $nodeExecutable @("--experimental-strip-types", "--test", "tests/unit/ai-file-intelligence.test.ts") }
    Invoke-Step "SQL connection policy test" {
        Invoke-External "dotnet" @("test", "server/G2Erp.Api.Tests/G2Erp.Api.Tests.csproj", "--no-restore", "--filter", "FullyQualifiedName~SqlServerConnectionFactoryTests")
    }
    Invoke-Step "Local SQL worker verification" {
        Invoke-External "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $requestScript, "-RepositoryRoot", $RepositoryRoot, "-Reason", "RC2 preflight", "-Wait", "-TimeoutSeconds", "1800")
    }

    $total = (Get-Date) - $startedAt
    Write-Host "RC2 PREFLIGHT: PASS ($([math]::Round($total.TotalSeconds, 1))s)"
    $finalExitCode = 0
}
catch {
    $total = (Get-Date) - $startedAt
    $failedStep = @($steps | Where-Object { $_.status -eq "FAIL" } | Select-Object -First 1)
    if ($failedStep.Count -gt 0) { Write-Host "First failed step: $($failedStep[0].name)" }
    Write-Error "RC2 PREFLIGHT: FAIL ($([math]::Round($total.TotalSeconds, 1))s) - $($_.Exception.Message)"
}
finally {
    if ($lockCreated -and (Test-Path -LiteralPath $lockPath)) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
    Pop-Location
}

exit $finalExitCode
