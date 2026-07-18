using G2Erp.Api.Domain.WorkOrders;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

public sealed class SqlServerEquipmentRepository(SqlServerConnectionFactory connections) : IEquipmentRepository
{
    public async Task<IReadOnlyList<Equipment>> GetAllAsync(string? companyCode, string? lineCode, string? useYn, string? keyword, CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM,CD_EQUIP,NM_EQUIP,CD_LINE,YN_USE FROM POC.MST_EQUIPMENT WHERE (@firm IS NULL OR CD_FIRM=@firm) AND (@line IS NULL OR CD_LINE=@line) AND (@useYn IS NULL OR YN_USE=@useYn) AND (@keyword IS NULL OR CD_EQUIP LIKE N'%' + @keyword + N'%' OR NM_EQUIP LIKE N'%' + @keyword + N'%') ORDER BY CD_FIRM,CD_EQUIP";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        Add(command, "@firm", BlankToNull(companyCode), 10); Add(command, "@line", BlankToNull(lineCode), 30); Add(command, "@useYn", BlankToNull(useYn), 1); Add(command, "@keyword", BlankToNull(keyword), 100);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken); var result = new List<Equipment>(); while (await reader.ReadAsync(cancellationToken)) result.Add(Map(reader)); return result;
    }

    public async Task<Equipment?> GetAsync(string companyCode, string equipmentCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("SELECT CD_FIRM,CD_EQUIP,NM_EQUIP,CD_LINE,YN_USE FROM POC.MST_EQUIPMENT WHERE CD_FIRM=@firm AND CD_EQUIP=@equipment", connection);
        Add(command, "@firm", companyCode, 10); Add(command, "@equipment", equipmentCode, 30); await using var reader = await command.ExecuteReaderAsync(cancellationToken); return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
    }

    public async Task AddAsync(Equipment equipment, CancellationToken cancellationToken)
    {
        const string sql = "INSERT INTO POC.MST_EQUIPMENT(CD_FIRM,CD_EQUIP,NM_EQUIP,CD_LINE,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@equipment,@name,@line,@useYn,N'SYSTEM',SYSUTCDATETIME(),N'SYSTEM',SYSUTCDATETIME())";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        Add(command, "@firm", equipment.CD_FIRM, 10); Add(command, "@equipment", equipment.CD_EQUIP, 30); Add(command, "@name", equipment.NM_EQUIP, 100); Add(command, "@line", equipment.CD_LINE, 30); Add(command, "@useYn", equipment.YN_USE, 1);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(string companyCode, string equipmentCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("DELETE FROM POC.MST_EQUIPMENT WHERE CD_FIRM=@firm AND CD_EQUIP=@equipment", connection);
        Add(command, "@firm", companyCode, 10); Add(command, "@equipment", equipmentCode, 30);
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }

    private static Equipment Map(SqlDataReader reader) => new() { CD_FIRM = reader.GetString(0), CD_EQUIP = reader.GetString(1), NM_EQUIP = reader.GetString(2), CD_LINE = reader.GetString(3), YN_USE = reader.GetString(4) };
    private static void Add(SqlCommand command, string name, string? value, int size) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.NVarChar, size) { Value = (object?)value ?? DBNull.Value });
    private static string? BlankToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
