using G2Erp.Api.Domain;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

public sealed class SqlServerPartnerRepository(SqlServerConnectionFactory connections) : IPartnerRepository
{
    public async Task<IReadOnlyList<Partner>> GetAllAsync(CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM, CD_PARTNER, NM_PARTNER, NO_COMPANY, YN_USE FROM POC.MA_PARTNER ORDER BY CD_FIRM, CD_PARTNER";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection); await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new List<Partner>();
        while (await reader.ReadAsync(cancellationToken)) result.Add(new Partner { CD_FIRM = reader.GetString(0), CD_PARTNER = reader.GetString(1), NM_PARTNER = reader.GetString(2), NO_COMPANY = reader.GetString(3), YN_USE = reader.GetString(4) });
        return result;
    }
    public async Task<Partner?> GetAsync(string companyCode, string partnerCode, CancellationToken cancellationToken)
    {
        const string sql = "SELECT CD_FIRM, CD_PARTNER, NM_PARTNER, NO_COMPANY, YN_USE FROM POC.MA_PARTNER WHERE CD_FIRM=@firm AND CD_PARTNER=@partner";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@firm", companyCode); command.Parameters.AddWithValue("@partner", partnerCode);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? new Partner { CD_FIRM = reader.GetString(0), CD_PARTNER = reader.GetString(1), NM_PARTNER = reader.GetString(2), NO_COMPANY = reader.GetString(3), YN_USE = reader.GetString(4) } : null;
    }

    public async Task AddAsync(Partner partner, CancellationToken cancellationToken)
    {
        const string sql = "INSERT INTO POC.MA_PARTNER(CD_FIRM,CD_PARTNER,NM_PARTNER,NO_COMPANY,YN_USE) VALUES(@firm,@partner,@name,@companyNo,@useYn)";
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand(sql, connection);
        command.Parameters.AddWithValue("@firm", partner.CD_FIRM); command.Parameters.AddWithValue("@partner", partner.CD_PARTNER); command.Parameters.AddWithValue("@name", partner.NM_PARTNER); command.Parameters.AddWithValue("@companyNo", partner.NO_COMPANY); command.Parameters.AddWithValue("@useYn", partner.YN_USE);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(string companyCode, string partnerCode, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(cancellationToken); await using var command = new SqlCommand("DELETE FROM POC.MA_PARTNER WHERE CD_FIRM=@firm AND CD_PARTNER=@partner", connection);
        command.Parameters.AddWithValue("@firm", companyCode); command.Parameters.AddWithValue("@partner", partnerCode);
        return await command.ExecuteNonQueryAsync(cancellationToken) > 0;
    }
}
