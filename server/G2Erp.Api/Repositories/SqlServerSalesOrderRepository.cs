using G2Erp.Api.Domain;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

/// <summary>ADO.NET implementation. Header and all lines are written in one database transaction.</summary>
public sealed class SqlServerSalesOrderRepository(SqlServerConnectionFactory connections) : ISalesOrderRepository
{
    public async Task<IReadOnlyList<SalesOrder>> GetAllAsync(CancellationToken ct)
    {
        const string sql = "SELECT CD_FIRM,NO_SO,DT_SO,CD_PARTNER,NM_PARTNER,CD_EMP,ST_SO,DC_RMK,MAIL_ID FROM POC.SAL_SOH ORDER BY DT_SO DESC,NO_SO DESC";
        await using var c = connections.Create(); await c.OpenAsync(ct); var headers=new List<SalesOrderHeader>();
        await using (var cmd = new SqlCommand(sql,c)) await using (var r=await cmd.ExecuteReaderAsync(ct)) while(await r.ReadAsync(ct)) headers.Add(Header(r));
        return await WithLines(c, headers, ct);
    }
    public async Task<SalesOrder?> GetAsync(string firm,string no,CancellationToken ct)
    {
        const string sql="SELECT CD_FIRM,NO_SO,DT_SO,CD_PARTNER,NM_PARTNER,CD_EMP,ST_SO,DC_RMK,MAIL_ID FROM POC.SAL_SOH WHERE CD_FIRM=@firm AND NO_SO=@no";
        await using var c=connections.Create(); await c.OpenAsync(ct); SalesOrderHeader? header;
        await using (var cmd=new SqlCommand(sql,c)) { cmd.Parameters.AddWithValue("@firm",firm);cmd.Parameters.AddWithValue("@no",no);await using var r=await cmd.ExecuteReaderAsync(ct); header=await r.ReadAsync(ct)?Header(r):null; }
        return header is null ? null : (await WithLines(c,[header],ct)).Single();
    }
    public async Task AddAsync(SalesOrder order,CancellationToken ct) => await WriteAsync(order,false,ct);
    public async Task UpdateAsync(SalesOrder order,CancellationToken ct) => await WriteAsync(order,true,ct);
    public async Task<bool> DeleteAsync(string firm,string no,CancellationToken ct)
    {
        await using var c=connections.Create();await c.OpenAsync(ct);await using var tx=await c.BeginTransactionAsync(ct);
        try
        {
            await using(var lines=new SqlCommand("DELETE FROM POC.SAL_SOL WHERE CD_FIRM=@firm AND NO_SO=@no",c,(SqlTransaction)tx)){lines.Parameters.AddWithValue("@firm",firm);lines.Parameters.AddWithValue("@no",no);await lines.ExecuteNonQueryAsync(ct);}
            await using var header=new SqlCommand("DELETE FROM POC.SAL_SOH WHERE CD_FIRM=@firm AND NO_SO=@no",c,(SqlTransaction)tx);header.Parameters.AddWithValue("@firm",firm);header.Parameters.AddWithValue("@no",no);var deleted=await header.ExecuteNonQueryAsync(ct)>0;
            await tx.CommitAsync(ct);return deleted;
        }
        catch { await tx.RollbackAsync(ct); throw; }
    }
    private async Task WriteAsync(SalesOrder order,bool update,CancellationToken ct)
    {
        await using var c=connections.Create();await c.OpenAsync(ct);await using var tx=await c.BeginTransactionAsync(ct);
        try
        {
            var h=order.Header;
            var headerSql=update
              ? "UPDATE POC.SAL_SOH SET DT_SO=@date,CD_PARTNER=@partner,NM_PARTNER=@name,CD_EMP=@emp,ST_SO=@status,DC_RMK=@remark,MAIL_ID=@mail,CD_USER_AMD=@user,TM_AMD=SYSUTCDATETIME() WHERE CD_FIRM=@firm AND NO_SO=@no"
              : "INSERT INTO POC.SAL_SOH(CD_FIRM,NO_SO,DT_SO,CD_PARTNER,NM_PARTNER,CD_EMP,ST_SO,DC_RMK,MAIL_ID,CD_USER_REG,TM_REG) VALUES(@firm,@no,@date,@partner,@name,@emp,@status,@remark,@mail,@user,SYSUTCDATETIME())";
            await using(var cmd=new SqlCommand(headerSql,c,(SqlTransaction)tx)){AddHeader(cmd,h); await cmd.ExecuteNonQueryAsync(ct);}
            if(update){await using var delete=new SqlCommand("DELETE FROM POC.SAL_SOL WHERE CD_FIRM=@firm AND NO_SO=@no",c,(SqlTransaction)tx);delete.Parameters.AddWithValue("@firm",h.CD_FIRM);delete.Parameters.AddWithValue("@no",h.NO_SO);await delete.ExecuteNonQueryAsync(ct);}
            const string lineSql="INSERT INTO POC.SAL_SOL(CD_FIRM,NO_SO,NO_LINE,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_SO,UM_SO,AM_SUPPLY,AM_VAT,AM_TOTAL,DT_DLV,DC_RMK,CD_USER_REG,TM_REG) VALUES(@firm,@no,@line,@item,@name,@standard,@unit,@qty,@price,@supply,@vat,@total,@delivery,@remark,@user,SYSUTCDATETIME())";
            foreach(var line in order.Lines){await using var cmd=new SqlCommand(lineSql,c,(SqlTransaction)tx);AddLine(cmd,line);await cmd.ExecuteNonQueryAsync(ct);}
            await tx.CommitAsync(ct);
        } catch { await tx.RollbackAsync(ct); throw; }
    }
    private static async Task<IReadOnlyList<SalesOrder>> WithLines(SqlConnection c,IEnumerable<SalesOrderHeader> headers,CancellationToken ct)
    {
        var result=new List<SalesOrder>(); foreach(var h in headers){const string sql="SELECT CD_FIRM,NO_SO,NO_LINE,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_SO,UM_SO,AM_SUPPLY,AM_VAT,AM_TOTAL,CONVERT(varchar(10),DT_DLV,23),DC_RMK FROM POC.SAL_SOL WHERE CD_FIRM=@firm AND NO_SO=@no ORDER BY NO_LINE";await using var cmd=new SqlCommand(sql,c);cmd.Parameters.AddWithValue("@firm",h.CD_FIRM);cmd.Parameters.AddWithValue("@no",h.NO_SO);await using var r=await cmd.ExecuteReaderAsync(ct);var lines=new List<SalesOrderLine>();while(await r.ReadAsync(ct))lines.Add(new(){CD_FIRM=r.GetString(0),NO_SO=r.GetString(1),NO_LINE=r.GetInt32(2),CD_ITEM=r.GetString(3),NM_ITEM=r.GetString(4),STND_ITEM=r.GetString(5),UNIT_ITEM=r.GetString(6),QT_SO=r.GetDecimal(7),UM_SO=r.GetDecimal(8),AM_SUPPLY=r.GetDecimal(9),AM_VAT=r.GetDecimal(10),AM_TOTAL=r.GetDecimal(11),DT_DLV=r.GetString(12),DC_RMK=r.GetString(13)});result.Add(new SalesOrder{Header=h,Lines=lines});}return result;
    }
    private static SalesOrderHeader Header(SqlDataReader r)=>new(){CD_FIRM=r.GetString(0),NO_SO=r.GetString(1),DT_SO=r.GetDateTime(2).ToString("yyyy-MM-dd"),CD_PARTNER=r.GetString(3),NM_PARTNER=r.GetString(4),CD_EMP=r.GetString(5),ST_SO=r.GetString(6),DC_RMK=r.GetString(7),MAIL_ID=r.IsDBNull(8)?null:r.GetString(8)};
    private static void AddHeader(SqlCommand c,SalesOrderHeader h){c.Parameters.AddWithValue("@firm",h.CD_FIRM);c.Parameters.AddWithValue("@no",h.NO_SO);c.Parameters.AddWithValue("@date",DateTime.Parse(h.DT_SO));c.Parameters.AddWithValue("@partner",h.CD_PARTNER);c.Parameters.AddWithValue("@name",h.NM_PARTNER);c.Parameters.AddWithValue("@emp",h.CD_EMP);c.Parameters.AddWithValue("@status",h.ST_SO);c.Parameters.AddWithValue("@remark",h.DC_RMK);c.Parameters.AddWithValue("@mail",(object?)h.MAIL_ID??DBNull.Value);c.Parameters.AddWithValue("@user","API");}
    private static void AddLine(SqlCommand c,SalesOrderLine l){c.Parameters.AddWithValue("@firm",l.CD_FIRM);c.Parameters.AddWithValue("@no",l.NO_SO);c.Parameters.AddWithValue("@line",l.NO_LINE);c.Parameters.AddWithValue("@item",l.CD_ITEM);c.Parameters.AddWithValue("@name",l.NM_ITEM);c.Parameters.AddWithValue("@standard",l.STND_ITEM);c.Parameters.AddWithValue("@unit",l.UNIT_ITEM);c.Parameters.AddWithValue("@qty",l.QT_SO);c.Parameters.AddWithValue("@price",l.UM_SO);c.Parameters.AddWithValue("@supply",l.AM_SUPPLY);c.Parameters.AddWithValue("@vat",l.AM_VAT);c.Parameters.AddWithValue("@total",l.AM_TOTAL);c.Parameters.AddWithValue("@delivery",DateTime.Parse(l.DT_DLV));c.Parameters.AddWithValue("@remark",l.DC_RMK);c.Parameters.AddWithValue("@user","API");}
}
