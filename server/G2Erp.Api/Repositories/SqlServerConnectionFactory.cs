using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

/// <summary>Creates connections only after enforcing this PoC's localhost/database allow-list.</summary>
public sealed class SqlServerConnectionFactory
{
    private readonly string _connectionString;
    public SqlServerConnectionFactory(string connectionString) => _connectionString = connectionString;

    public SqlConnection Create() => new(_connectionString);

    public static void ValidateLocalOnly(string connectionString, bool isDevelopment, bool allowUnencryptedLocal, params string[] allowedDatabases)
    {
        var builder = new SqlConnectionStringBuilder(connectionString);
        if (!IsLocalSqlServer(builder.DataSource))
            throw new InvalidOperationException("SqlServer PoC permits only localhost, '.', or this computer's local SQL Server instance.");
        if (!allowedDatabases.Any(database => string.Equals(database, builder.InitialCatalog, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException("SqlServer PoC permits only the approved local development databases.");
        if (!builder.IntegratedSecurity)
            throw new InvalidOperationException("SqlServer PoC requires Windows integrated authentication.");
        if (!builder.Encrypt &&
            (!isDevelopment || !allowUnencryptedLocal))
            throw new InvalidOperationException("Unencrypted SQL connections are allowed only for the local PoC in Development with G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL=true.");
    }

    private static bool IsLocalSqlServer(string dataSource)
    {
        var source = dataSource.Trim();
        if (source.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase))
            source = source[4..];
        else if (source.StartsWith("np:", StringComparison.OrdinalIgnoreCase))
            source = source[3..];
        var host = source.Split([',', '\\'], 2)[0].Trim();
        return string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)
            || string.Equals(host, "127.0.0.1", StringComparison.Ordinal)
            || string.Equals(host, ".", StringComparison.Ordinal)
            || string.Equals(host, Environment.MachineName, StringComparison.OrdinalIgnoreCase);
    }
}
