[CmdletBinding()]
param(
    [string]$RepositoryRoot,
    [string]$SummaryPath,
    [string]$RequestId,
    [string[]]$RequestedChecks = @("sql-tcp-tls", "pre-residue", "runner-api-smoke", "sql-integration-tests", "post-residue"),
    [switch]$ValidateOnly,
    [switch]$SimulateFailure
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

function Add-Step {
    param([string]$Name, [string]$Status, [string]$Detail)
    [void]$script:Steps.Add([pscustomobject][ordered]@{
            name = $Name
            status = $Status
            detail = $Detail
        })
    Write-Host "[$Name] $Status - $Detail"
}

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)
    try {
        $detail = & $Action
        Add-Step $Name "PASS" ([string]$detail)
        return $true
    }
    catch {
        Add-Step $Name "FAIL" $_.Exception.Message
        return $false
    }
}

function Test-LocalPortFree {
    param([int]$Port)
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    return $null -eq $listener
}

function Wait-HttpOk {
    param([string]$Url, [int]$TimeoutSeconds = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return $response }
        }
        catch { }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for HTTP 200: $Url"
}

function Get-DescendantProcessIds {
    param([int]$RootProcessId)
    $all = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    $pending = New-Object System.Collections.Queue
    $result = New-Object System.Collections.Generic.List[int]
    $pending.Enqueue($RootProcessId)

    while ($pending.Count -gt 0) {
        $parent = [int]$pending.Dequeue()
        foreach ($child in @($all | Where-Object { [int]$_.ParentProcessId -eq $parent })) {
            $childId = [int]$child.ProcessId
            [void]$result.Add($childId)
            $pending.Enqueue($childId)
        }
    }

    return @($result)
}

function Stop-ManagedRunner {
    param([System.Diagnostics.Process]$Process)
    if ($null -eq $Process) { return }

    $ids = @(Get-DescendantProcessIds -RootProcessId $Process.Id)
    [array]::Reverse($ids)
    foreach ($id in $ids) {
        Stop-Process -Id $id -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $Process.Id -ErrorAction SilentlyContinue

    $deadline = (Get-Date).AddSeconds(20)
    do {
        if ((Test-LocalPortFree 5173) -and (Test-LocalPortFree 5080)) { return }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    throw "Runner cleanup did not release 5173 and 5080."
}

function Invoke-SqlQuery {
    param([string]$Query)
    $output = & $script:SqlCmd.Source -S "tcp:localhost,1433" -d "G2ERP_DEV_LOCAL_TEST" -E -N -C -b -W -h -1 -Q $Query 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "sqlcmd exited with code ${LASTEXITCODE}: $($output -join [Environment]::NewLine)"
    }
    return @($output | ForEach-Object { "$_.ToString()" })
}

function Get-MarkerResidue {
    $definitions = @(
        [pscustomobject]@{ table = "POC.SAL_SOL"; marker = "SO-R-% or SO-S-%"; where = "CD_FIRM = '1000' AND (NO_SO LIKE 'SO-R-%' OR NO_SO LIKE 'SO-S-%')" },
        [pscustomobject]@{ table = "POC.SAL_SOH"; marker = "SO-R-% or SO-S-%"; where = "CD_FIRM = '1000' AND (NO_SO LIKE 'SO-R-%' OR NO_SO LIKE 'SO-S-%')" },
        [pscustomobject]@{ table = "POC.PUR_POL"; marker = "PO-R-% or PO-S-%"; where = "CD_FIRM = '1000' AND (NO_PO LIKE 'PO-R-%' OR NO_PO LIKE 'PO-S-%')" },
        [pscustomobject]@{ table = "POC.PUR_POH"; marker = "PO-R-% or PO-S-%"; where = "CD_FIRM = '1000' AND (NO_PO LIKE 'PO-R-%' OR NO_PO LIKE 'PO-S-%')" },
        [pscustomobject]@{ table = "POC.PRT_WOPROC"; marker = "E2E-WO-%"; where = "CD_FIRM = '1000' AND NO_WO LIKE 'E2E-WO-%'" },
        [pscustomobject]@{ table = "POC.PRT_WO"; marker = "E2E-WO-%"; where = "CD_FIRM = '1000' AND NO_WO LIKE 'E2E-WO-%'" },
        [pscustomobject]@{ table = "POC.MST_EQUIPMENT"; marker = "E2E-WO-EQUIP-%"; where = "CD_FIRM = '1000' AND CD_EQUIP LIKE 'E2E-WO-EQUIP-%'" },
        [pscustomobject]@{ table = "POC.MST_PROCESS"; marker = "E2E-WO-PROC1-% or E2E-WO-PROC2-%"; where = "CD_FIRM = '1000' AND (CD_PROC LIKE 'E2E-WO-PROC1-%' OR CD_PROC LIKE 'E2E-WO-PROC2-%')" },
        [pscustomobject]@{ table = "POC.MST_PRODUCTION_LINE"; marker = "E2E-WO-LINE-%"; where = "CD_FIRM = '1000' AND CD_LINE LIKE 'E2E-WO-LINE-%'" }
    )
    $results = New-Object System.Collections.ArrayList
    foreach ($definition in $definitions) {
        $output = Invoke-SqlQuery "SET NOCOUNT ON; SELECT CONCAT('ResidueCount=', COUNT_BIG(*)) FROM $($definition.table) WHERE $($definition.where);"
        $match = [regex]::Match(($output -join "`n"), "ResidueCount=(\d+)")
        if (-not $match.Success) { throw "Could not parse residue count for $($definition.table)." }
        [void]$results.Add([pscustomobject][ordered]@{
                table = $definition.table
                marker = $definition.marker
                count = [int64]$match.Groups[1].Value
            })
    }
    return @($results)
}

function Assert-NoMarkerResidue {
    param([string]$Phase)
    $results = @(Get-MarkerResidue)
    $script:MarkerResidue[$Phase] = @($results)
    $remaining = @($results | Where-Object { $_.count -ne 0 })
    if ($remaining.Count -gt 0) {
        throw "$Phase marker residue found: $(($remaining | ForEach-Object { "$($_.table)=$($_.count)" }) -join ', ')"
    }
    return "$($results.Count) marker scopes are empty."
}

function Join-ApiUrl {
    param([string]$BaseUrl, [string]$EndpointPath)
    $base = $BaseUrl.TrimEnd('/')
    $path = if ($EndpointPath.StartsWith('/')) { $EndpointPath } else { "/$EndpointPath" }
    return "$base$path"
}

function Get-ResponseBodyPrefix {
    param([System.Net.WebResponse]$Response)
    if ($null -eq $Response) { return $null }
    $reader = $null
    try {
        $reader = New-Object System.IO.StreamReader($Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        return $body.Substring(0, [Math]::Min(500, $body.Length))
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
    }
}

function Invoke-ApiSmokeGet {
    param([string]$Name, [string]$EndpointPath)

    $url = Join-ApiUrl -BaseUrl $script:ApiBaseUrl -EndpointPath $EndpointPath
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Get -TimeoutSec 15 -ErrorAction Stop
    }
    catch {
        $webResponse = if ($_.Exception -is [System.Net.WebException]) { $_.Exception.Response } else { $null }
        $httpStatus = if ($null -ne $webResponse -and $webResponse -is [System.Net.HttpWebResponse]) { [int]$webResponse.StatusCode } else { $null }
        $contentType = if ($null -ne $webResponse) { $webResponse.ContentType } else { $null }
        $bodyPrefix = Get-ResponseBodyPrefix $webResponse
        $httpDetail = if ($null -ne $httpStatus) { "HTTP $httpStatus" } else { $_.Exception.GetType().Name }
        return [pscustomobject][ordered]@{
            name = $Name
            method = "GET"
            url = $url
            status = "FAIL"
            transportStatus = "FAIL"
            httpStatus = $httpStatus
            contentType = $contentType
            itemCount = $null
            parseStatus = "NOT_ATTEMPTED"
            processingStatus = "NOT_ATTEMPTED"
            error = "GET $url -> ${httpDetail}: $($_.Exception.Message)"
            responseBodyPrefix = $bodyPrefix
            body = $null
        }
    }

    try {
        $body = $response.Content | ConvertFrom-Json
    }
    catch {
        return [pscustomobject][ordered]@{
            name = $Name
            method = "GET"
            url = $url
            status = "FAIL"
            transportStatus = "PASS"
            httpStatus = [int]$response.StatusCode
            contentType = $response.Headers["Content-Type"]
            itemCount = $null
            parseStatus = "FAIL"
            processingStatus = "NOT_ATTEMPTED"
            error = "GET $url -> HTTP $($response.StatusCode); JSON parse failed: $($_.Exception.Message)"
            responseBodyPrefix = $response.Content.Substring(0, [Math]::Min(500, $response.Content.Length))
            body = $null
        }
    }

    try {
        $itemCount = Get-SafeResponseItemCount $body
        return [pscustomobject][ordered]@{
            name = $Name
            method = "GET"
            url = $url
            status = "PASS"
            transportStatus = "PASS"
            httpStatus = [int]$response.StatusCode
            contentType = $response.Headers["Content-Type"]
            itemCount = $itemCount
            parseStatus = "PASS"
            processingStatus = "PASS"
            error = $null
            responseBodyPrefix = $null
            body = $body
        }
    }
    catch {
        return [pscustomobject][ordered]@{
            name = $Name
            method = "GET"
            url = $url
            status = "FAIL"
            transportStatus = "PASS"
            httpStatus = [int]$response.StatusCode
            contentType = $response.Headers["Content-Type"]
            itemCount = $null
            parseStatus = "PASS"
            processingStatus = "FAIL"
            error = "GET $url -> HTTP $($response.StatusCode); response processing failed: $($_.Exception.Message)"
            responseBodyPrefix = $null
            body = $body
        }
    }
}

function Get-SafeResponseItemCount {
    param([object]$Body)
    if ($null -eq $Body) { return $null }
    if ($Body -is [System.Array]) { return @($Body).Count }
    $itemsProperty = $Body.PSObject.Properties["items"]
    if ($null -eq $itemsProperty) { return $null }
    if ($null -eq $itemsProperty.Value) { return 0 }
    if ($itemsProperty.Value -is [System.Array]) { return @($itemsProperty.Value).Count }
    return $null
}

function Get-VerificationProcessExitCode {
    param([string]$Status)
    if ($Status -eq "PASS") { return 0 }
    return 1
}

if ($ValidateOnly) {
    foreach ($baseUrl in @("http://127.0.0.1:5080", "http://127.0.0.1:5080/")) {
        foreach ($endpointPath in @("api/sales-orders", "/api/sales-orders")) {
            $actualUrl = Join-ApiUrl -BaseUrl $baseUrl -EndpointPath $endpointPath
            if ($actualUrl -ne "http://127.0.0.1:5080/api/sales-orders") { throw "URL assembly failed: $baseUrl + $endpointPath -> $actualUrl" }
        }
    }
    $statusDto = [pscustomobject]@{ RepositoryMode = "SqlServer"; Database = "G2ERP_DEV_LOCAL_TEST" }
    $wrapper = [pscustomobject]@{ items = @([pscustomobject]@{ id = 1 }, [pscustomobject]@{ id = 2 }) }
    foreach ($case in @(
            [pscustomobject]@{ name = "status DTO"; value = $statusDto; expected = $null },
            [pscustomobject]@{ name = "empty array"; value = @(); expected = 0 },
            [pscustomobject]@{ name = "two-item array"; value = @(1, 2); expected = 2 },
            [pscustomobject]@{ name = "items wrapper"; value = $wrapper; expected = 2 },
            [pscustomobject]@{ name = "ordinary object"; value = [pscustomobject]@{ value = "x" }; expected = $null }
        )) {
        if ((Get-SafeResponseItemCount $case.value) -ne $case.expected) { throw "Item count validation failed: $($case.name)" }
    }
    Write-Host "LOCAL SQL VERIFY URL VALIDATION: PASS"
    return
}

if ($SimulateFailure) {
    Write-Host "LOCAL SQL VERIFY: FAIL"
    exit (Get-VerificationProcessExitCode "FAIL")
}

if ([string]::IsNullOrWhiteSpace($SummaryPath)) {
    $SummaryPath = Join-Path $RepositoryRoot ".local-runtime\sql-verify\manual-summary.json"
}
elseif (-not [System.IO.Path]::IsPathRooted($SummaryPath)) {
    $SummaryPath = Join-Path $RepositoryRoot $SummaryPath
}

$Steps = New-Object System.Collections.ArrayList
$MarkerResidue = [ordered]@{}
$SqlCmd = $null
$runner = $null
$canRunTests = $false
$verificationStartedAt = (Get-Date).ToUniversalTime().ToString("o")
$ApiBaseUrl = "http://127.0.0.1:5080"
$ApiSmokeResults = New-Object System.Collections.ArrayList

try {
    $prerequisitesOk = Invoke-Step "1/6 Prerequisites" {
        if ($env:OS -ne "Windows_NT") { throw "This verification must run in a Windows user session." }
        if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot ".git"))) { throw "Repository root does not contain .git." }
        foreach ($command in @("dotnet", "node", "pnpm", "sqlcmd")) {
            if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command is unavailable: $command" }
        }
        if (-not (Test-LocalPortFree 5173) -or -not (Test-LocalPortFree 5080)) { throw "Ports 5173 and 5080 must be free before verification." }
        $script:SqlCmd = Get-Command sqlcmd -ErrorAction Stop
        "Windows session, repository, commands, and ports are ready."
    }

    if ($prerequisitesOk) {
        $encryptedOk = Invoke-Step "2/6 Encrypted SQL connection" {
            $output = Invoke-SqlQuery "SELECT CONCAT('ProbeResult=', 1), CONCAT('DatabaseName=', DB_NAME()), CONCAT('net_transport=', net_transport), CONCAT('encrypt_option=', encrypt_option), CONCAT('local_tcp_port=', local_tcp_port) FROM sys.dm_exec_connections WHERE session_id = @@SPID;"
            $text = $output -join "`n"
            foreach ($expected in @("ProbeResult=1", "DatabaseName=G2ERP_DEV_LOCAL_TEST", "net_transport=TCP", "encrypt_option=TRUE", "local_tcp_port=1433")) {
                if ($text -notmatch [regex]::Escape($expected)) { throw "Encrypted SQL probe did not confirm $expected." }
            }
            "tcp:localhost,1433 encrypted SQL connection verified."
        }

        if ($encryptedOk) {
            $preResidueOk = Invoke-Step "3/6 Pre-test residue" { Assert-NoMarkerResidue "preTest" }
            $canRunTests = $preResidueOk
        }
    }

    if ($canRunTests) {
        $runnerOk = Invoke-Step "4/6 Runner and API smoke" {
            $runtimeDirectory = Join-Path $RepositoryRoot ".local-runtime\sql-verify"
            New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
            $runnerLog = Join-Path $runtimeDirectory "runner-$([Guid]::NewGuid().ToString('N')).log"
            $runnerErrorLog = "$runnerLog.err"
            try {
                $runner = Start-Process -FilePath (Get-Command node).Source -ArgumentList "scripts/run-mode.mjs dev sqlserver" -WorkingDirectory $RepositoryRoot -RedirectStandardOutput $runnerLog -RedirectStandardError $runnerErrorLog -PassThru -WindowStyle Hidden
                $readinessUrl = Join-ApiUrl -BaseUrl $ApiBaseUrl -EndpointPath "/api/development-data/status"
                Wait-HttpOk $readinessUrl | Out-Null
                [void]$script:ApiSmokeResults.Add([pscustomobject][ordered]@{ name = "readiness"; method = "GET"; url = $readinessUrl; status = "PASS"; httpStatus = 200; itemCount = $null; error = $null })
                Wait-HttpOk "http://127.0.0.1:5173" | Out-Null
                foreach ($endpoint in @(
                        [pscustomobject]@{ name = "developmentStatus"; path = "/api/development-data/status" },
                        [pscustomobject]@{ name = "salesOrders"; path = "/api/sales-orders" },
                        [pscustomobject]@{ name = "purchaseOrders"; path = "/api/purchase-orders" },
                        [pscustomobject]@{ name = "workOrders"; path = "/api/work-orders" }
                    )) {
                    $endpointResult = Invoke-ApiSmokeGet -Name $endpoint.name -EndpointPath $endpoint.path
                    [void]$script:ApiSmokeResults.Add($endpointResult)
                    Add-Step "4/6 API: $($endpoint.name)" $endpointResult.status ("$($endpointResult.method) $($endpointResult.url) -> $($endpointResult.httpStatus)")
                    if ($endpointResult.status -ne "PASS") { throw $endpointResult.error }
                    if ($endpoint.name -eq "developmentStatus") {
                        foreach ($expected in @(@("RepositoryMode", "SqlServer"), @("Database", "G2ERP_DEV_LOCAL_TEST"), @("IsAllowed", $true), @("SafetyStatus", "Allowed"))) {
                            if ($endpointResult.body.($expected[0]) -ne $expected[1]) { throw "GET $($endpointResult.url) returned unexpected $($expected[0])." }
                        }
                    }
                }
                return "All API smoke endpoints returned HTTP 200."
            }
            finally {
                if ($null -ne $runner) {
                    Stop-ManagedRunner $runner
                    $runner = $null
                }
            }
        }

        if ($runnerOk) {
            $writeTestsPassed = $true
            foreach ($testClass in @("SqlServerPurchaseOrdersIntegrationTests", "SqlServerSalesOrdersIntegrationTests", "SqlServerWorkOrdersIntegrationTests")) {
                $passed = Invoke-Step "5/6 SQL test: $testClass" {
                    $output = & dotnet test "server/G2Erp.Api.Tests/G2Erp.Api.Tests.csproj" --no-restore --filter "FullyQualifiedName~$testClass" --logger "console;verbosity=minimal" 2>&1
                    if ($LASTEXITCODE -ne 0) { throw "dotnet test exited with code ${LASTEXITCODE}: $($output -join [Environment]::NewLine)" }
                    "$testClass passed."
                }
                if (-not $passed) {
                    $writeTestsPassed = $false
                    Add-Step "5/6 SQL tests" "SKIPPED" "Stopped after a write-test failure; post-test residue check will still run."
                    break
                }
            }
            if ($writeTestsPassed) {
                [void](Invoke-Step "5/6 SQL test: SqlServerConnectionFactoryTests" {
                        $output = & dotnet test "server/G2Erp.Api.Tests/G2Erp.Api.Tests.csproj" --no-restore --filter "FullyQualifiedName~SqlServerConnectionFactoryTests" --logger "console;verbosity=minimal" 2>&1
                        if ($LASTEXITCODE -ne 0) { throw "dotnet test exited with code ${LASTEXITCODE}: $($output -join [Environment]::NewLine)" }
                        "SqlServerConnectionFactoryTests passed."
                    })
            }
        }
    }
}
catch {
    Add-Step "Verification" "FAIL" $_.Exception.Message
}
finally {
    if ($null -ne $runner) {
        try { Stop-ManagedRunner $runner } catch { Add-Step "Runner cleanup" "FAIL" $_.Exception.Message }
    }
    if ($null -ne $SqlCmd) {
        [void](Invoke-Step "6/6 Post-test residue" { Assert-NoMarkerResidue "postTest" })
    }
    else {
        Add-Step "6/6 Post-test residue" "SKIPPED" "sqlcmd prerequisite was unavailable."
    }

    $failed = @($Steps | Where-Object { $_.status -eq "FAIL" })
    $status = if ($failed.Count -eq 0) { "PASS" } else { "FAIL" }
    $summary = [ordered]@{
        requestId = $RequestId
        startedAt = $verificationStartedAt
        finishedAt = (Get-Date).ToUniversalTime().ToString("o")
        status = $status
        exitCode = if ($status -eq "PASS") { 0 } else { 1 }
        requestedChecks = @($RequestedChecks)
        steps = @($Steps)
        apiSmoke = @($ApiSmokeResults | ForEach-Object {
                $_ | Select-Object name, method, url, status, transportStatus, httpStatus, contentType, itemCount, parseStatus, processingStatus, error, responseBodyPrefix
            })
        markerResidue = $MarkerResidue
        primaryError = if ($failed.Count -gt 0) { $failed[0].detail } else { $null }
    }
    $verificationExitCode = Get-VerificationProcessExitCode $status
    Write-AtomicJson -Path $SummaryPath -Value $summary
    Write-Host "LOCAL SQL VERIFY: $status"
    exit $verificationExitCode
}
