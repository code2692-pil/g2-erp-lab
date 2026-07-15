using G2Erp.Api.Domain;
using Microsoft.Data.SqlClient;
namespace G2Erp.Api.Repositories;

/// <summary>POC warehouse lookup implementation; SQL is parameterized and scoped to POC.</summary>
public sealed class SqlServerWarehouseRepository(SqlServerConnectionFactory connections) : IWarehouseRepository
{
    public async Task<IReadOnlyList<Warehouse>> GetAllAsync(CancellationToken ct)
    {
        const string sql="SELECT CD_FIRM,CD_WH,NM_WH,YN_USE FROM POC.MA_WH ORDER BY CD_FIRM,CD_WH";
        await using var c=connections.Create();await c.OpenAsync(ct);await using var cmd=new SqlCommand(sql,c);await using var r=await cmd.ExecuteReaderAsync(ct);var rows=new List<Warehouse>();while(await r.ReadAsync(ct))rows.Add(Map(r));return rows;
    }
    public async Task<Warehouse?> GetAsync(string companyCode, string warehouseCode, CancellationToken ct) { const string sql="SELECT CD_FIRM,CD_WH,NM_WH,YN_USE FROM POC.MA_WH WHERE CD_FIRM=@firm AND CD_WH=@warehouse"; await using var c=connections.Create(); await c.OpenAsync(ct); await using var cmd=new SqlCommand(sql,c); cmd.Parameters.AddWithValue("@firm",companyCode);cmd.Parameters.AddWithValue("@warehouse",warehouseCode);await using var r=await cmd.ExecuteReaderAsync(ct);return await r.ReadAsync(ct)?Map(r):null; }
    private static Warehouse Map(SqlDataReader r) => new(){CD_FIRM=r.GetString(0),CD_WH=r.GetString(1),NM_WH=r.GetString(2),YN_USE=r.GetString(3)};
}
