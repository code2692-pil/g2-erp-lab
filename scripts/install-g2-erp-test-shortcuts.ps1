#requires -Version 5.1
<#
Creates or refreshes the one visible-console desktop shortcut used by a local
test user, and removes the legacy stop shortcut.
#>

[CmdletBinding()]
param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'
$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:StartScript = Join-Path $script:ProjectRoot 'scripts\start-g2-erp-test.ps1'

function Write-LauncherMessage {
    param([string]$Message)
    Write-Host "[G2 ERP Test] $Message"
}

function Assert-InstallPrerequisites {
    if (-not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot '.git'))) { throw '프로젝트 루트를 찾지 못했습니다.' }
    if (-not (Test-Path -LiteralPath $script:StartScript)) { throw '시작 스크립트를 찾지 못했습니다.' }
    $powerShell = Get-Command powershell.exe -ErrorAction SilentlyContinue
    if ($null -eq $powerShell) { throw 'Windows PowerShell을 찾지 못했습니다.' }
    return $powerShell.Source
}

function Set-DesktopShortcut {
    param(
        [object]$Shell,
        [string]$DesktopPath,
        [string]$Name,
        [string]$ScriptPath,
        [string]$IconIndex
    )

    $shortcutPath = Join-Path $DesktopPath "$Name.lnk"
    $shortcut = $Shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $script:PowerShellPath
    # The start script owns the foreground runner. It keeps this console open
    # while the server runs and pauses only when a startup error must be read.
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $ScriptPath
    $shortcut.WorkingDirectory = $script:ProjectRoot
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,$IconIndex"
    $shortcut.Description = $Name
    $shortcut.Save()
    return $shortcutPath
}

function Invoke-SelfTest {
    $null = Assert-InstallPrerequisites
    Write-LauncherMessage 'Self-test passed: the visible-console start shortcut and Windows PowerShell are available.'
}

if ($SelfTest) {
    try { Invoke-SelfTest; exit 0 }
    catch {
        Write-LauncherMessage $_.Exception.Message
        exit 1
    }
}

try {
    $script:PowerShellPath = Assert-InstallPrerequisites
    $desktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
    if ([string]::IsNullOrWhiteSpace($desktopPath) -or -not (Test-Path -LiteralPath $desktopPath)) {
        throw 'Windows 바탕화면 경로를 찾지 못했습니다.'
    }

    $shell = New-Object -ComObject WScript.Shell
    try {
        $startShortcut = Set-DesktopShortcut -Shell $shell -DesktopPath $desktopPath -Name 'G2 ERP 테스트 시작' -ScriptPath $script:StartScript -IconIndex '220'
        $stopShortcut = Join-Path $desktopPath 'G2 ERP 테스트 종료.lnk'
        if (Test-Path -LiteralPath $stopShortcut) { Remove-Item -LiteralPath $stopShortcut -Force }
    }
    finally {
        if ($null -ne $shell) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell) }
    }

    Write-LauncherMessage '바탕화면 시작 바로가기를 생성하거나 갱신했습니다.'
    Write-LauncherMessage "시작: $startShortcut"
    Write-LauncherMessage "종료 바로가기 제거 확인: $stopShortcut"
}
catch {
    Write-LauncherMessage $_.Exception.Message
    exit 1
}
