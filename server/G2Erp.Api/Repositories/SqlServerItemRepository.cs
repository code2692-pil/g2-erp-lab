using G2Erp.Api.Domain;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

public sealed class SqlServerItemRepository(SqlServerConnectionFactory connections) : IItemRepository
{
    public async Task<IReadOnlyList<Item>> GetAllAsync(CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM, CD_ITEM, NM_ITEM, STND_ITEM, UNIT_ITEM, YN_USE FROM POC.MA_ITEM ORDER BY CD_FIRM, CD_ITEM";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection); await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new List<Item>(); while (await reader.ReadAsync(cancellationToken)) result.Add(Map(reader)); return result;
    }
    public async Task<Item?> GetAsync(string companyCode, string itemCode, CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM, CD_ITEM, NM_ITEM, STND_ITEM, UNIT_ITEM, YN_USE FROM POC.MA_ITEM WHERE CD_FIRM=@firm AND CD_ITEM=@item";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@firm", companyCode); command.Parameters.AddWithValue("@item", itemCode); await using var reader = await command.ExecuteReaderAsync(cancellationToken); return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
    }
    private static Item Map(SqlDataReader r) => new() { CD_FIRM = r.GetString(0), CD_ITEM = r.GetString(1), NM_ITEM = r.GetString(2), STND_ITEM = r.GetString(3), UNIT_ITEM = r.GetString(4), YN_USE = r.GetString(5) };
}
