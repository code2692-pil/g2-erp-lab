#requires -Version 5.1
<##
Verifies the development-data manager only against the local SQL Server PoC target.
Run this explicitly from the repository root using the Windows account that is allowed
to use the local instance. No SQL Server configuration or non-PoC database is changed.
##>

[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$script:TargetServer = 'localhost'
$script:TargetDatabase = 'G2ERP_DEV_LOCAL_TEST'
$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:SqlCmdPath = $null
$script:Steps = New-Object System.Collections.Generic.List[object]
$script:Verdict = 'Environment error'

function Write-RunnerMessage { param([string]$Message) Write-Host "[DevelopmentData SQL Runner] $Message" }

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Write-RunnerMessage "START  $Name"
    try {
        & $Action
        $watch.Stop()
        $script:Steps.Add([pscustomobject]@{ Step = $Name; Result = 'PASS'; Duration = $watch.Elapsed; Detail = '' })
        Write-RunnerMessage "PASS   $Name ($($watch.Elapsed))"
    }
    catch {
        $watch.Stop()
        $script:Steps.Add([pscustomobject]@{ Step = $Name; Result = 'FAIL'; Duration = $watch.Elapsed; Detail = $_.Exception.Message })
        Write-RunnerMessage "FAIL   $Name ($($watch.Elapsed))"
        throw
    }
}

function Assert-ProjectRoot {
    if (-not [string]::Equals((Get-Location).Path.TrimEnd('\'), $script:ProjectRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) {
        throw "Run this command from the project root: $script:ProjectRoot"
    }
    if (-not (Test-Path (Join-Path $script:ProjectRoot '.git'))) { throw 'The resolved project root does not contain .git.' }
}

function Select-SqlCmd {
    $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
    if ($null -eq $sqlcmd) { $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue }
    if ($null -eq $sqlcmd) { throw 'sqlcmd is required for the local target preflight; this runner will not install software.' }
    $script:SqlCmdPath = $sqlcmd.Source
}

function Get-SqlScalar {
    param([string]$Query)
    $output = @(& $script:SqlCmdPath -S $script:TargetServer -d $script:TargetDatabase -E -N -C -b -r1 -h -1 -W -Q "SET NOCOUNT ON; $Query" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'The read-only SQL preflight query failed.' }
    $values = @($output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -and -not $_.StartsWith('(') })
    if ($values.Count -eq 0) { throw 'The SQL preflight query returned no scalar value.' }
    return $values[$values.Count - 1]
}

function Get-SampleCounts {
    $query = @"
SELECT CONCAT(
  (SELECT COUNT(*) FROM POC.MA_ITEM WHERE CD_FIRM=N'1000' AND CD_ITEM LIKE N'ITEM-SMP-%'), N'|',
  (SELECT COUNT(*) FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=N'1000' AND CD_LINE LIKE N'LINE-SMP-%'), N'|',
  (SELECT COUNT(*) FROM POC.MST_PROCESS WHERE CD_FIRM=N'1000' AND CD_PROC LIKE N'PROC-SMP-%'), N'|',
  (SELECT COUNT(*) FROM POC.MST_EQUIPMENT WHERE CD_FIRM=N'1000' AND CD_EQUIP LIKE N'EQ-SMP-%'), N'|',
  (SELECT COUNT(*) FROM POC.SAL_SOH WHERE CD_FIRM=N'1000' AND NO_SO LIKE N'SO-SAMPLE-%'), N'|',
  (SELECT COUNT(*) FROM POC.PUR_POH WHERE CD_FIRM=N'1000' AND NO_PO LIKE N'PO-SAMPLE-%'), N'|',
  (SELECT COUNT(*) FROM POC.PRT_WO WHERE CD_FIRM=N'1000' AND NO_WO LIKE N'WO-SAMPLE-%'));
"@
    return Get-SqlScalar $query
}

function Invoke-PlaywrightDevelopmentData {
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $pnpm) { $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue }
    if ($null -eq $pnpm) { throw 'pnpm is required; this runner will not install software.' }
    $previousSpec = $env:PLAYWRIGHT_TEST_FILE
    try {
        $env:PLAYWRIGHT_TEST_FILE = 'tests/e2e/development-data.spec.ts'
        & $pnpm.Source run test:e2e:api:sqlserver
        if ($LASTEXITCODE -ne 0) { throw 'Playwright assertion or API verification failed: tests/e2e/development-data.spec.ts.' }
    }
    finally { $env:PLAYWRIGHT_TEST_FILE = $previousSpec }
}

function Assert-PostRunSafety {
    $remaining = Get-SampleCounts
    if ($remaining -ne '0|0|0|0|0|0|0') { throw "Sample rows remain after cleanup: $remaining" }
    $seedItems = [int](Get-SqlScalar "SELECT COUNT(*) FROM POC.MA_ITEM WHERE CD_FIRM=N'1000' AND CD_ITEM NOT LIKE N'ITEM-SMP-%';")
    $e2eItems = [int](Get-SqlScalar "SELECT COUNT(*) FROM POC.MA_ITEM WHERE CD_FIRM=N'1000' AND CD_ITEM LIKE N'E2E-%';")
    if ($seedItems -lt 1) { throw 'Existing non-Sample item seed data is missing after verification.' }
    Write-RunnerMessage "Post-run non-Sample items=$seedItems; E2E items=$e2eItems (read-only verification only)"
}

function Write-FinalSummary {
    Write-Host ''
    Write-RunnerMessage 'FINAL SUMMARY'
    $script:Steps | Format-Table -AutoSize Step, Result, Duration, Detail | Out-Host
    Write-RunnerMessage "VERDICT: $($script:Verdict)"
}

if ($SelfTest) {
    try {
        Invoke-Step 'Target constants' {
            if ($script:TargetServer -ne 'localhost' -or $script:TargetDatabase -ne 'G2ERP_DEV_LOCAL_TEST') { throw 'Target constants are not safe.' }
        }
        $script:Verdict = 'Self-test completed'
    }
    finally { Write-FinalSummary }
    if ($script:Verdict -ne 'Self-test completed') { exit 1 }
    return
}

try {
    Invoke-Step 'Project root and current Windows user' {
        Assert-ProjectRoot
        Write-RunnerMessage "Windows user: $([Security.Principal.WindowsIdentity]::GetCurrent().Name)"
    }
    Invoke-Step 'Local SQL Server and allowed database preflight' {
        Select-SqlCmd
        $actualServer = Get-SqlScalar "SELECT CONVERT(nvarchar(256), SERVERPROPERTY('ServerName'));"
        $actualDatabase = Get-SqlScalar 'SELECT DB_NAME();'
        $login = Get-SqlScalar 'SELECT SUSER_SNAME();'
        if ($actualDatabase -ne $script:TargetDatabase) { throw "Connected database '$actualDatabase' is not the allowed test database." }
        Write-RunnerMessage "Connected server: $actualServer; database: $actualDatabase; login: $login"
    }
    Invoke-Step 'Record existing fixed Sample counts' { Write-RunnerMessage "Before run: $(Get-SampleCounts)" }
    Invoke-Step 'Development-data UI flow: Summary, Preview, create, and cleanup' { Invoke-PlaywrightDevelopmentData }
    Invoke-Step 'Verify Prefix-only cleanup and retained non-Sample seed data' { Assert-PostRunSafety }
    $script:Verdict = 'Verification completed'
}
catch {
    $failedStep = @($script:Steps | Where-Object { $_.Result -eq 'FAIL' } | Select-Object -Last 1).Step
    if ($failedStep -eq 'Development-data UI flow: Summary, Preview, create, and cleanup') {
        $script:Verdict = 'Test failure'
    }
    elseif ($failedStep -eq 'Verify Prefix-only cleanup and retained non-Sample seed data') {
        $script:Verdict = 'Cleanup failure'
    }
    [Console]::Error.WriteLine("Verification stopped at '$failedStep': $($_.Exception.Message)")
}
finally { Write-FinalSummary }

if ($script:Verdict -ne 'Verification completed') { exit 1 }
