using Microsoft.Data.SqlClient;

return await RunAsync(args);

static async Task<int> RunAsync(string[] args)
{
    const string developmentEnvironment = "Development";
    var stage = "preflight";
    var databaseChangeAttempted = false;
    SqlConnectionStringBuilder? builder = null;
    string[] scripts = [];

    try
    {
        var connectionString = GetArgument(args, "--connection");
        var verifyOnly = args.Contains("--verify-only", StringComparer.OrdinalIgnoreCase);
        var reportPoc = args.Contains("--report-poc", StringComparer.OrdinalIgnoreCase);
        var probeMaster = args.Contains("--probe-master", StringComparer.OrdinalIgnoreCase);
        var createTestDatabase = args.Contains("--create-test-database", StringComparer.OrdinalIgnoreCase);
        var operationCount = new[] { verifyOnly, reportPoc, probeMaster, createTestDatabase }.Count(value => value);
        if (string.IsNullOrWhiteSpace(connectionString) || operationCount > 1)
        {
            Console.Error.WriteLine("Usage: dotnet run -- --connection \"Server=.;Database=G2ERP_DEV_LOCAL;Trusted_Connection=True;Encrypt=True;TrustServerCertificate=True\" [--verify-only | --report-poc | --probe-master | --create-test-database]");
            return 2;
        }

        builder = new SqlConnectionStringBuilder(connectionString);
        var allowedDatabases = new[] { "G2ERP_DEV_LOCAL", "G2ERP_DEV_LOCAL_TEST" };
        var isMasterOperation = (probeMaster || createTestDatabase) && string.Equals(builder.InitialCatalog, "master", StringComparison.OrdinalIgnoreCase);
        var databaseAllowed = isMasterOperation || allowedDatabases.Contains(builder.InitialCatalog, StringComparer.OrdinalIgnoreCase);
        var scriptsDirectory = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../database/local"));
        var requiredScriptNames = new[]
        {
            "001_create_schema.sql",
            "002_create_master_tables.sql",
            "003_create_sales_order_tables.sql",
            "004_create_purchase_order_tables.sql",
            "005_seed_test_data.sql"
        };
        scripts = (createTestDatabase ? new[] { "006_create_test_database.sql" } : requiredScriptNames)
            .Select(name => Path.Combine(scriptsDirectory, name)).ToArray();
        var missingScripts = scripts.Where(path => !File.Exists(path)).ToArray();

        WritePreflight(builder, databaseAllowed, scripts, missingScripts, probeMaster);

        if (!IsLocalSqlServer(builder.DataSource) || !databaseAllowed || !builder.IntegratedSecurity)
        {
            Console.Error.WriteLine("Blocked: only Windows-authenticated local SQL Server / G2ERP_DEV_LOCAL or G2ERP_DEV_LOCAL_TEST is permitted. master is allowed only with --probe-master or --create-test-database.");
            return 3;
        }
        if (!builder.Encrypt &&
            (!string.Equals(Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT"), developmentEnvironment, StringComparison.OrdinalIgnoreCase) ||
             !string.Equals(Environment.GetEnvironmentVariable("G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL"), "true", StringComparison.OrdinalIgnoreCase)))
        {
            Console.Error.WriteLine("Blocked: Encrypt=False is allowed only for this local PoC when DOTNET_ENVIRONMENT=Development and G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL=true.");
            return 3;
        }
        if (!verifyOnly && !probeMaster && missingScripts.Length > 0)
        {
            Console.Error.WriteLine($"Blocked: required SQL scripts are missing: {string.Join(", ", missingScripts.Select(Path.GetFileName))}. No SQL connection was attempted.");
            return 4;
        }

        stage = "opening allowed local database connection";
        Console.WriteLine($"Connection stage: {stage}");
        await using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();

        if (verifyOnly || probeMaster)
        {
            stage = "reading SQL Server identity";
            await using var command = new SqlCommand("SELECT CAST(SERVERPROPERTY('ServerName') AS nvarchar(256)), CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(256)), ORIGINAL_LOGIN();", connection);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                Console.WriteLine($"Actual SQL Server: {reader.GetString(0)}");
                Console.WriteLine($"SQL Server version: {reader.GetString(1)}");
                Console.WriteLine($"Authenticated Windows login: {reader.GetString(2)}");
            }
            Console.WriteLine("Completed: read-only connection verification. Database changes: No.");
            return 0;
        }

        if (reportPoc)
        {
            stage = "reading POC object and seed counts";
            const string reportSql = "SELECT COUNT(*) FROM sys.tables AS t INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id WHERE s.name=N'POC'; SELECT COUNT(*) FROM POC.MA_PARTNER; SELECT COUNT(*) FROM POC.MA_ITEM; SELECT COUNT(*) FROM POC.MA_WH; SELECT COUNT(*) FROM POC.SAL_SOH; SELECT COUNT(*) FROM POC.SAL_SOL; SELECT COUNT(*) FROM POC.PUR_POH; SELECT COUNT(*) FROM POC.PUR_POL;";
            await using var command = new SqlCommand(reportSql, connection);
            await using var reader = await command.ExecuteReaderAsync();
            var labels = new[] { "POC tables", "Seed partners", "Seed items", "Seed warehouses", "Sales headers", "Sales lines", "Purchase headers", "Purchase lines" };
            for (var index = 0; index < labels.Length; index++)
            {
                await reader.ReadAsync();
                Console.WriteLine($"{labels[index]}: {reader.GetInt32(0)}");
                if (index < labels.Length - 1)
                    await reader.NextResultAsync();
            }
            Console.WriteLine("Completed: read-only POC report. Database changes: No.");
            return 0;
        }

        if (createTestDatabase)
        {
            stage = $"executing {Path.GetFileName(scripts[0])}";
            Console.WriteLine($"Execution stage: {Path.GetFileName(scripts[0])}");
            databaseChangeAttempted = true;
            await using var command = new SqlCommand(await File.ReadAllTextAsync(scripts[0]), connection);
            await command.ExecuteNonQueryAsync();
            Console.WriteLine("Completed: G2ERP_DEV_LOCAL_TEST was created if it did not already exist.");
            Console.WriteLine("Database changes: At most the allowed G2ERP_DEV_LOCAL_TEST database was created.");
            return 0;
        }

        foreach (var script in scripts)
        {
            stage = $"executing {Path.GetFileName(script)}";
            Console.WriteLine($"Execution stage: {Path.GetFileName(script)}");
            databaseChangeAttempted = true;
            await using var command = new SqlCommand(await File.ReadAllTextAsync(script), connection);
            await command.ExecuteNonQueryAsync();
        }
        Console.WriteLine("Completed: POC schema, tables, indexes, and fictional master seed data are ready.");
        Console.WriteLine("Database changes: Yes (only the allowed POC schema and fictional seed data).");
        return 0;
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine("DbSetup failed.");
        Console.Error.WriteLine($"Failure stage: {stage}");
        WriteConnectionSummary(builder, scripts);
        Console.Error.WriteLine($"Database changes: {(databaseChangeAttempted ? "Possible: one or more earlier scripts may have succeeded." : "No SQL script was started.")}");
        WriteException(exception);
        return 1;
    }
}

static string? GetArgument(string[] args, string name)
{
    var index = Array.FindIndex(args, value => string.Equals(value, name, StringComparison.OrdinalIgnoreCase));
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}

static void WritePreflight(SqlConnectionStringBuilder builder, bool databaseAllowed, IEnumerable<string> scripts, IReadOnlyCollection<string> missingScripts, bool isReadOnlyMasterProbe)
{
    Console.WriteLine($"Target server: {builder.DataSource}");
    Console.WriteLine($"Target database: {builder.InitialCatalog}");
    Console.WriteLine($"Authentication: {(builder.IntegratedSecurity ? "Windows integrated" : "not allowed")}");
    Console.WriteLine($"Encrypt: {builder.Encrypt}");
    Console.WriteLine($"TrustServerCertificate: {builder.TrustServerCertificate}");
    Console.WriteLine($"Local server allow-list passed: {IsLocalSqlServer(builder.DataSource)}");
    Console.WriteLine($"Database allow-list passed: {databaseAllowed}");
    Console.WriteLine($"Read-only master probe: {isReadOnlyMasterProbe}");
    foreach (var script in scripts)
        Console.WriteLine($"SQL script: {script} (exists: {File.Exists(script)})");
    if (missingScripts.Count > 0)
        Console.Error.WriteLine($"Missing SQL scripts: {string.Join(", ", missingScripts.Select(Path.GetFileName))}");
}

static void WriteConnectionSummary(SqlConnectionStringBuilder? builder, IEnumerable<string> scripts)
{
    Console.Error.WriteLine($"Target server: {builder?.DataSource ?? "not resolved"}");
    Console.Error.WriteLine($"Target database: {builder?.InitialCatalog ?? "not resolved"}");
    Console.Error.WriteLine($"Encrypt: {builder?.Encrypt.ToString() ?? "not resolved"}");
    Console.Error.WriteLine($"TrustServerCertificate: {builder?.TrustServerCertificate.ToString() ?? "not resolved"}");
    Console.Error.WriteLine($"Authentication: {(builder?.IntegratedSecurity == true ? "Windows integrated" : "not resolved")}");
    foreach (var script in scripts)
        Console.Error.WriteLine($"Planned SQL script: {script}");
}

static bool IsLocalSqlServer(string dataSource)
{
    var source = dataSource.Trim();
    if (source.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase))
        source = source[4..];
    else if (source.StartsWith("np:", StringComparison.OrdinalIgnoreCase))
        source = source[3..];
    var host = source.Split([',', '\\'], 2)[0].Trim();
    return string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)
        || string.Equals(host, ".", StringComparison.Ordinal)
        || string.Equals(host, Environment.MachineName, StringComparison.OrdinalIgnoreCase);
}

static void WriteException(Exception exception)
{
    for (var current = exception; current is not null; current = current.InnerException)
    {
        Console.Error.WriteLine($"Exception type: {current.GetType().FullName}");
        Console.Error.WriteLine($"Message: {current.Message}");
        Console.Error.WriteLine($"StackTrace: {current.StackTrace ?? "(not available)"}");
    }
}
