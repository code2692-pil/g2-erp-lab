#requires -Version 5.1
<#
Stops only the process identities written by start-g2-erp-test.ps1. It never
searches by executable name or terminates every process that uses a port.
#>

[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:RuntimeDirectory = Join-Path $script:ProjectRoot '.runtime'
$script:SessionPath = Join-Path $script:RuntimeDirectory 'g2-erp-test-session.json'
$script:LaunchCommand = 'node scripts/run-mode.mjs dev sqlserver'

function Write-LauncherMessage {
    param([string]$Message)
    Write-Host "[G2 ERP Test] $Message"
}

function Get-ProcessInfo {
    param([int]$ProcessId)
    $processInfo = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
    if ($null -ne $processInfo) { return $processInfo }
    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return [pscustomobject]@{
            ProcessId = [int]$process.Id
            ParentProcessId = $null
            CommandLine = $null
            CreationDate = $null
            StartTime = $process.StartTime.ToUniversalTime()
        }
    }
    catch { return $null }
}

function Convert-ProcessCreationTime {
    param($ProcessInfo)
    if ($null -eq $ProcessInfo) { return $null }
    if (-not [string]::IsNullOrWhiteSpace([string]$ProcessInfo.CreationDate)) {
        return [System.Management.ManagementDateTimeConverter]::ToDateTime($ProcessInfo.CreationDate).ToUniversalTime()
    }
    if ($null -ne $ProcessInfo.StartTime) { return ([datetime]$ProcessInfo.StartTime).ToUniversalTime() }
    return $null
}

function Test-ProcessStartTime {
    param($ProcessInfo, [string]$RecordedStart)
    if ($null -eq $ProcessInfo -or [string]::IsNullOrWhiteSpace($RecordedStart)) { return $false }
    try {
        $actual = Convert-ProcessCreationTime -ProcessInfo $ProcessInfo
        $recorded = [datetime]::Parse($RecordedStart).ToUniversalTime()
        return $null -ne $actual -and [Math]::Abs(($actual - $recorded).TotalSeconds) -le 10
    }
    catch { return $false }
}

function Read-Session {
    if (-not (Test-Path -LiteralPath $script:SessionPath)) { return $null }
    try {
        $session = Get-Content -Raw -Encoding utf8 -LiteralPath $script:SessionPath | ConvertFrom-Json
        if ($session.ProjectRoot -ne $script:ProjectRoot -or $session.LaunchCommand -ne $script:LaunchCommand) { return $null }
        return $session
    }
    catch { return $null }
}

function Test-RunnerRecord {
    param($ProcessInfo, $Session)
    if ($null -eq $ProcessInfo -or $null -eq $Session) { return $false }
    $commandLine = [string]$ProcessInfo.CommandLine
    $commandMatches = [string]::IsNullOrWhiteSpace($commandLine) -or
        ($commandLine -match '(?i)scripts[\\/]run-mode\.mjs' -and $commandLine -match '(?i)\bdev\s+sqlserver\b')
    return $commandMatches -and (Test-ProcessStartTime -ProcessInfo $ProcessInfo -RecordedStart ([string]$Session.RunnerStartedAtUtc))
}

function Test-ManagedProcessRecord {
    param($ProcessInfo, $Record)
    if ($null -eq $ProcessInfo -or $null -eq $Record) { return $false }
    if (-not (Test-ProcessStartTime -ProcessInfo $ProcessInfo -RecordedStart ([string]$Record.StartedAtUtc))) { return $false }

    $commandLine = [string]$ProcessInfo.CommandLine
    if ([string]::IsNullOrWhiteSpace($commandLine)) { return $true }
    if ($Record.Role -eq 'Backend') { return $commandLine -match '(?i)G2Erp\.Api[\\/]G2Erp\.Api\.csproj' }
    if ($Record.Role -eq 'Frontend') { return $commandLine -match '(?i)node_modules[\\/]vite[\\/]bin[\\/]vite\.js' }
    return $false
}

function Get-DescendantProcessIds {
    param([int]$RootProcessId)
    $allProcesses = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue)
    $pending = New-Object System.Collections.Generic.Queue[int]
    $pending.Enqueue($RootProcessId)
    $ids = New-Object System.Collections.Generic.List[int]
    while ($pending.Count -gt 0) {
        $parentId = $pending.Dequeue()
        foreach ($process in $allProcesses | Where-Object { [int]$_.ParentProcessId -eq $parentId }) {
            $ids.Add([int]$process.ProcessId)
            $pending.Enqueue([int]$process.ProcessId)
        }
    }
    return @($ids)
}

function Remove-SessionFile {
    Remove-Item -LiteralPath $script:SessionPath -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $script:RuntimeDirectory) {
        $remaining = @(Get-ChildItem -LiteralPath $script:RuntimeDirectory -Force -ErrorAction SilentlyContinue)
        if ($remaining.Count -eq 0) { Remove-Item -LiteralPath $script:RuntimeDirectory -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-SelfTest {
    if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot '.git'))) { throw '프로젝트 루트를 찾지 못했습니다.' }
    if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot 'scripts\start-g2-erp-test.ps1'))) { throw '시작 스크립트를 찾지 못했습니다.' }
    $session = Read-Session
    if ($null -ne $session -and $null -eq $session.RunnerProcessId) { throw '실행 상태 파일 형식이 올바르지 않습니다.' }
    Write-LauncherMessage 'Self-test passed: session ownership checks are ready. No process was stopped.'
}

if ($SelfTest) {
    try { Invoke-SelfTest; exit 0 }
    catch {
        Write-LauncherMessage $_.Exception.Message
        exit 1
    }
}

$session = Read-Session
if ($null -eq $session) {
    if (Test-Path -LiteralPath $script:SessionPath) {
        Remove-SessionFile
        Write-LauncherMessage '유효하지 않거나 이전 실행 상태를 정리했습니다. 서버는 이미 종료되어 있습니다.'
    }
    else {
        Write-LauncherMessage '이 바로가기에서 시작한 서버는 이미 종료되어 있습니다.'
    }
    exit 0
}

$targets = New-Object System.Collections.Generic.List[object]
$runner = Get-ProcessInfo -ProcessId ([int]$session.RunnerProcessId)
$runnerIsOwned = Test-RunnerRecord -ProcessInfo $runner -Session $session

foreach ($record in @($session.ManagedProcesses)) {
    $process = Get-ProcessInfo -ProcessId ([int]$record.ProcessId)
    if (Test-ManagedProcessRecord -ProcessInfo $process -Record $record) {
        $targets.Add([pscustomobject]@{ ProcessId = [int]$record.ProcessId; Role = [string]$record.Role })
    }
}

if ($runnerIsOwned) {
    foreach ($processId in Get-DescendantProcessIds -RootProcessId ([int]$session.RunnerProcessId)) {
        if ($targets.ProcessId -notcontains $processId) {
            # A descendant belongs to the owned runner. It is still stopped only after this parent-child check.
            $targets.Add([pscustomobject]@{ ProcessId = $processId; Role = 'Runner child' })
        }
    }
}

if ($targets.Count -eq 0 -and -not $runnerIsOwned) {
    Remove-SessionFile
    Write-LauncherMessage '이 바로가기에서 시작한 서버는 이미 종료되어 있습니다.'
    exit 0
}

$requestedProcessIds = New-Object System.Collections.Generic.List[int]
foreach ($target in @($targets | Sort-Object ProcessId -Unique)) {
    try {
        Stop-Process -Id ([int]$target.ProcessId) -ErrorAction Stop
        $requestedProcessIds.Add([int]$target.ProcessId)
        Write-LauncherMessage "$($target.Role) 프로세스(PID $($target.ProcessId))에 종료를 요청했습니다."
    }
    catch {
        Write-LauncherMessage "$($target.Role) 프로세스(PID $($target.ProcessId))는 이미 종료되었거나 종료 요청을 받을 수 없습니다."
    }
}

if ($runnerIsOwned) {
    try {
        Stop-Process -Id ([int]$session.RunnerProcessId) -ErrorAction Stop
        $requestedProcessIds.Add([int]$session.RunnerProcessId)
        Write-LauncherMessage "실행기 프로세스(PID $($session.RunnerProcessId))에 종료를 요청했습니다."
    }
    catch {
        Write-LauncherMessage '실행기는 이미 종료되었습니다.'
    }
}

Start-Sleep -Seconds 1
$remainingProcessIds = @($requestedProcessIds | Select-Object -Unique | Where-Object {
        $null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)
    })
if ($remainingProcessIds.Count -gt 0) {
    Write-LauncherMessage "일부 프로젝트 프로세스가 아직 종료되지 않았습니다(PID: $($remainingProcessIds -join ', ')). 강제 종료하지 않았으며 실행 상태 파일을 유지했습니다. 잠시 후 종료 바로가기를 다시 실행하세요."
    exit 1
}

Remove-SessionFile
Write-LauncherMessage 'G2 ERP 테스트 서버 종료를 완료했습니다. 브라우저 창은 사용자가 직접 닫아 주세요.'
