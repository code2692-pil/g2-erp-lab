[CmdletBinding()]
param(
    [string]$RepositoryRoot,
    [ValidateRange(2, 5)][int]$PollSeconds = 3,
    [switch]$AllowReplacement,
    [int]$ReplacementOfPid,
    [string]$InitialLastRequestId,
    [switch]$ValidateOnly,
    [switch]$SelfTest,
    [string]$ReevaluateSummaryPath,
    [string]$ReevaluateExpectedRequestId,
    [int]$ReevaluateVerificationExitCode = 0
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
    $Value | ConvertTo-Json -Depth 8 | Set-Content -Path $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Read-JsonStable {
    param([string]$Path)
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) }
        catch {
            if ($attempt -eq 3) { throw }
            Start-Sleep -Milliseconds 250
        }
    }
}

function Get-GitState {
    param([string]$Root)
    $branch = (& git -C $Root branch --show-current).Trim()
    $head = (& git -C $Root rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch) -or [string]::IsNullOrWhiteSpace($head)) {
        throw "Unable to read repository branch and HEAD."
    }
    return [pscustomobject]@{ branch = $branch; head = $head }
}

function New-Result {
    param(
        [object]$Request,
        [string]$Status,
        [int]$ExitCode,
        [object]$State,
        [object[]]$Steps = @(),
        [object]$MarkerResidue = $null,
        [object[]]$ApiSmoke = @(),
        [string]$LogPath = $null,
        [string]$PrimaryError = $null,
        [string]$StartedAt = (Get-Date).ToUniversalTime().ToString("o"),
        [int]$VerificationExitCode = $null,
        [object]$Outcome = $null
    )
    return [ordered]@{
        requestId = $Request.requestId
        startedAt = $StartedAt
        finishedAt = if ($Status -eq "RUNNING") { $null } else { (Get-Date).ToUniversalTime().ToString("o") }
        status = $Status
        exitCode = $ExitCode
        verificationExitCode = $VerificationExitCode
        branch = $State.branch
        head = $State.head
        steps = @($Steps)
        apiSmoke = @($ApiSmoke)
        markerResidue = $MarkerResidue
        logPath = $LogPath
        primaryError = $PrimaryError
        verifierSummaryPath = Get-OptionalPropertyValue $Outcome "verifierSummaryPath"
        verifierSummaryFound = Get-OptionalPropertyValue $Outcome "verifierSummaryFound"
        verifierSummaryParsed = Get-OptionalPropertyValue $Outcome "verifierSummaryParsed"
        verifierSummaryRequestId = Get-OptionalPropertyValue $Outcome "verifierSummaryRequestId"
        expectedRequestId = Get-OptionalPropertyValue $Outcome "expectedRequestId"
        rawVerifierStatus = Get-OptionalPropertyValue $Outcome "rawVerifierStatus"
        normalizedVerifierStatus = Get-OptionalPropertyValue $Outcome "normalizedVerifierStatus"
        mappingReason = Get-OptionalPropertyValue $Outcome "mappingReason"
    }
}

function Get-OptionalPropertyValue {
    param([object]$Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Get-WorkerScriptHash {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Get-BridgeScriptHash {
    param([string]$WorkerPath, [string]$VerificationPath)
    $content = "$(Get-WorkerScriptHash $WorkerPath)|$(Get-WorkerScriptHash $VerificationPath)"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
    return ([BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes))).Replace("-", "")
}

function Get-FinalExitCode {
    param([string]$Status)
    if ($Status -eq "PASS") { return 0 }
    return 1
}

function Resolve-VerificationOutcome {
    param(
        [string]$VerifierSummaryPath,
        [bool]$VerifierSummaryFound,
        [bool]$VerifierSummaryParsed,
        [object]$VerifierSummary,
        [string]$ExpectedRequestId,
        [int]$VerificationExitCode,
        [string]$WorkerInternalError = $null
    )

    $summaryRequestId = Get-OptionalPropertyValue $VerifierSummary "requestId"
    $rawVerifierStatus = Get-OptionalPropertyValue $VerifierSummary "status"
    $normalizedVerifierStatus = if ($rawVerifierStatus -is [string]) { $rawVerifierStatus.Trim().ToUpperInvariant() } else { $null }
    $mappingReason = $null
    $finalStatus = "FAIL"

    if (-not [string]::IsNullOrWhiteSpace($WorkerInternalError)) {
        $mappingReason = "Worker internal error: $WorkerInternalError"
    }
    elseif (-not $VerifierSummaryFound) {
        $mappingReason = "Verifier summary file was not found."
    }
    elseif (-not $VerifierSummaryParsed) {
        $mappingReason = "Verifier summary JSON could not be parsed."
    }
    elseif ($summaryRequestId -ne $ExpectedRequestId) {
        $mappingReason = "Verifier summary requestId does not match the expected requestId."
    }
    elseif ($normalizedVerifierStatus -eq "PASS" -and $VerificationExitCode -eq 0) {
        $finalStatus = "PASS"
        $mappingReason = "Verifier summary status PASS and verification process exit code 0."
    }
    elseif ($normalizedVerifierStatus -eq "PASS") {
        $mappingReason = "Verifier summary status PASS but verification process exit code was $VerificationExitCode."
    }
    elseif ($normalizedVerifierStatus -eq "FAIL") {
        $mappingReason = "Verifier summary status FAIL."
    }
    elseif ([string]::IsNullOrWhiteSpace($normalizedVerifierStatus)) {
        $mappingReason = "Verifier summary status is missing or not a string."
    }
    else {
        $mappingReason = "Verifier summary status '$normalizedVerifierStatus' is not recognized."
    }

    return [pscustomobject][ordered]@{
        finalStatus = $finalStatus
        finalExitCode = Get-FinalExitCode $finalStatus
        verificationExitCode = $VerificationExitCode
        verifierSummaryPath = $VerifierSummaryPath
        verifierSummaryFound = $VerifierSummaryFound
        verifierSummaryParsed = $VerifierSummaryParsed
        verifierSummaryRequestId = $summaryRequestId
        expectedRequestId = $ExpectedRequestId
        rawVerifierStatus = $rawVerifierStatus
        normalizedVerifierStatus = $normalizedVerifierStatus
        mappingReason = $mappingReason
        verifierSummary = $VerifierSummary
    }
}

function Invoke-OutcomeSelfTest {
    $expectedRequestId = "self-test-request"
    $passingSummary = [pscustomobject]@{ requestId = $expectedRequestId; status = "PASS" }
    $failingSummary = [pscustomobject]@{ requestId = $expectedRequestId; status = "FAIL" }
    $cases = @(
        [pscustomobject]@{ name = "PASS + 0"; found = $true; parsed = $true; summary = $passingSummary; exitCode = 0; workerError = $null; expectedStatus = "PASS"; expectedExitCode = 0 },
        [pscustomobject]@{ name = "PASS + 1"; found = $true; parsed = $true; summary = $passingSummary; exitCode = 1; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "FAIL + 0"; found = $true; parsed = $true; summary = $failingSummary; exitCode = 0; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "FAIL + 1"; found = $true; parsed = $true; summary = $failingSummary; exitCode = 1; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "lowercase pass"; found = $true; parsed = $true; summary = [pscustomobject]@{ requestId = $expectedRequestId; status = "pass" }; exitCode = 0; workerError = $null; expectedStatus = "PASS"; expectedExitCode = 0 },
        [pscustomobject]@{ name = "trimmed PASS"; found = $true; parsed = $true; summary = [pscustomobject]@{ requestId = $expectedRequestId; status = " PASS " }; exitCode = 0; workerError = $null; expectedStatus = "PASS"; expectedExitCode = 0 },
        [pscustomobject]@{ name = "null status"; found = $true; parsed = $true; summary = [pscustomobject]@{ requestId = $expectedRequestId; status = $null }; exitCode = 0; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "unknown status"; found = $true; parsed = $true; summary = [pscustomobject]@{ requestId = $expectedRequestId; status = "UNKNOWN" }; exitCode = 0; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "summary missing"; found = $false; parsed = $false; summary = $null; exitCode = 0; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "summary parse failure"; found = $true; parsed = $false; summary = $null; exitCode = 0; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "requestId mismatch"; found = $true; parsed = $true; summary = [pscustomobject]@{ requestId = "other-request"; status = "PASS" }; exitCode = 0; workerError = $null; expectedStatus = "FAIL"; expectedExitCode = 1 },
        [pscustomobject]@{ name = "worker internal error"; found = $true; parsed = $true; summary = $passingSummary; exitCode = 0; workerError = "simulated worker failure"; expectedStatus = "FAIL"; expectedExitCode = 1 }
    )

    foreach ($case in $cases) {
        $outcome = Resolve-VerificationOutcome -VerifierSummaryPath "self-test.json" -VerifierSummaryFound $case.found -VerifierSummaryParsed $case.parsed -VerifierSummary $case.summary -ExpectedRequestId $expectedRequestId -VerificationExitCode $case.exitCode -WorkerInternalError $case.workerError
        if ($outcome.finalStatus -ne $case.expectedStatus -or $outcome.finalExitCode -ne $case.expectedExitCode) {
            throw "Outcome self-test failed for $($case.name): expected $($case.expectedStatus)/$($case.expectedExitCode), got $($outcome.finalStatus)/$($outcome.finalExitCode)."
        }
    }
}

function Quote-Argument {
    param([string]$Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

function Write-WorkerState {
    param([string]$ActiveRequestId = $null, [string]$LastCompletedRequestId = $null, [string]$LastError = $null, [bool]$RestartRequired = $false)
    Write-AtomicJson $script:WorkerStatePath ([ordered]@{
            instanceId = $script:InstanceId
            workerVersion = $script:WorkerVersion
            pid = $PID
            scriptPath = $script:WorkerScriptPath
            loadedScriptHash = $script:LoadedScriptHash
            currentScriptHash = (Get-BridgeScriptHash $script:WorkerScriptPath $script:VerificationScriptPath)
            startedAt = $script:WorkerStartedAt
            heartbeatAt = (Get-Date).ToUniversalTime().ToString("o")
            restartRequired = $RestartRequired
            activeRequestId = $ActiveRequestId
            lastCompletedRequestId = $LastCompletedRequestId
            lastError = $LastError
        })
}

function Start-WorkerReplacement {
    param([string]$LastHandledRequestId)
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File $(Quote-Argument $script:WorkerScriptPath) -RepositoryRoot $(Quote-Argument $RepositoryRoot) -PollSeconds $PollSeconds -AllowReplacement -ReplacementOfPid $PID -InitialLastRequestId $(Quote-Argument $LastHandledRequestId)"
    $replacement = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $RepositoryRoot -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 500
        if (Test-Path -LiteralPath $script:PidPath -and (Get-Content -LiteralPath $script:PidPath -Raw).Trim() -eq "$($replacement.Id)") {
            return $true
        }
    } while ((Get-Date) -lt $deadline)
    Stop-Process -Id $replacement.Id -ErrorAction SilentlyContinue
    return $false
}

$runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\sql-verify"
$requestPath = Join-Path $runtimeDirectory "request.json"
$resultPath = Join-Path $runtimeDirectory "result.json"
$pidPath = Join-Path $runtimeDirectory "worker.pid"
$verificationPidPath = Join-Path $runtimeDirectory "verification.pid"
$WorkerStatePath = Join-Path $runtimeDirectory "worker-state.json"
$logsDirectory = Join-Path $runtimeDirectory "logs"
$verifyScript = Join-Path $scriptDirectory "verify-local-sql.ps1"
$lastRequestId = $InitialLastRequestId
$request = $null
$activeRequestId = $null
$WorkerVersion = "1.4.0"
$WorkerScriptPath = (Resolve-Path -LiteralPath $PSCommandPath).Path
$VerificationScriptPath = (Resolve-Path -LiteralPath $verifyScript).Path
$LoadedScriptHash = Get-BridgeScriptHash $WorkerScriptPath $VerificationScriptPath
$InstanceId = [Guid]::NewGuid().ToString()
$WorkerStartedAt = (Get-Date).ToUniversalTime().ToString("o")

if ($ValidateOnly) {
    foreach ($case in @(@("PASS", 0), @("FAIL", 1), @("STALE_REQUEST", 1), @("BUSY", 1))) {
        if ((Get-FinalExitCode $case[0]) -ne $case[1]) { throw "Final exit code mapping failed for $($case[0])." }
    }
    Write-Host "LOCAL SQL WORKER STATUS/EXITCODE VALIDATION: PASS"
    return
}

if ($SelfTest) {
    Invoke-OutcomeSelfTest
    Write-Host "LOCAL SQL WORKER SELF TEST: PASS"
    exit 0
}

if (-not [string]::IsNullOrWhiteSpace($ReevaluateSummaryPath)) {
    $summaryPathForReevaluation = [System.IO.Path]::GetFullPath($ReevaluateSummaryPath)
    $summaryFoundForReevaluation = Test-Path -LiteralPath $summaryPathForReevaluation
    $summaryParsedForReevaluation = $false
    $summaryForReevaluation = $null
    $summaryReadErrorForReevaluation = $null
    if ($summaryFoundForReevaluation) {
        try {
            $summaryForReevaluation = Read-JsonStable $summaryPathForReevaluation
            $summaryParsedForReevaluation = $true
        }
        catch {
            $summaryReadErrorForReevaluation = $_.Exception.Message
        }
    }
    $expectedRequestIdForReevaluation = if ([string]::IsNullOrWhiteSpace($ReevaluateExpectedRequestId)) { Get-OptionalPropertyValue $summaryForReevaluation "requestId" } else { $ReevaluateExpectedRequestId }
    $reevaluatedOutcome = Resolve-VerificationOutcome -VerifierSummaryPath $summaryPathForReevaluation -VerifierSummaryFound $summaryFoundForReevaluation -VerifierSummaryParsed $summaryParsedForReevaluation -VerifierSummary $summaryForReevaluation -ExpectedRequestId $expectedRequestIdForReevaluation -VerificationExitCode $ReevaluateVerificationExitCode -WorkerInternalError $summaryReadErrorForReevaluation
    $reevaluatedOutcome | Select-Object finalStatus, finalExitCode, verificationExitCode, verifierSummaryPath, verifierSummaryFound, verifierSummaryParsed, verifierSummaryRequestId, expectedRequestId, rawVerifierStatus, normalizedVerifierStatus, mappingReason | ConvertTo-Json -Depth 4
    exit $reevaluatedOutcome.finalExitCode
}

New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
if (Test-Path -LiteralPath $pidPath) {
    $existingPid = [int]((Get-Content -LiteralPath $pidPath -Raw).Trim())
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $existingPid" -ErrorAction SilentlyContinue
    if ($AllowReplacement -and $existingPid -ne $ReplacementOfPid) { throw "Replacement worker did not find the expected previous worker PID." }
    if (-not $AllowReplacement -and $existingPid -ne $PID -and $null -ne $existing -and $existing.CommandLine -like "*$PSCommandPath*" -and $existing.CommandLine -like "*$RepositoryRoot*") {
        Write-Host "Local SQL verification worker is already running."
        exit 0
    }
}
[System.IO.File]::WriteAllText($pidPath, "$PID", [System.Text.Encoding]::ASCII)
Write-WorkerState -LastCompletedRequestId $lastRequestId

try {
    while ($true) {
        if ($null -eq $activeRequestId -and (Get-BridgeScriptHash $WorkerScriptPath $VerificationScriptPath) -ne $LoadedScriptHash) {
            if (Start-WorkerReplacement -LastHandledRequestId $lastRequestId) { exit 0 }
            Write-WorkerState -LastCompletedRequestId $lastRequestId -LastError "Automatic worker replacement failed; existing worker remains active." -RestartRequired $true
        }
        if (Test-Path -LiteralPath $requestPath) {
            try {
                $request = Read-JsonStable $requestPath
                if ([string]::IsNullOrWhiteSpace([string]$request.requestId)) { throw "Request does not contain requestId." }
                if ($request.requestId -ne $lastRequestId) {
                    $lastRequestId = $request.requestId
                    $state = Get-GitState $RepositoryRoot
                    $activeRequestId = $request.requestId
                    Write-WorkerState -ActiveRequestId $request.requestId
                    if ($request.gitBranch -ne $state.branch -or $request.gitHead -ne $state.head) {
                        $result = New-Result -Request $request -Status "STALE_REQUEST" -ExitCode (Get-FinalExitCode "STALE_REQUEST") -State $state -PrimaryError "STALE_REQUEST: request branch or HEAD does not match the repository."
                        Write-AtomicJson $resultPath $result
                        $activeRequestId = $null
                        Write-WorkerState -LastCompletedRequestId $request.requestId
                    }
                    else {
                        $startedAt = (Get-Date).ToUniversalTime().ToString("o")
                        Write-AtomicJson $resultPath (New-Result -Request $request -Status "RUNNING" -ExitCode 0 -State $state -StartedAt $startedAt)
                        $logPath = Join-Path $logsDirectory "$($request.requestId).log"
                        $errorPath = "$logPath.err"
                        $summaryPath = Join-Path $runtimeDirectory "summary-$($request.requestId).json"
                        $arguments = "-NoProfile -ExecutionPolicy Bypass -File $(Quote-Argument $verifyScript) -RepositoryRoot $(Quote-Argument $RepositoryRoot) -SummaryPath $(Quote-Argument $summaryPath) -RequestId $(Quote-Argument $request.requestId)"
                        $verificationProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $RepositoryRoot -RedirectStandardOutput $logPath -RedirectStandardError $errorPath -PassThru -WindowStyle Hidden
                        [System.IO.File]::WriteAllText($verificationPidPath, "$($verificationProcess.Id)", [System.Text.Encoding]::ASCII)
                        $verificationProcess.WaitForExit()
                        $verificationProcessExitCode = [int]$verificationProcess.ExitCode
                        if (Test-Path -LiteralPath $errorPath) {
                            Add-Content -LiteralPath $logPath -Value "`r`n--- stderr ---"
                            Get-Content -LiteralPath $errorPath | Add-Content -LiteralPath $logPath
                            Remove-Item -LiteralPath $errorPath -Force
                        }
                        $summaryFound = Test-Path -LiteralPath $summaryPath
                        $summaryParsed = $false
                        $summary = $null
                        $summaryReadError = $null
                        if ($summaryFound) {
                            try {
                                $summary = Read-JsonStable $summaryPath
                                $summaryParsed = $true
                            }
                            catch {
                                $summaryReadError = $_.Exception.Message
                            }
                        }
                        $outcome = Resolve-VerificationOutcome -VerifierSummaryPath $summaryPath -VerifierSummaryFound $summaryFound -VerifierSummaryParsed $summaryParsed -VerifierSummary $summary -ExpectedRequestId $request.requestId -VerificationExitCode $verificationProcessExitCode -WorkerInternalError $summaryReadError
                        $state = Get-GitState $RepositoryRoot
                        $primaryError = if ($outcome.finalStatus -eq "PASS") { $null } elseif ($null -ne $summary) { Get-OptionalPropertyValue $summary "primaryError" } else { $outcome.mappingReason }
                        if ([string]::IsNullOrWhiteSpace($primaryError)) { $primaryError = $outcome.mappingReason }
                        $result = New-Result -Request $request -Status $outcome.finalStatus -ExitCode $outcome.finalExitCode -VerificationExitCode $outcome.verificationExitCode -State $state -Steps $(if ($null -ne $summary) { @(Get-OptionalPropertyValue $summary "steps") } else { @() }) -ApiSmoke $(if ($null -ne $summary) { @(Get-OptionalPropertyValue $summary "apiSmoke") } else { @() }) -MarkerResidue $(if ($null -ne $summary) { Get-OptionalPropertyValue $summary "markerResidue" } else { $null }) -LogPath (".local-runtime/sql-verify/logs/$($request.requestId).log") -PrimaryError $primaryError -StartedAt $startedAt -Outcome $outcome
                        Write-AtomicJson $resultPath $result
                        if (Test-Path -LiteralPath $verificationPidPath) { Remove-Item -LiteralPath $verificationPidPath -Force }
                        $activeRequestId = $null
                        Write-WorkerState -LastCompletedRequestId $request.requestId -LastError $primaryError
                    }
                }
            }
            catch {
                if (Test-Path -LiteralPath $verificationPidPath) { Remove-Item -LiteralPath $verificationPidPath -Force }
                $activeRequestId = $null
                $state = try { Get-GitState $RepositoryRoot } catch { [pscustomobject]@{ branch = $null; head = $null } }
                $fallbackRequest = if ($null -ne $request) { $request } else { [pscustomobject]@{ requestId = "unknown" } }
                Write-AtomicJson $resultPath (New-Result -Request $fallbackRequest -Status "FAIL" -ExitCode (Get-FinalExitCode "FAIL") -State $state -PrimaryError $_.Exception.Message)
                Write-WorkerState -LastCompletedRequestId $fallbackRequest.requestId -LastError $_.Exception.Message
            }
        }
        Write-WorkerState -LastCompletedRequestId $lastRequestId
        Start-Sleep -Seconds $PollSeconds
    }
}
finally {
    if (Test-Path -LiteralPath $verificationPidPath) { Remove-Item -LiteralPath $verificationPidPath -Force }
    if (Test-Path -LiteralPath $pidPath) {
        $savedPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
        if ($savedPid -eq "$PID") { Remove-Item -LiteralPath $pidPath -Force }
    }
}
