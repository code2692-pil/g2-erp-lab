#requires -Version 5.1
<##
Runs only when a developer explicitly invokes this file from the repository root.
It never changes SQL Server configuration, authentication mode, or databases other
than the local G2ERP_DEV_LOCAL_TEST PoC database.
##>

[CmdletBinding()]
param(
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:TargetServer = 'localhost'
$script:TargetDatabase = 'G2ERP_DEV_LOCAL_TEST'
$script:FinalVerdict = 'Environment error'
$script:Steps = New-Object System.Collections.Generic.List[object]
$script:SqlTool = $null
$script:SqlCmdPath = $null
$script:OptionalRoutingTableCount = 0
$script:OptionalBomTableCount = 0
$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:LocalConnectionString = "Server=$($script:TargetServer);Database=$($script:TargetDatabase);Integrated Security=True;Encrypt=True;TrustServerCertificate=True"

$schemaFile = Join-Path $script:ProjectRoot 'database\local\007_create_work_order_tables.sql'
$seedFile = Join-Path $script:ProjectRoot 'database\local\008_seed_work_order_test_data.sql'
$productionMasterSampleFile = Join-Path $script:ProjectRoot 'database\local\010_seed_production_master_sample_data.sql'
$workOrderSampleFile = Join-Path $script:ProjectRoot 'database\local\011_seed_work_order_sample_data.sql'
$sampleRelationshipValidationFile = Join-Path $script:ProjectRoot 'database\local\012_verify_production_sample_relationships.sql'
$cleanupFile = Join-Path $script:ProjectRoot 'database\local\009_cleanup_work_order_e2e.sql'
$workOrderUiSpec = Join-Path $script:ProjectRoot 'tests\e2e\work-order-api-mode.spec.ts'
$salesPurchaseUiSpec = Join-Path $script:ProjectRoot 'tests\e2e\api-mode.spec.ts'

function Write-RunnerMessage {
    param([string]$Message)
    Write-Host "[WorkOrder SQL Runner] $Message"
}

function Stop-Runner {
    param([string]$Verdict, [string]$Message)
    $script:FinalVerdict = $Verdict
    throw $Message
}

function Invoke-Step {
    param([string]$Name, [scriptblock]$Action)

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    Write-RunnerMessage "START  $Name"
    try {
        & $Action
        $stopwatch.Stop()
        $script:Steps.Add([pscustomobject]@{ Step = $Name; Result = 'PASS'; Duration = $stopwatch.Elapsed; Detail = '' })
        Write-RunnerMessage "PASS   $Name ($($stopwatch.Elapsed))"
    }
    catch {
        $stopwatch.Stop()
        $script:Steps.Add([pscustomobject]@{ Step = $Name; Result = 'FAIL'; Duration = $stopwatch.Elapsed; Detail = $_.Exception.Message })
        Write-RunnerMessage "FAIL   $Name ($($stopwatch.Elapsed))"
        throw
    }
}

function Invoke-ExternalCommand {
    param([string]$Command, [string[]]$Arguments, [string]$Label)

    Write-RunnerMessage "COMMAND ${Label}: $Command $($Arguments -join ' ')"
    & $Command @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "$Label failed with exit code $exitCode."
    }
}

function Assert-ProjectRoot {
    $currentPath = (Get-Location).Path.TrimEnd('\')
    $expectedPath = $script:ProjectRoot.TrimEnd('\')
    if (-not [string]::Equals($currentPath, $expectedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        Stop-Runner 'Environment error' "Run this command from the project root: $expectedPath"
    }
    if (-not (Test-Path (Join-Path $script:ProjectRoot '.git'))) {
        Stop-Runner 'Environment error' 'The resolved project root does not contain .git.'
    }
}

function Select-SqlExecutionTool {
    $sqlcmd = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue
    if ($null -eq $sqlcmd) {
        $sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
    }
    if ($null -ne $sqlcmd) {
        $script:SqlTool = 'sqlcmd'
        $script:SqlCmdPath = $sqlcmd.Source
        return
    }

    if ($null -ne (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue)) {
        $script:SqlTool = 'Invoke-Sqlcmd'
        return
    }

    $sqlClientAssembly = Get-ChildItem -Path (Join-Path $script:ProjectRoot 'server') -Filter 'Microsoft.Data.SqlClient.dll' -Recurse -File -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $sqlClientAssembly) {
        Add-Type -Path $sqlClientAssembly.FullName
        $script:SqlTool = 'Microsoft.Data.SqlClient'
        return
    }

    Stop-Runner 'Environment error' 'Neither sqlcmd, Invoke-Sqlcmd, nor the project Microsoft.Data.SqlClient assembly is available. Install a SQL client tool or build the solution first; this runner will not install software.'
}

function Invoke-SqlcmdSafe {
    param([string]$Query)

    $arguments = @(
        '-S', $script:TargetServer,
        '-d', $script:TargetDatabase,
        '-E', '-N', '-C', '-b', '-r1', '-h', '-1', '-W',
        '-Q', $Query
    )
    $raw = @(& $script:SqlCmdPath @arguments 2>&1)
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "sqlcmd read-only query failed with exit code $exitCode."
    }

    return @($raw | ForEach-Object { $_.ToString() })
}

function Get-PrefixedSqlValue {
    [OutputType([string])]
    param(
        [AllowEmptyCollection()]
        [string[]]$Lines,
        [Parameter(Mandatory)]
        [string]$Prefix
    )

    $values = New-Object System.Collections.Generic.List[string]
    foreach ($line in @($Lines)) {
        if ($null -eq $line) {
            continue
        }

        $trimmedLine = $line.Trim()
        if ($trimmedLine.StartsWith($Prefix, [System.StringComparison]::Ordinal)) {
            $values.Add($trimmedLine.Substring($Prefix.Length).Trim())
        }
    }

    if ($values.Count -eq 0) {
        throw "SQL output did not contain the required prefix '$Prefix'."
    }
    if ($values.Count -gt 1) {
        throw "SQL output contained the prefix '$Prefix' more than once."
    }
    if ([string]::IsNullOrWhiteSpace($values[0])) {
        throw "SQL output value for prefix '$Prefix' is empty."
    }

    return $values[0]
}

function Assert-AllowedDatabase {
    [OutputType([string])]
    param([string]$DatabaseName)

    $normalizedDatabaseName = $DatabaseName.Trim()
    if ([string]::IsNullOrWhiteSpace($normalizedDatabaseName)) {
        throw 'Connected database value is empty.'
    }
    if (-not [string]::Equals($normalizedDatabaseName, $script:TargetDatabase, [System.StringComparison]::Ordinal)) {
        throw "Connected database '$normalizedDatabaseName' is not the allowed test database."
    }

    return $normalizedDatabaseName
}

function Assert-SelfTestFailure {
    param([string]$Name, [scriptblock]$Action)

    try {
        & $Action
    }
    catch {
        return
    }

    throw "Self-test '$Name' was expected to fail."
}

function Invoke-SqlOutputParserSelfTest {
    $prefix = '__DB_NAME__='
    $expectedDatabase = $script:TargetDatabase

    $koreanRowCountOutput = @(
        "${prefix}${expectedDatabase}",
        '(1개 행이 영향을 받았습니다)'
    )
    $englishRowCountOutput = @(
        "${prefix}${expectedDatabase}",
        '(1 rows affected)'
    )
    $headerOutput = @(
        'DB',
        '--------------------',
        "${prefix}${expectedDatabase}",
        ''
    )

    foreach ($case in @($koreanRowCountOutput, $englishRowCountOutput, $headerOutput)) {
        $actual = Get-PrefixedSqlValue -Lines $case -Prefix $prefix
        if ($actual -ne $expectedDatabase) {
            throw "Self-test returned '$actual' instead of '$expectedDatabase'."
        }
    }

    Assert-SelfTestFailure -Name 'missing prefix' -Action {
        Get-PrefixedSqlValue -Lines @('(1 rows affected)') -Prefix $prefix
    }
    Assert-SelfTestFailure -Name 'duplicate prefix' -Action {
        Get-PrefixedSqlValue -Lines @("${prefix}${expectedDatabase}", "${prefix}${expectedDatabase}") -Prefix $prefix
    }
    Assert-SelfTestFailure -Name 'empty value' -Action {
        Get-PrefixedSqlValue -Lines @($prefix) -Prefix $prefix
    }
    Assert-SelfTestFailure -Name 'unallowed database' -Action {
        Assert-AllowedDatabase -DatabaseName 'master'
    }
}

function Invoke-ScalarSql {
    param([string]$Query)

    $scalarQuery = "SET NOCOUNT ON;`n$Query`n"
    if ($script:SqlTool -eq 'sqlcmd') {
        $lines = @(Invoke-SqlcmdSafe -Query $scalarQuery | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        if ($lines.Count -eq 0) { return '' }
        return $lines[$lines.Count - 1]
    }

    if ($script:SqlTool -eq 'Invoke-Sqlcmd') {
        $parameters = @{ ServerInstance = $script:TargetServer; Database = $script:TargetDatabase; Query = $scalarQuery; ErrorAction = 'Stop' }
        $command = Get-Command Invoke-Sqlcmd
        if ($command.Parameters.ContainsKey('TrustServerCertificate')) {
            $parameters.TrustServerCertificate = $true
        }
        $row = @(Invoke-Sqlcmd @parameters | Select-Object -First 1)
        if ($row.Count -eq 0) { return '' }
        return [string]$row[0].VALUE
    }

    $connection = [Microsoft.Data.SqlClient.SqlConnection]::new($script:LocalConnectionString)
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        try {
            $command.CommandText = $scalarQuery
            $value = $command.ExecuteScalar()
            return [string]$value
        }
        finally {
            $command.Dispose()
        }
    }
    finally {
        $connection.Dispose()
    }
}

function Invoke-PrefixedScalarSql {
    [OutputType([string])]
    param(
        [string]$Query,
        [string]$Prefix
    )

    if ($script:SqlTool -eq 'sqlcmd') {
        return Get-PrefixedSqlValue -Lines (Invoke-SqlcmdSafe -Query $Query) -Prefix $Prefix
    }

    return Get-PrefixedSqlValue -Lines @(Invoke-ScalarSql -Query $Query) -Prefix $Prefix
}

function Invoke-SqlFile {
    param([string]$Path)

    if (-not (Test-Path $Path -PathType Leaf)) {
        Stop-Runner 'Environment error' "Required SQL file is missing: $Path"
    }
    Write-RunnerMessage "SQL FILE $Path"

    if ($script:SqlTool -eq 'sqlcmd') {
        & $script:SqlCmdPath -S $script:TargetServer -d $script:TargetDatabase -E -N -C -b -i $Path
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) { throw "sqlcmd script execution failed with exit code $exitCode." }
        return
    }

    if ($script:SqlTool -eq 'Invoke-Sqlcmd') {
        $parameters = @{ ServerInstance = $script:TargetServer; Database = $script:TargetDatabase; InputFile = $Path; ErrorAction = 'Stop' }
        $command = Get-Command Invoke-Sqlcmd
        if ($command.Parameters.ContainsKey('TrustServerCertificate')) {
            $parameters.TrustServerCertificate = $true
        }
        Invoke-Sqlcmd @parameters | Out-Host
        return
    }

    $connection = [Microsoft.Data.SqlClient.SqlConnection]::new($script:LocalConnectionString)
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        try {
            $command.CommandText = [System.IO.File]::ReadAllText($Path)
            [void]$command.ExecuteNonQuery()
        }
        finally {
            $command.Dispose()
        }
    }
    finally {
        $connection.Dispose()
    }
}

function Get-Count {
    param([string]$Query)
    return [int](Invoke-ScalarSql $Query)
}

function Assert-WorkOrderObjectSafety {
    $collisionQuery = @"
SELECT CAST(CASE WHEN EXISTS (
    SELECT 1 FROM sys.views AS v INNER JOIN sys.schemas AS s ON s.schema_id=v.schema_id
    WHERE s.name=N'POC' AND v.name IN (N'PRT_WO',N'PRT_WOPROC',N'MST_PRODUCTION_LINE',N'MST_PROCESS',N'MST_EQUIPMENT')
) OR EXISTS (
    SELECT 1 FROM sys.synonyms AS sy INNER JOIN sys.schemas AS s ON s.schema_id=sy.schema_id
    WHERE s.name=N'POC' AND sy.name IN (N'PRT_WO',N'PRT_WOPROC',N'MST_PRODUCTION_LINE',N'MST_PROCESS',N'MST_EQUIPMENT')
) THEN 1 ELSE 0 END AS nvarchar(1)) AS VALUE;
"@
    if ((Invoke-ScalarSql $collisionQuery) -ne '0') {
        Stop-Runner 'Schema conflict' 'A view or synonym collides with a planned work-order PoC object. No schema script was applied.'
    }

    $headerExists = Get-Count "SELECT CAST(CASE WHEN OBJECT_ID(N'POC.PRT_WO', N'U') IS NULL THEN 0 ELSE 1 END AS nvarchar(10)) AS VALUE;"
    $lineExists = Get-Count "SELECT CAST(CASE WHEN OBJECT_ID(N'POC.PRT_WOPROC', N'U') IS NULL THEN 0 ELSE 1 END AS nvarchar(10)) AS VALUE;"
    $lineMasterExists = Get-Count "SELECT CAST(CASE WHEN OBJECT_ID(N'POC.MST_PRODUCTION_LINE', N'U') IS NULL THEN 0 ELSE 1 END AS nvarchar(10)) AS VALUE;"
    $processMasterExists = Get-Count "SELECT CAST(CASE WHEN OBJECT_ID(N'POC.MST_PROCESS', N'U') IS NULL THEN 0 ELSE 1 END AS nvarchar(10)) AS VALUE;"
    $equipmentMasterExists = Get-Count "SELECT CAST(CASE WHEN OBJECT_ID(N'POC.MST_EQUIPMENT', N'U') IS NULL THEN 0 ELSE 1 END AS nvarchar(10)) AS VALUE;"
    Write-RunnerMessage "Existing planned objects: PRT_WO=$headerExists, PRT_WOPROC=$lineExists, MST_PRODUCTION_LINE=$lineMasterExists, MST_PROCESS=$processMasterExists, MST_EQUIPMENT=$equipmentMasterExists"

    if ($headerExists -ne $lineExists) {
        Stop-Runner 'Schema conflict' 'Only one of POC.PRT_WO and POC.PRT_WOPROC exists. No schema script was applied.'
    }
    if ($headerExists -eq 0) { return }

    $compatibilityQuery = @"
DECLARE @expectedWo TABLE (ColumnName sysname, TypeName sysname, MaxLength smallint NULL, PrecisionValue tinyint NULL, ScaleValue tinyint NULL, NullableValue bit);
INSERT INTO @expectedWo VALUES
(N'CD_FIRM',N'nvarchar',20,NULL,NULL,0),(N'NO_WO',N'nvarchar',60,NULL,NULL,0),(N'DT_WO',N'date',NULL,NULL,NULL,0),
(N'CD_ITEM',N'nvarchar',60,NULL,NULL,0),(N'NM_ITEM',N'nvarchar',200,NULL,NULL,0),(N'STND_ITEM',N'nvarchar',200,NULL,NULL,1),
(N'UNIT_ITEM',N'nvarchar',40,NULL,NULL,1),(N'QT_WO',N'decimal',NULL,18,4,0),(N'QT_RESULT',N'decimal',NULL,18,4,0),
(N'DT_PLAN_START',N'date',NULL,NULL,NULL,0),(N'DT_PLAN_END',N'date',NULL,NULL,NULL,0),(N'CD_LINE',N'nvarchar',60,NULL,NULL,0),
(N'NM_LINE',N'nvarchar',200,NULL,NULL,0),(N'ST_WO',N'nvarchar',40,NULL,NULL,0),(N'YN_URGENT',N'char',1,NULL,NULL,0),
(N'DC_RMK',N'nvarchar',1000,NULL,NULL,1),(N'CD_USER_REG',N'nvarchar',100,NULL,NULL,0),(N'TM_REG',N'datetime2',NULL,NULL,3,0),
(N'CD_USER_AMD',N'nvarchar',100,NULL,NULL,0),(N'TM_AMD',N'datetime2',NULL,NULL,3,0);
DECLARE @expectedProc TABLE (ColumnName sysname, TypeName sysname, MaxLength smallint NULL, PrecisionValue tinyint NULL, ScaleValue tinyint NULL, NullableValue bit);
INSERT INTO @expectedProc VALUES
(N'CD_FIRM',N'nvarchar',20,NULL,NULL,0),(N'NO_WO',N'nvarchar',60,NULL,NULL,0),(N'NO_PROC',N'int',NULL,NULL,NULL,0),
(N'CD_PROC',N'nvarchar',60,NULL,NULL,0),(N'NM_PROC',N'nvarchar',200,NULL,NULL,0),(N'CD_EQUIP',N'nvarchar',60,NULL,NULL,1),
(N'NM_EQUIP',N'nvarchar',200,NULL,NULL,1),(N'QT_PLAN',N'decimal',NULL,18,4,0),(N'QT_RESULT',N'decimal',NULL,18,4,0),
(N'TM_PLAN_START',N'datetime2',NULL,NULL,3,0),(N'TM_PLAN_END',N'datetime2',NULL,NULL,3,0),(N'ST_PROC',N'nvarchar',40,NULL,NULL,0),
(N'DC_RMK',N'nvarchar',1000,NULL,NULL,1),(N'CD_USER_REG',N'nvarchar',100,NULL,NULL,0),(N'TM_REG',N'datetime2',NULL,NULL,3,0),
(N'CD_USER_AMD',N'nvarchar',100,NULL,NULL,0),(N'TM_AMD',N'datetime2',NULL,NULL,3,0);
DECLARE @woId int=OBJECT_ID(N'POC.PRT_WO'), @procId int=OBJECT_ID(N'POC.PRT_WOPROC');
DECLARE @compatible bit=1;
IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=@woId)<>(SELECT COUNT(*) FROM @expectedWo) SET @compatible=0;
IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=@procId)<>(SELECT COUNT(*) FROM @expectedProc) SET @compatible=0;
IF EXISTS (SELECT 1 FROM @expectedWo e LEFT JOIN sys.columns c ON c.object_id=@woId AND c.name=e.ColumnName LEFT JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.column_id IS NULL OR t.name<>e.TypeName OR (e.MaxLength IS NOT NULL AND c.max_length<>e.MaxLength) OR (e.PrecisionValue IS NOT NULL AND c.precision<>e.PrecisionValue) OR (e.ScaleValue IS NOT NULL AND c.scale<>e.ScaleValue) OR c.is_nullable<>e.NullableValue) SET @compatible=0;
IF EXISTS (SELECT 1 FROM @expectedProc e LEFT JOIN sys.columns c ON c.object_id=@procId AND c.name=e.ColumnName LEFT JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.column_id IS NULL OR t.name<>e.TypeName OR (e.MaxLength IS NOT NULL AND c.max_length<>e.MaxLength) OR (e.PrecisionValue IS NOT NULL AND c.precision<>e.PrecisionValue) OR (e.ScaleValue IS NOT NULL AND c.scale<>e.ScaleValue) OR c.is_nullable<>e.NullableValue) SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name=N'PK_PRT_WO' AND parent_object_id=@woId AND type=N'PK') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name=N'PK_PRT_WOPROC' AND parent_object_id=@procId AND type=N'PK') SET @compatible=0;
IF (SELECT COUNT(*) FROM sys.index_columns ic INNER JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.object_id=@woId AND i.name=N'PK_PRT_WO' AND ic.key_ordinal>0)<>2 SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes i INNER JOIN sys.index_columns a ON a.object_id=i.object_id AND a.index_id=i.index_id INNER JOIN sys.columns ac ON ac.object_id=a.object_id AND ac.column_id=a.column_id INNER JOIN sys.index_columns b ON b.object_id=i.object_id AND b.index_id=i.index_id INNER JOIN sys.columns bc ON bc.object_id=b.object_id AND bc.column_id=b.column_id WHERE i.object_id=@woId AND i.name=N'PK_PRT_WO' AND a.key_ordinal=1 AND ac.name=N'CD_FIRM' AND b.key_ordinal=2 AND bc.name=N'NO_WO') SET @compatible=0;
IF (SELECT COUNT(*) FROM sys.index_columns ic INNER JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.object_id=@procId AND i.name=N'PK_PRT_WOPROC' AND ic.key_ordinal>0)<>3 SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes i INNER JOIN sys.index_columns a ON a.object_id=i.object_id AND a.index_id=i.index_id INNER JOIN sys.columns ac ON ac.object_id=a.object_id AND ac.column_id=a.column_id INNER JOIN sys.index_columns b ON b.object_id=i.object_id AND b.index_id=i.index_id INNER JOIN sys.columns bc ON bc.object_id=b.object_id AND bc.column_id=b.column_id INNER JOIN sys.index_columns c ON c.object_id=i.object_id AND c.index_id=i.index_id INNER JOIN sys.columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id WHERE i.object_id=@procId AND i.name=N'PK_PRT_WOPROC' AND a.key_ordinal=1 AND ac.name=N'CD_FIRM' AND b.key_ordinal=2 AND bc.name=N'NO_WO' AND c.key_ordinal=3 AND cc.name=N'NO_PROC') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys fk WHERE fk.name=N'FK_PRT_WOPROC_WO' AND fk.parent_object_id=@procId AND fk.referenced_object_id=@woId AND fk.delete_referential_action=0) SET @compatible=0;
IF (SELECT COUNT(*) FROM sys.foreign_key_columns fkc INNER JOIN sys.foreign_keys fk ON fk.object_id=fkc.constraint_object_id WHERE fk.name=N'FK_PRT_WOPROC_WO')<>2 SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns fkc INNER JOIN sys.foreign_keys fk ON fk.object_id=fkc.constraint_object_id INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id WHERE fk.name=N'FK_PRT_WOPROC_WO' AND fkc.constraint_column_id=1 AND pc.name=N'CD_FIRM' AND rc.name=N'CD_FIRM') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_key_columns fkc INNER JOIN sys.foreign_keys fk ON fk.object_id=fkc.constraint_object_id INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id WHERE fk.name=N'FK_PRT_WOPROC_WO' AND fkc.constraint_column_id=2 AND pc.name=N'NO_WO' AND rc.name=N'NO_WO') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc INNER JOIN sys.columns c ON c.object_id=dc.parent_object_id AND c.column_id=dc.parent_column_id WHERE dc.parent_object_id=@woId AND dc.name=N'DF_PRT_WO_QT_RESULT' AND c.name=N'QT_RESULT') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc INNER JOIN sys.columns c ON c.object_id=dc.parent_object_id AND c.column_id=dc.parent_column_id WHERE dc.parent_object_id=@woId AND dc.name=N'DF_PRT_WO_YN_URGENT' AND c.name=N'YN_URGENT') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints dc INNER JOIN sys.columns c ON c.object_id=dc.parent_object_id AND c.column_id=dc.parent_column_id WHERE dc.parent_object_id=@procId AND dc.name=N'DF_PRT_WOPROC_QT_RESULT' AND c.name=N'QT_RESULT') SET @compatible=0;
IF (SELECT COUNT(*) FROM sys.index_columns ic INNER JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.object_id=@woId AND i.name=N'IX_PRT_WO_SEARCH' AND ic.key_ordinal>0)<>5 SET @compatible=0;
IF (SELECT COUNT(*) FROM sys.index_columns ic INNER JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.object_id=@procId AND i.name=N'IX_PRT_WOPROC_PROCESS' AND ic.key_ordinal>0)<>3 SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=@woId AND name=N'IX_PRT_WO_SEARCH') SET @compatible=0;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=@procId AND name=N'IX_PRT_WOPROC_PROCESS') SET @compatible=0;
SELECT CAST(@compatible AS nvarchar(1)) AS VALUE;
"@
    if ((Invoke-ScalarSql $compatibilityQuery) -ne '1') {
        Stop-Runner 'Schema conflict' 'Existing POC.PRT_WO/PRT_WOPROC does not match the approved PoC schema. No schema script was applied.'
    }
}

function Assert-RequiredPocPrerequisites {
    $prerequisiteQuery = "SELECT CAST(CASE WHEN SCHEMA_ID(N'POC') IS NOT NULL AND OBJECT_ID(N'POC.MA_ITEM', N'U') IS NOT NULL THEN 1 ELSE 0 END AS nvarchar(1)) AS VALUE;"
    if ((Invoke-ScalarSql $prerequisiteQuery) -ne '1') {
        Stop-Runner 'Schema conflict' 'The existing POC schema or POC.MA_ITEM prerequisite is missing. Apply the existing local PoC setup first; no work-order script was applied.'
    }
}

function Assert-PostSchema {
    $schemaCheck = @"
SELECT CAST(CASE WHEN
OBJECT_ID(N'POC.MST_PRODUCTION_LINE',N'U') IS NOT NULL AND OBJECT_ID(N'POC.MST_PROCESS',N'U') IS NOT NULL AND OBJECT_ID(N'POC.MST_EQUIPMENT',N'U') IS NOT NULL AND
OBJECT_ID(N'POC.PRT_WO',N'U') IS NOT NULL AND OBJECT_ID(N'POC.PRT_WOPROC',N'U') IS NOT NULL AND
EXISTS(SELECT 1 FROM sys.key_constraints WHERE name=N'PK_PRT_WO' AND parent_object_id=OBJECT_ID(N'POC.PRT_WO')) AND
EXISTS(SELECT 1 FROM sys.key_constraints WHERE name=N'PK_PRT_WOPROC' AND parent_object_id=OBJECT_ID(N'POC.PRT_WOPROC')) AND
EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_PRT_WOPROC_WO' AND parent_object_id=OBJECT_ID(N'POC.PRT_WOPROC') AND delete_referential_action=0) AND
EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'POC.PRT_WO') AND name=N'IX_PRT_WO_SEARCH') AND
EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'POC.PRT_WOPROC') AND name=N'IX_PRT_WOPROC_PROCESS')
THEN 1 ELSE 0 END AS nvarchar(1)) AS VALUE;
"@
    if ((Invoke-ScalarSql $schemaCheck) -ne '1') {
        Stop-Runner 'Schema conflict' 'Schema application completed without the required work-order tables, keys, or indexes.'
    }
}

function Invoke-PlaywrightSpec {
    param([string]$SpecPath, [string]$Label)

    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $pnpm) { $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue }
    if ($null -eq $pnpm) {
        Stop-Runner 'Environment error' 'pnpm is required to run Playwright. This runner will not install it.'
    }

    $previousSpec = $env:PLAYWRIGHT_TEST_FILE
    try {
        $env:PLAYWRIGHT_TEST_FILE = $SpecPath
        Invoke-ExternalCommand -Command $pnpm.Source -Arguments @('run', 'test:e2e:api:sqlserver') -Label $Label
    }
    finally {
        $env:PLAYWRIGHT_TEST_FILE = $previousSpec
    }
}

function Report-WorkOrderSqlTestScope {
    $output = @(& dotnet test 'server/G2Erp.sln' --no-build --list-tests --filter 'FullyQualifiedName~SqlServerWorkOrdersIntegrationTests')
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { throw "Work-order SQL test discovery failed with exit code $exitCode." }
    $count = @($output | Where-Object { $_ -match 'SqlServerWorkOrdersIntegrationTests\.' }).Count
    Write-RunnerMessage "Discovered work-order SQL integration tests: $count"
    if ($count -ne 7) {
        Write-RunnerMessage "NOTE: current work-order test class has $count tests; the runner will execute that current set, then the 4 existing sales/purchase SQL regression tests."
    }
}

function Inspect-OptionalRoutingBomSchema {
    $routingTableCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(10)) AS VALUE FROM sys.tables AS t INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id WHERE s.name=N'POC' AND t.name IN (N'ROUTING_HDR',N'ROUTING_DTL',N'RTG_HDR',N'RTG_DTL');"
    $bomTableCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(10)) AS VALUE FROM sys.tables AS t INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id WHERE s.name=N'POC' AND t.name IN (N'BOM_HDR',N'BOM_DTL',N'BOM_ITEM');"
    $script:OptionalRoutingTableCount = $routingTableCount
    $script:OptionalBomTableCount = $bomTableCount

    if ($routingTableCount -eq 0 -and $bomTableCount -eq 0) {
        Write-RunnerMessage 'Optional Routing/BOM sample seed: SKIP (no supported Routing/BOM schema is defined in this PoC).'
        return
    }

    Write-RunnerMessage "Optional Routing/BOM sample seed: SKIP (Routing tables=$routingTableCount, BOM tables=$bomTableCount; no approved column contract exists, so no unknown schema is changed)."
}

function Assert-TestDataCleanup {
    $e2eHeaderCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.PRT_WO WHERE NO_WO LIKE N'E2E-WO-SQL-%' OR NO_WO LIKE N'E2E-WO-DUP-%';"
    $e2eLineCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.PRT_WOPROC WHERE NO_WO LIKE N'E2E-WO-SQL-%' OR NO_WO LIKE N'E2E-WO-DUP-%';"
    $e2eMasterLineCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=N'1000' AND CD_LINE LIKE N'E2E-WO-LINE-%';"
    $e2eMasterProcessCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MST_PROCESS WHERE CD_FIRM=N'1000' AND CD_PROC LIKE N'E2E-WO-PROC%';"
    $e2eMasterEquipmentCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MST_EQUIPMENT WHERE CD_FIRM=N'1000' AND CD_EQUIP LIKE N'E2E-WO-EQUIP-%';"
    $sampleItemCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MA_ITEM WHERE CD_FIRM='1000' AND CD_ITEM IN ('ITEM-SMP-FG01','ITEM-SMP-FG02','ITEM-SMP-SF01','ITEM-SMP-SF02','ITEM-SMP-RM01','ITEM-SMP-RM02');"
    $sampleLineCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=N'1000' AND CD_LINE IN (N'LINE-SMP-01',N'LINE-SMP-02',N'LINE-SMP-03');"
    $sampleProcessCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MST_PROCESS WHERE CD_FIRM=N'1000' AND CD_PROC LIKE N'PROC-SMP-%';"
    $sampleEquipmentCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.MST_EQUIPMENT WHERE CD_FIRM=N'1000' AND CD_EQUIP LIKE N'EQ-SMP-%';"
    $sampleHeaderCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.PRT_WO WHERE CD_FIRM=N'1000' AND NO_WO IN (N'WO-SAMPLE-0001',N'WO-SAMPLE-0002',N'WO-SAMPLE-0003',N'WO-SAMPLE-0004',N'WO-SAMPLE-0005',N'WO-SAMPLE-0006');"
    $sampleProcessLineCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.PRT_WOPROC WHERE CD_FIRM=N'1000' AND NO_WO IN (N'WO-SAMPLE-0001',N'WO-SAMPLE-0002',N'WO-SAMPLE-0003',N'WO-SAMPLE-0004',N'WO-SAMPLE-0005',N'WO-SAMPLE-0006');"
    $seedHeaderCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.PRT_WO WHERE NO_WO LIKE N'WO-TEST-%';"
    $salesSeedCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.SAL_SOH;"
    $purchaseSeedCount = Get-Count "SELECT CAST(COUNT(*) AS nvarchar(20)) AS VALUE FROM POC.PUR_POH;"
    Write-RunnerMessage "Fixed sample counts: item=$sampleItemCount, line=$sampleLineCount, process=$sampleProcessCount, equipment=$sampleEquipmentCount, work-order=$sampleHeaderCount, work-order-process=$sampleProcessLineCount"
    Write-RunnerMessage "Optional Routing/BOM schema tables: routing=$($script:OptionalRoutingTableCount), bom=$($script:OptionalBomTableCount); sample rows=SKIP (no approved PoC contract)."
    Write-RunnerMessage "Remaining E2E rows: header=$e2eHeaderCount, line=$e2eLineCount, master-line=$e2eMasterLineCount, master-process=$e2eMasterProcessCount, master-equipment=$e2eMasterEquipmentCount"
    Write-RunnerMessage "Existing seed counts: WO=$seedHeaderCount, sales=$salesSeedCount, purchase=$purchaseSeedCount"
    if ($e2eHeaderCount -ne 0 -or $e2eLineCount -ne 0 -or $e2eMasterLineCount -ne 0 -or $e2eMasterProcessCount -ne 0 -or $e2eMasterEquipmentCount -ne 0 -or $sampleItemCount -ne 6 -or $sampleLineCount -ne 3 -or $sampleProcessCount -ne 8 -or $sampleEquipmentCount -ne 8 -or $sampleHeaderCount -ne 6 -or $sampleProcessLineCount -ne 18 -or $seedHeaderCount -lt 2 -or $salesSeedCount -lt 1 -or $purchaseSeedCount -lt 1) {
        Stop-Runner 'Test failure' "Residual or missing seed data was detected. Review $cleanupFile; the runner does not run broad automatic cleanup."
    }
}

function Write-FinalSummary {
    Write-Host ''
    Write-RunnerMessage 'FINAL SUMMARY'
    $script:Steps | Format-Table -AutoSize Step, Result, Duration, Detail | Out-Host
    Write-RunnerMessage "VERDICT: $($script:FinalVerdict)"
}

if ($SelfTest) {
    try {
        Invoke-Step 'SQL output parser self-test' { Invoke-SqlOutputParserSelfTest }
        $script:FinalVerdict = 'Self-test completed'
    }
    catch {
        [Console]::Error.WriteLine("Self-test stopped: $($_.Exception.Message)")
    }
    finally {
        Write-FinalSummary
    }

    if ($script:FinalVerdict -ne 'Self-test completed') {
        exit 1
    }
    return
}

try {
    Invoke-Step 'SQL output parser self-test' { Invoke-SqlOutputParserSelfTest }

    Invoke-Step 'Project root and Windows identity' {
        Assert-ProjectRoot
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $remote = (& git remote get-url origin).Trim()
        Write-RunnerMessage "Windows user: $identity"
        Write-RunnerMessage "Repository root: $script:ProjectRoot"
        Write-RunnerMessage "Repository remote: $remote"
    }

    Invoke-Step 'SQL client and local target preflight' {
        Select-SqlExecutionTool
        Write-RunnerMessage "SQL execution tool: $script:SqlTool"
        Write-RunnerMessage "Target server: $script:TargetServer"
        Write-RunnerMessage "Target database: $script:TargetDatabase"
        $actualServer = Invoke-PrefixedScalarSql -Prefix '__SERVER_NAME__=' -Query @"
SET NOCOUNT ON;
SELECT N'__SERVER_NAME__=' + COALESCE(CONVERT(nvarchar(128), SERVERPROPERTY('ServerName')), N'') AS VALUE;
"@
        $actualDatabase = Invoke-PrefixedScalarSql -Prefix '__DB_NAME__=' -Query @"
SET NOCOUNT ON;
SELECT N'__DB_NAME__=' + DB_NAME() AS VALUE;
"@
        $loginName = Invoke-PrefixedScalarSql -Prefix '__LOGIN_NAME__=' -Query @"
SET NOCOUNT ON;
SELECT N'__LOGIN_NAME__=' + COALESCE(SUSER_SNAME(), N'') AS VALUE;
"@
        try {
            $actualDatabase = Assert-AllowedDatabase -DatabaseName $actualDatabase
        }
        catch {
            Stop-Runner 'Environment error' $_.Exception.Message
        }
        Write-RunnerMessage "Connected SQL Server: $actualServer"
        Write-RunnerMessage "Connected database confirmed: $actualDatabase"
        Write-RunnerMessage "Connected Windows login: $loginName"
    }

    Invoke-Step 'Schema preview and collision guard' {
        Write-RunnerMessage "Planned SQL files: $schemaFile ; $seedFile ; $productionMasterSampleFile ; $workOrderSampleFile ; $sampleRelationshipValidationFile"
        Write-RunnerMessage 'Planned tables: POC.MST_PRODUCTION_LINE, POC.MST_PROCESS, POC.MST_EQUIPMENT, POC.PRT_WO, POC.PRT_WOPROC'
        Write-RunnerMessage 'Planned PK/FK/index: PK_PRT_WO; PK_PRT_WOPROC; FK_PRT_WOPROC_WO (NO ACTION); IX_PRT_WO_SEARCH; IX_PRT_WOPROC_PROCESS'
        Write-RunnerMessage 'Fixed sample prefixes: ITEM-SMP-*, LINE-SMP-*, PROC-SMP-*, EQ-SMP-*, WO-SAMPLE-*'
        Write-RunnerMessage 'E2E-only prefixes: E2E-WO-LINE-*, E2E-WO-PROC*, E2E-WO-EQUIP-*, E2E-WO-SQL-*, E2E-WO-DUP-*'
        Assert-RequiredPocPrerequisites
        Assert-WorkOrderObjectSafety
    }

    Invoke-Step 'Apply work-order schema SQL' { Invoke-SqlFile $schemaFile }
    Invoke-Step 'Apply baseline fictional work-order seed SQL' { Invoke-SqlFile $seedFile }
    Invoke-Step 'Verify applied schema' { Assert-PostSchema }
    Invoke-Step 'Apply fixed production master sample seed' { Invoke-SqlFile $productionMasterSampleFile }
    Invoke-Step 'Inspect optional Routing/BOM sample schema' { Inspect-OptionalRoutingBomSchema }
    Invoke-Step 'Apply fixed work-order sample seed' { Invoke-SqlFile $workOrderSampleFile }
    Invoke-Step 'Validate fixed production sample relationships' { Invoke-SqlFile $sampleRelationshipValidationFile }

    Invoke-Step 'Discover work-order SQL integration test scope' { Report-WorkOrderSqlTestScope }
    Invoke-Step 'Work-order SQL integration tests' {
        Invoke-ExternalCommand -Command 'dotnet' -Arguments @('test', 'server/G2Erp.sln', '--no-build', '--filter', 'FullyQualifiedName~SqlServerWorkOrdersIntegrationTests') -Label 'Work-order SQL integration tests'
    }

    Invoke-Step 'Work-order SQL Playwright' { Invoke-PlaywrightSpec -SpecPath $workOrderUiSpec -Label 'Work-order SQL Playwright' }

    Invoke-Step 'Existing sales SQL integration regression' {
        Invoke-ExternalCommand -Command 'dotnet' -Arguments @('test', 'server/G2Erp.sln', '--no-build', '--filter', 'FullyQualifiedName~SqlServerSalesOrdersIntegrationTests') -Label 'Sales SQL integration regression'
    }
    Invoke-Step 'Existing purchase SQL integration regression' {
        Invoke-ExternalCommand -Command 'dotnet' -Arguments @('test', 'server/G2Erp.sln', '--no-build', '--filter', 'FullyQualifiedName~SqlServerPurchaseOrdersIntegrationTests') -Label 'Purchase SQL integration regression'
    }
    Invoke-Step 'Existing sales/purchase SQL Playwright regression' { Invoke-PlaywrightSpec -SpecPath $salesPurchaseUiSpec -Label 'Sales/purchase SQL Playwright regression' }

    Invoke-Step 'Fixed sample summary and read-only E2E cleanup verification' { Assert-TestDataCleanup }
    $script:FinalVerdict = 'Verification completed'
}
catch {
    $failedStep = @($script:Steps | Where-Object { $_.Result -eq 'FAIL' } | Select-Object -Last 1).Step
    if ($script:FinalVerdict -eq 'Environment error' -and $failedStep -match 'integration|Playwright|cleanup') {
        $script:FinalVerdict = 'Test failure'
    }
    elseif ($script:FinalVerdict -eq 'Environment error' -and $failedStep -match 'Schema|schema|seed') {
        $script:FinalVerdict = 'Schema conflict'
    }
    [Console]::Error.WriteLine("Verification stopped: $($_.Exception.Message)")
}
finally {
    Write-FinalSummary
}

if ($script:FinalVerdict -ne 'Verification completed') {
    exit 1
}
