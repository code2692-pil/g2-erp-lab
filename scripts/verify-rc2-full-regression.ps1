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
foreach ($requiredPath in @("package.json", "scripts", "server", "tests")) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot $requiredPath))) { throw "Repository root is missing required path: $requiredPath" }
}
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path

$runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\rc2-full-regression"
$logsDirectory = Join-Path $runtimeDirectory "logs"
$lockPath = Join-Path $runtimeDirectory "active.json"
$summaryPath = Join-Path $runtimeDirectory "latest-summary.json"
$requestScript = Join-Path $scriptDirectory "request-local-sql-verify.ps1"
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$startedAt = Get-Date
$steps = New-Object System.Collections.ArrayList
$lockCreated = $false
$finalExitCode = 1
$originalLocation = Get-Location

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Detail, [TimeSpan]$Duration, [string]$LogPath)

    [void]$steps.Add([pscustomobject][ordered]@{
            name = $Name
            status = $Status
            durationSeconds = [math]::Round($Duration.TotalSeconds, 1)
            detail = $Detail
            logPath = $LogPath
        })
    Write-Host "[$Name] $Status ($([math]::Round($Duration.TotalSeconds, 1))s) - $Detail"
}

function Get-SafeFileName {
    param([string]$Name, [int]$Index)
    return ("{0:D2}-{1}" -f $Index, ($Name -replace '[^A-Za-z0-9._-]', '-'))
}

function Invoke-External {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [hashtable]$Environment = @{}
    )

    $stepIndex = $steps.Count + 1
    $logPath = Join-Path $logsDirectory "$(Get-SafeFileName $Name $stepIndex).log"
    $previousValues = @{}
    foreach ($key in $Environment.Keys) {
        $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$Environment[$key], "Process")
    }

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $output = & $FilePath @Arguments 2>&1
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        @($output | ForEach-Object { "$_" }) | Set-Content -LiteralPath $logPath -Encoding UTF8
        if ($null -ne $output) { $output | ForEach-Object { Write-Host $_ } }
        if ($exitCode -ne 0) { throw "$FilePath exited with code $exitCode. See $logPath" }
        $stopwatch.Stop()
        Add-Step $Name "PASS" "exit 0; log=$logPath" $stopwatch.Elapsed $logPath
    }
    catch {
        $stopwatch.Stop()
        if (-not (Test-Path -LiteralPath $logPath)) { $_.Exception.ToString() | Set-Content -LiteralPath $logPath -Encoding UTF8 }
        Add-Step $Name "FAIL" $_.Exception.Message $stopwatch.Elapsed $logPath
        throw
    }
    finally {
        foreach ($key in $Environment.Keys) { [Environment]::SetEnvironmentVariable($key, $previousValues[$key], "Process") }
    }
}

function Invoke-Internal {
    param([string]$Name, [scriptblock]$Action)
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $detail = & $Action
        $stopwatch.Stop()
        Add-Step $Name "PASS" ([string]$detail) $stopwatch.Elapsed $null
    }
    catch {
        $stopwatch.Stop()
        Add-Step $Name "FAIL" $_.Exception.Message $stopwatch.Elapsed $null
        throw
    }
}

function Test-LocalPortFree {
    param([int]$Port)
    return $null -eq (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Write-Summary {
    param([string]$Status)
    $summary = [ordered]@{
        branch = (& git -C $RepositoryRoot branch --show-current).Trim()
        head = (& git -C $RepositoryRoot rev-parse HEAD).Trim()
        startedAt = $startedAt.ToUniversalTime().ToString("o")
        finishedAt = (Get-Date).ToUniversalTime().ToString("o")
        status = $Status
        exitCode = if ($Status -eq "PASS") { 0 } else { 1 }
        steps = @($steps)
        portsFree = [ordered]@{ port5173 = Test-LocalPortFree 5173; port5080 = Test-LocalPortFree 5080 }
    }
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
}

try {
    Push-Location -LiteralPath $RepositoryRoot
    New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
    if (Test-Path -LiteralPath $lockPath) {
        try { $existingProcessId = [int]((Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json).processId) } catch { $existingProcessId = $null }
        if ($null -ne $existingProcessId -and $null -ne (Get-Process -Id $existingProcessId -ErrorAction SilentlyContinue)) { throw "RC2 full regression is already running in process $existingProcessId." }
    }
    [ordered]@{ processId = $PID; startedAt = $startedAt.ToUniversalTime().ToString("o") } | ConvertTo-Json | Set-Content -LiteralPath $lockPath -Encoding UTF8
    $lockCreated = $true

    Invoke-Internal "Repository and ports" {
        $status = @(& git -C $RepositoryRoot status --short)
        if (-not $AllowDirty -and $status.Count -gt 0) { throw "Working tree is not clean." }
        if (-not (Test-LocalPortFree 5173) -or -not (Test-LocalPortFree 5080)) { throw "Ports 5173 and 5080 must be free before regression." }
        "clean=$($status.Count -eq 0); ports=free"
    }
    Invoke-External "Git diff check" "git" @("-C", $RepositoryRoot, "diff", "--check")
    Invoke-Internal "Package metadata" { Get-Content -LiteralPath (Join-Path $RepositoryRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null; "valid JSON" }
    Invoke-Internal "PowerShell parser" {
        $scripts = @("verify-local-sql.ps1", "local-sql-verify-worker.ps1", "request-local-sql-verify.ps1", "install-local-sql-verify-worker.ps1", "start-local-sql-verify-worker.ps1", "stop-local-sql-verify-worker.ps1", "uninstall-local-sql-verify-worker.ps1", "get-local-sql-verify-worker-status.ps1", "verify-rc2-preflight.ps1", "verify-rc2-full-regression.ps1")
        foreach ($script in $scripts) {
            $tokens = $null; $errors = $null
            [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $scriptDirectory $script), [ref]$tokens, [ref]$errors) | Out-Null
            if ($errors.Count -gt 0) { throw "${script}: $($errors[0].Message)" }
        }
        "$($scripts.Count) scripts parsed"
    }
    Invoke-External "SQL worker install validation" "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $scriptDirectory "install-local-sql-verify-worker.ps1"), "-RepositoryRoot", $RepositoryRoot, "-ValidateOnly")
    Invoke-External "Local SQL script validation" "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $scriptDirectory "verify-local-sql.ps1"), "-RepositoryRoot", $RepositoryRoot, "-ValidateOnly")
    Invoke-Internal "SQL safety policy" {
        $files = @("verify-local-sql.ps1", "local-sql-verify-worker.ps1", "request-local-sql-verify.ps1", "install-local-sql-verify-worker.ps1", "start-local-sql-verify-worker.ps1", "stop-local-sql-verify-worker.ps1", "uninstall-local-sql-verify-worker.ps1") | ForEach-Object { Join-Path $scriptDirectory $_ }
        foreach ($pattern in @("Encrypt\\s*=\\s*False", "G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL", "\\b(INSERT|UPDATE|DELETE|ALTER|DROP)\\s+")) {
            $match = @($files | Select-String -Pattern $pattern)
            if ($match.Count -gt 0) { throw "Forbidden verification-script pattern '$pattern' found in $($match[0].Path)." }
        }
        "no plaintext bypass or SQL write command"
    }
    Invoke-External "TypeScript typecheck" $nodeExecutable @(".\\node_modules\\typescript\\bin\\tsc", "--noEmit", "-p", "tsconfig.json")
    Invoke-External "Production build" $nodeExecutable @(".\\node_modules\\vite\\bin\\vite.js", "build")
    Invoke-External "Bundle budget" $nodeExecutable @("scripts/performance/check-bundle-budget.mjs")
    Invoke-External "Bundle budget unit test" $nodeExecutable @("--test", "scripts/performance/tests/check-bundle-budget.test.mjs")
    Invoke-External "Grid preferences unit test" $nodeExecutable @("--experimental-strip-types", "--test", "tests/unit/grid-view-preferences.test.ts")
    Invoke-External "Client identifier unit test" $nodeExecutable @("--experimental-strip-types", "--test", "tests/unit/client-id.test.ts")
    Invoke-External "AI file intelligence unit test" $nodeExecutable @("--experimental-strip-types", "--test", "tests/unit/ai-file-intelligence.test.ts")
    Invoke-External "Maintenance unit tests" $nodeExecutable @("--test", "scripts/qa/tests/*.test.mjs")
    Invoke-External ".NET solution build" "dotnet" @("build", "server/G2Erp.sln", "--no-restore")
    Invoke-External "Non-SQL .NET tests" "dotnet" @("test", "server/G2Erp.Api.Tests/G2Erp.Api.Tests.csproj", "--no-restore", "--filter", "FullyQualifiedName!~SqlServer", "--logger", "console;verbosity=minimal")
    Invoke-External "Mock core Playwright" $nodeExecutable @("scripts/run-mode.mjs", "test", "mock")
    Invoke-External "InMemory core Playwright" $nodeExecutable @("scripts/run-mode.mjs", "test", "inmemory")
    $mockUxFiles = @("tests/e2e/ai-solution-center.spec.ts", "tests/e2e/grid-view-preferences.spec.ts", "tests/e2e/lazy-screen-loading.spec.ts", "tests/e2e/mobile-pda-sales-order.spec.ts", "tests/e2e/release-candidate-menu-smoke.spec.ts", "tests/e2e/screen-module-prefetch.spec.ts", "tests/e2e/unsaved-navigation-guard.spec.ts") -join ";"
    Invoke-External "Mock UX Playwright" $nodeExecutable @("scripts/run-mode.mjs", "test", "mock") @{ PLAYWRIGHT_TEST_FILES = $mockUxFiles; PLAYWRIGHT_WORKERS = "1" }
    Invoke-External "Production development-data Playwright" $nodeExecutable @("scripts/run-mode.mjs", "test", "mock") @{ PLAYWRIGHT_TEST_FILE = "tests/e2e/production-development-data.spec.ts"; PLAYWRIGHT_PRODUCTION_MODE = "true"; PLAYWRIGHT_WORKERS = "1" }
    $apiUxFiles = @("tests/e2e/mobile-pda-api-hardening.spec.ts", "tests/e2e/mobile-pda-api-inmemory.spec.ts", "tests/e2e/unsaved-navigation-saving.spec.ts") -join ";"
    Invoke-External "InMemory mobile/PDA Playwright" $nodeExecutable @("scripts/run-mode.mjs", "test", "inmemory") @{ PLAYWRIGHT_TEST_FILES = $apiUxFiles; PLAYWRIGHT_WORKERS = "1" }
    Invoke-External "Shared access Playwright" $nodeExecutable @("scripts/run-mode.mjs", "test", "demo") @{ PLAYWRIGHT_WORKERS = "1" }
    Invoke-External "Local SQL worker verification" "powershell.exe" @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $requestScript, "-RepositoryRoot", $RepositoryRoot, "-Reason", "RC2 full regression", "-Wait", "-TimeoutSeconds", "1800")
    Invoke-Internal "Final ports and Git state" {
        if (-not (Test-LocalPortFree 5173) -or -not (Test-LocalPortFree 5080)) { throw "Ports 5173 and 5080 were not released." }
        $status = @(& git -C $RepositoryRoot status --short)
        if ($status.Count -gt 0) { throw "Working tree changed during regression: $($status -join ', ')" }
        "ports=free; clean=true"
    }

    Write-Summary "PASS"
    $total = (Get-Date) - $startedAt
    Write-Host "RC2 FULL REGRESSION: PASS ($([math]::Round($total.TotalSeconds, 1))s)"
    $finalExitCode = 0
}
catch {
    Write-Summary "FAIL"
    $total = (Get-Date) - $startedAt
    $failedStep = @($steps | Where-Object { $_.status -eq "FAIL" } | Select-Object -First 1)
    if ($failedStep.Count -gt 0) { Write-Host "First failed step: $($failedStep[0].name)" }
    Write-Error "RC2 FULL REGRESSION: FAIL ($([math]::Round($total.TotalSeconds, 1))s) - $($_.Exception.Message)"
}
finally {
    if ($lockCreated -and (Test-Path -LiteralPath $lockPath)) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
    Pop-Location
}

exit $finalExitCode
