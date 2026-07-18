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

    public async Task AddAsync(Item item, CancellationToken cancellationToken)
    {
        const string sql = "INSERT INTO POC.MA_ITEM(CD_FIRM,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,YN_USE) VALUES(@firm,@item,@name,@standard,@unit,@useYn)";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@firm", item.CD_FIRM); command.Parameters.AddWithValue("@item", item.CD_ITEM); command.Parameters.AddWithValue("@name", item.NM_ITEM); command.Parameters.AddWithValue("@standard", item.STND_ITEM); command.Parameters.AddWithValue("@unit", item.UNIT_ITEM); command.Parameters.AddWithValue("@useYn", item.YN_USE);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(string companyCode, string itemCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("DELETE FROM POC.MA_ITEM WHERE CD_FIRM=@firm AND CD_ITEM=@item", connection);
        command.Parameters.AddWithValue("@firm", companyCode); command.Parameters.AddWithValue("@item", itemCode);
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    private static Item Map(SqlDataReader r) => new() { CD_FIRM = r.GetString(0), CD_ITEM = r.GetString(1), NM_ITEM = r.GetString(2), STND_ITEM = r.GetString(3), UNIT_ITEM = r.GetString(4), YN_USE = r.GetString(5) };
}
