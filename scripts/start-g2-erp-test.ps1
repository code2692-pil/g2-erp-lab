#requires -Version 5.1
<#
Runs the local SqlServer ERP test mode in this visible PowerShell console.
Closing this console or pressing Ctrl+C returns control to the existing runner,
which stops only the frontend and backend processes it started.
#>

[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:RunModePath = Join-Path $script:ProjectRoot 'scripts\run-mode.mjs'
$script:RuntimeDirectory = Join-Path $script:ProjectRoot '.runtime'
$script:SessionPath = Join-Path $script:RuntimeDirectory 'g2-erp-test-session.json'
$script:FrontendUrl = 'http://127.0.0.1:5173'
$script:BackendUrl = 'http://127.0.0.1:5080/api/purchase-orders'
$script:LaunchCommand = 'node scripts/run-mode.mjs dev sqlserver'

function Write-LauncherMessage {
    param([string]$Message)
    Write-Host "[G2 ERP Test] $Message"
}

function Assert-ProjectRoot {
    if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot '.git'))) {
        throw '프로젝트 루트를 찾지 못했습니다. scripts 폴더가 프로젝트 안에 있는지 확인하세요.'
    }
    if (-not (Test-Path -LiteralPath $script:RunModePath)) {
        throw '기존 실행기 scripts/run-mode.mjs를 찾지 못했습니다.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot 'node_modules\vite\bin\vite.js'))) {
        throw '프로젝트 의존성이 준비되지 않았습니다. 관리자에게 pnpm install 여부를 문의하세요.'
    }
}

function Get-RequiredCommand {
    param([string[]]$Names, [string]$DisplayName)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) { return $command }
    }

    throw "$DisplayName 을(를) 찾지 못했습니다. 설치 후 다시 시도하세요."
}

function Assert-RequiredTools {
    $node = Get-RequiredCommand -Names @('node.exe', 'node') -DisplayName 'Node.js'
    $null = Get-RequiredCommand -Names @('pnpm.cmd', 'pnpm') -DisplayName 'pnpm'
    $null = & $node.Source --version
    if ($LASTEXITCODE -ne 0) { throw 'Node.js를 실행할 수 없습니다.' }
    return $node
}

function Get-ConnectionSetting {
    param([string]$ConnectionString, [string]$Name)

    $match = [regex]::Match($ConnectionString, "(?:^|;)$([regex]::Escape($Name))=([^;]+)", [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $match.Success) { return $null }
    return $match.Groups[1].Value.Trim()
}

function Assert-LocalDevelopmentSqlSafety {
    # The command below keeps using the existing runner and the application's
    # local-only SQL Server validation instead of duplicating connection logic.
    $runnerSource = Get-Content -Raw -Encoding utf8 -LiteralPath $script:RunModePath
    $programPath = Join-Path $script:ProjectRoot 'server\G2Erp.Api\Program.cs'
    $validatorPath = Join-Path $script:ProjectRoot 'server\G2Erp.Api\Repositories\SqlServerConnectionFactory.cs'
    $programSource = Get-Content -Raw -Encoding utf8 -LiteralPath $programPath
    $validatorSource = Get-Content -Raw -Encoding utf8 -LiteralPath $validatorPath

    if ($runnerSource -notmatch 'RepositoryMode:\s*"SqlServer"' -or $runnerSource -notmatch 'ASPNETCORE_ENVIRONMENT:\s*"Development"') {
        throw 'SqlServer 실행 설정이 Development 모드가 아니므로 시작을 차단했습니다.'
    }
    if ($programSource -notmatch 'SqlServerConnectionFactory\.ValidateLocalOnly' -or $validatorSource -notmatch 'IntegratedSecurity') {
        throw '기존 로컬 SQL Server 안전 검증을 확인할 수 없어 시작을 차단했습니다.'
    }

    $connectionMatch = [regex]::Match($runnerSource, 'ConnectionStrings__G2Erp:\s*"([^"]+)"')
    if (-not $connectionMatch.Success) { throw '로컬 SQL Server 연결 설정을 확인할 수 없어 시작을 차단했습니다.' }

    $connectionString = $connectionMatch.Groups[1].Value
    $server = Get-ConnectionSetting -ConnectionString $connectionString -Name 'Server'
    $database = Get-ConnectionSetting -ConnectionString $connectionString -Name 'Database'
    $trustedConnection = Get-ConnectionSetting -ConnectionString $connectionString -Name 'Trusted_Connection'
    $localServers = @('.', 'localhost', '127.0.0.1', $env:COMPUTERNAME)
    $allowedDatabases = @('G2ERP_DEV_LOCAL', 'G2ERP_DEV_LOCAL_TEST')

    if ($localServers -notcontains $server) { throw '로컬 SQL Server가 아닌 연결 설정이므로 시작을 차단했습니다.' }
    if ($allowedDatabases -notcontains $database) { throw '허용된 개발 DB가 아닌 연결 설정이므로 시작을 차단했습니다.' }
    if ($trustedConnection -notmatch '^(true|yes|sspi)$') { throw 'Windows 통합 인증이 아닌 연결 설정이므로 시작을 차단했습니다.' }
    if ($connectionString -match '(?i)(?:^|;)(User ID|UID|Password|PWD)=') { throw '계정 또는 비밀번호 기반 연결 설정이므로 시작을 차단했습니다.' }
}

function Get-ProcessStartTime {
    param([int]$ProcessId)
    try { return (Get-Process -Id $ProcessId -ErrorAction Stop).StartTime.ToUniversalTime() }
    catch { return $null }
}

function Test-ManagedConsoleSession {
    param($Session)
    if ($null -eq $Session -or $Session.ProjectRoot -ne $script:ProjectRoot -or $Session.LaunchCommand -ne $script:LaunchCommand) { return $false }
    try {
        $actualStart = Get-ProcessStartTime -ProcessId ([int]$Session.ConsoleProcessId)
        $recordedStart = [datetime]::Parse([string]$Session.ConsoleStartedAtUtc).ToUniversalTime()
        return $null -ne $actualStart -and [Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -le 10
    }
    catch { return $false }
}

function Read-Session {
    if (-not (Test-Path -LiteralPath $script:SessionPath)) { return $null }
    try { return Get-Content -Raw -Encoding utf8 -LiteralPath $script:SessionPath | ConvertFrom-Json }
    catch { return $null }
}

function Remove-OwnSession {
    $session = Read-Session
    if ($null -ne $session -and [int]$session.ConsoleProcessId -eq $PID) {
        Remove-Item -LiteralPath $script:SessionPath -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $script:RuntimeDirectory) {
        $remaining = @(Get-ChildItem -LiteralPath $script:RuntimeDirectory -Force -ErrorAction SilentlyContinue)
        if ($remaining.Count -eq 0) { Remove-Item -LiteralPath $script:RuntimeDirectory -Force -ErrorAction SilentlyContinue }
    }
}

function Write-ConsoleSession {
    $startedAt = Get-ProcessStartTime -ProcessId $PID
    if ($null -eq $startedAt) { $startedAt = (Get-Date).ToUniversalTime() }
    $consoleTitle = "G2 ERP Test Server (PID $PID)"
    try { $Host.UI.RawUI.WindowTitle = $consoleTitle } catch { }
    $session = [pscustomobject]@{
        ProjectRoot = $script:ProjectRoot
        LaunchCommand = $script:LaunchCommand
        Mode = 'sqlserver'
        ConsoleProcessId = $PID
        ConsoleStartedAtUtc = $startedAt.ToString('o')
        FrontendUrl = $script:FrontendUrl
        BackendUrl = 'http://127.0.0.1:5080'
        ConsoleTitle = $consoleTitle
        CreatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    }
    New-Item -ItemType Directory -Force -Path $script:RuntimeDirectory | Out-Null
    $session | ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath $script:SessionPath
}

function Test-TcpPort {
    param([int]$Port, [int]$TimeoutMilliseconds = 750)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) { return $false }
        $client.EndConnect($async)
        return $true
    }
    catch { return $false }
    finally { $client.Dispose() }
}

function Test-HttpOk {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    }
    catch { return $false }
}

function Test-G2ErpServicesReady {
    return (Test-TcpPort -Port 5080) -and (Test-HttpOk -Url $script:BackendUrl) -and (Test-TcpPort -Port 5173) -and (Test-HttpOk -Url $script:FrontendUrl)
}

function Wait-ForManagedG2ErpServices {
    param($Session, [int]$TimeoutSeconds = 75)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-ManagedConsoleSession -Session $Session)) { throw '기존 관리 콘솔이 종료되었습니다.' }
        if (Test-G2ErpServicesReady) { return }
        Start-Sleep -Milliseconds 500
    }
    throw '75초 안에 기존 Frontend(5173)와 Backend(5080)가 모두 준비되지 않았습니다.'
}

function Invoke-SelfTest {
    Assert-ProjectRoot
    Set-Location -LiteralPath $script:ProjectRoot
    $null = Assert-RequiredTools
    Assert-LocalDevelopmentSqlSafety
    Write-LauncherMessage 'Self-test passed: project, tools, and local-development SQL safety checks are ready.'
}

if ($SelfTest) {
    try { Invoke-SelfTest; exit 0 }
    catch {
        Write-LauncherMessage $_.Exception.Message
        exit 1
    }
}

try {
    Assert-ProjectRoot
    Set-Location -LiteralPath $script:ProjectRoot
    $node = Assert-RequiredTools
    Assert-LocalDevelopmentSqlSafety

    $session = Read-Session
    if ($null -ne $session) {
        if (Test-ManagedConsoleSession -Session $session) {
            Write-LauncherMessage '이미 이 바로가기에서 관리 중인 서버가 실행 중입니다. 새 서버를 만들지 않고 기존 주소를 엽니다.'
            Wait-ForManagedG2ErpServices -Session $session
            Start-Process $script:FrontendUrl
            exit 0
        }
        Remove-Item -LiteralPath $script:SessionPath -Force -ErrorAction SilentlyContinue
        Write-LauncherMessage '이전 실행 상태 파일을 정리했습니다.'
    }

    $frontendInUse = Test-TcpPort -Port 5173
    $backendInUse = Test-TcpPort -Port 5080
    if ($frontendInUse -or $backendInUse) {
        if (Test-G2ErpServicesReady) {
            throw '5173/5080에서 G2 ERP 서비스가 이미 실행 중이지만, 이 시작 바로가기의 관리 세션이 아닙니다. 다른 프로젝트에 영향을 주지 않기 위해 재사용하거나 종료하지 않았습니다. 원래 콘솔에서 종료한 뒤 다시 시작하세요.'
        }
        throw '5173 또는 5080 포트가 다른 프로세스에서 사용 중입니다. 다른 프로젝트에 영향을 주지 않기 위해 종료하거나 강제 종료하지 않았습니다.'
    }

    Write-ConsoleSession
    $previousOpenBrowser = $env:G2ERP_OPEN_BROWSER
    $previousSessionFile = $env:G2ERP_SESSION_FILE
    $env:G2ERP_OPEN_BROWSER = 'true'
    $env:G2ERP_SESSION_FILE = $script:SessionPath
    $runnerExitCode = 1
    try {
        Write-LauncherMessage '로컬 SqlServer 테스트 모드를 시작합니다. 이 콘솔을 열어 두는 동안 서버가 유지됩니다.'
        Write-LauncherMessage '종료하려면 Ctrl+C를 누르거나 이 콘솔 창을 닫으세요. 브라우저 창만 닫아도 서버는 계속 실행됩니다.'
        & $node.Source scripts/run-mode.mjs dev sqlserver
        $runnerExitCode = $LASTEXITCODE
        if ($runnerExitCode -ne 0) { throw '실행기가 정상적으로 종료되지 않았습니다. 위 콘솔 메시지를 확인하세요.' }
    }
    finally {
        $env:G2ERP_OPEN_BROWSER = $previousOpenBrowser
        $env:G2ERP_SESSION_FILE = $previousSessionFile
        Remove-OwnSession
    }
    # A foreground runner ending normally is the Ctrl+C shutdown path. Explicit
    # exit closes the -NoExit console only after the runner cleaned up its children.
    exit $runnerExitCode
}
catch {
    Remove-OwnSession
    Write-LauncherMessage $_.Exception.Message
    Read-Host '오류 내용을 확인한 뒤 Enter 키를 누르면 창이 닫힙니다' | Out-Null
    exit 1
}
