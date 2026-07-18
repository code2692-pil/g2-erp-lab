using G2Erp.Api.Domain.WorkOrders;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

public sealed class SqlServerProductionLineRepository(SqlServerConnectionFactory connections) : IProductionLineRepository
{
    public async Task<IReadOnlyList<ProductionLine>> GetAllAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM,CD_LINE,NM_LINE,YN_USE FROM POC.MST_PRODUCTION_LINE WHERE (@firm IS NULL OR CD_FIRM=@firm) AND (@useYn IS NULL OR YN_USE=@useYn) AND (@keyword IS NULL OR CD_LINE LIKE N'%' + @keyword + N'%' OR NM_LINE LIKE N'%' + @keyword + N'%') ORDER BY CD_FIRM,CD_LINE";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        AddFilters(command, companyCode, useYn, keyword); await using var reader = await command.ExecuteReaderAsync(cancellationToken); var result = new List<ProductionLine>(); while (await reader.ReadAsync(cancellationToken)) result.Add(Map(reader)); return result;
    }

    public async Task<ProductionLine?> GetAsync(string companyCode, string lineCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("SELECT CD_FIRM,CD_LINE,NM_LINE,YN_USE FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=@firm AND CD_LINE=@line", connection);
        Add(command, "@firm", companyCode, 10); Add(command, "@line", lineCode, 30); await using var reader = await command.ExecuteReaderAsync(cancellationToken); return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
    }

    public async Task AddAsync(ProductionLine line, CancellationToken cancellationToken)
    {
        const string sql = "INSERT INTO POC.MST_PRODUCTION_LINE(CD_FIRM,CD_LINE,NM_LINE,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@line,@name,@useYn,N'SYSTEM',SYSUTCDATETIME(),N'SYSTEM',SYSUTCDATETIME())";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        Add(command, "@firm", line.CD_FIRM, 10); Add(command, "@line", line.CD_LINE, 30); Add(command, "@name", line.NM_LINE, 100); Add(command, "@useYn", line.YN_USE, 1);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(string companyCode, string lineCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("DELETE FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=@firm AND CD_LINE=@line", connection);
        Add(command, "@firm", companyCode, 10); Add(command, "@line", lineCode, 30);
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    private static ProductionLine Map(SqlDataReader reader) => new() { CD_FIRM = reader.GetString(0), CD_LINE = reader.GetString(1), NM_LINE = reader.GetString(2), YN_USE = reader.GetString(3) };
    private static void AddFilters(SqlCommand command, string? firm, string? useYn, string? keyword) { Add(command, "@firm", BlankToNull(firm), 10); Add(command, "@useYn", BlankToNull(useYn), 1); Add(command, "@keyword", BlankToNull(keyword), 100); }
    private static void Add(SqlCommand command, string name, string? value, int size) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.NVarChar, size) { Value = (object?)value ?? DBNull.Value });
    private static string? BlankToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
