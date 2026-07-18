using G2Erp.Api.Domain.WorkOrders;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

public sealed class SqlServerProcessRepository(SqlServerConnectionFactory connections) : IProcessRepository
{
    public async Task<IReadOnlyList<ProductionProcess>> GetAllAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM,CD_PROC,NM_PROC,NO_SEQ,YN_USE FROM POC.MST_PROCESS WHERE (@firm IS NULL OR CD_FIRM=@firm) AND (@useYn IS NULL OR YN_USE=@useYn) AND (@keyword IS NULL OR CD_PROC LIKE N'%' + @keyword + N'%' OR NM_PROC LIKE N'%' + @keyword + N'%') ORDER BY CD_FIRM,NO_SEQ,CD_PROC";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        AddFilters(command, companyCode, useYn, keyword); await using var reader = await command.ExecuteReaderAsync(cancellationToken); var result = new List<ProductionProcess>(); while (await reader.ReadAsync(cancellationToken)) result.Add(Map(reader)); return result;
    }

    public async Task<ProductionProcess?> GetAsync(string companyCode, string processCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("SELECT CD_FIRM,CD_PROC,NM_PROC,NO_SEQ,YN_USE FROM POC.MST_PROCESS WHERE CD_FIRM=@firm AND CD_PROC=@process", connection);
        Add(command, "@firm", companyCode, 10); Add(command, "@process", processCode, 30); await using var reader = await command.ExecuteReaderAsync(cancellationToken); return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
    }

    private static ProductionProcess Map(SqlDataReader reader) => new() { CD_FIRM = reader.GetString(0), CD_PROC = reader.GetString(1), NM_PROC = reader.GetString(2), NO_SEQ = reader.GetInt32(3), YN_USE = reader.GetString(4) };
    private static void AddFilters(SqlCommand command, string? firm, string? useYn, string? keyword) { Add(command, "@firm", BlankToNull(firm), 10); Add(command, "@useYn", BlankToNull(useYn), 1); Add(command, "@keyword", BlankToNull(keyword), 100); }
    private static void Add(SqlCommand command, string name, string? value, int size) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.NVarChar, size) { Value = (object?)value ?? DBNull.Value });
    private static string? BlankToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
