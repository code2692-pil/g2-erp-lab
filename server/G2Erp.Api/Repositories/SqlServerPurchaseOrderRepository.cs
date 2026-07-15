using G2Erp.Api.Domain;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

/// <summary>Parameterized ADO.NET repository; every header/line write uses one transaction.</summary>
public sealed class SqlServerPurchaseOrderRepository(SqlServerConnectionFactory connections) : IPurchaseOrderRepository
{
    public async Task<IReadOnlyList<PurchaseOrder>> GetAllAsync(PurchaseOrderSearch search, CancellationToken ct)
    {
        const string sql = "SELECT CD_FIRM,NO_PO,DT_PO,CD_PARTNER,NM_PARTNER,CD_EMP,NM_EMP,CD_CURRENCY,RT_EXCHANGE,ST_PO,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD FROM POC.PUR_POH WHERE (@firm IS NULL OR CD_FIRM=@firm) AND (@from IS NULL OR DT_PO>=@from) AND (@to IS NULL OR DT_PO<=@to) AND (@no IS NULL OR NO_PO LIKE '%' + @no + '%') AND (@partner IS NULL OR CD_PARTNER LIKE '%' + @partner + '%' OR NM_PARTNER LIKE '%' + @partner + '%') AND (@status IS NULL OR ST_PO=@status) ORDER BY DT_PO DESC,NO_PO DESC";
        await using var connection = connections.Create(); await connection.OpenAsync(ct); var headers = new List<PurchaseOrderHeader>();
        await using (var command = new SqlCommand(sql, connection))
        {
            AddSearch(command, search); await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) headers.Add(MapHeader(reader));
        }
        return await WithLinesAsync(connection, headers, ct);
    }

    public async Task<PurchaseOrder?> GetAsync(string companyCode, string purchaseOrderNo, CancellationToken ct)
    {
        const string sql = "SELECT CD_FIRM,NO_PO,DT_PO,CD_PARTNER,NM_PARTNER,CD_EMP,NM_EMP,CD_CURRENCY,RT_EXCHANGE,ST_PO,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD FROM POC.PUR_POH WHERE CD_FIRM=@firm AND NO_PO=@no";
        await using var connection = connections.Create(); await connection.OpenAsync(ct); PurchaseOrderHeader? header;
        await using (var command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@firm", companyCode); command.Parameters.AddWithValue("@no", purchaseOrderNo);
            await using var reader = await command.ExecuteReaderAsync(ct);
            header = await reader.ReadAsync(ct) ? MapHeader(reader) : null;
        }
        return header is null ? null : (await WithLinesAsync(connection, [header], ct)).Single();
    }

    public Task AddAsync(PurchaseOrder purchaseOrder, CancellationToken ct) => WriteAsync(purchaseOrder, false, ct);
    public Task UpdateAsync(PurchaseOrder purchaseOrder, CancellationToken ct) => WriteAsync(purchaseOrder, true, ct);

    public async Task<bool> DeleteAsync(string companyCode, string purchaseOrderNo, CancellationToken ct)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(ct); await using var transaction = await connection.BeginTransactionAsync(ct);
        try
        {
            await using (var lines = new SqlCommand("DELETE FROM POC.PUR_POL WHERE CD_FIRM=@firm AND NO_PO=@no", connection, (SqlTransaction)transaction)) { lines.Parameters.AddWithValue("@firm", companyCode); lines.Parameters.AddWithValue("@no", purchaseOrderNo); await lines.ExecuteNonQueryAsync(ct); }
            await using var header = new SqlCommand("DELETE FROM POC.PUR_POH WHERE CD_FIRM=@firm AND NO_PO=@no", connection, (SqlTransaction)transaction); header.Parameters.AddWithValue("@firm", companyCode); header.Parameters.AddWithValue("@no", purchaseOrderNo); var deleted = await header.ExecuteNonQueryAsync(ct) > 0;
            await transaction.CommitAsync(ct); return deleted;
        }
        catch { await transaction.RollbackAsync(ct); throw; }
    }

    private async Task WriteAsync(PurchaseOrder order, bool isUpdate, CancellationToken ct)
    {
        await using var connection = connections.Create(); await connection.OpenAsync(ct); await using var transaction = await connection.BeginTransactionAsync(ct);
        try
        {
            var headerSql = isUpdate
                ? "UPDATE POC.PUR_POH SET DT_PO=@date,CD_PARTNER=@partner,NM_PARTNER=@name,CD_EMP=@emp,NM_EMP=@empName,CD_CURRENCY=@currency,RT_EXCHANGE=@exchange,ST_PO=@status,DC_RMK=@remark,CD_USER_AMD=@user,TM_AMD=SYSUTCDATETIME() WHERE CD_FIRM=@firm AND NO_PO=@no"
                : "INSERT INTO POC.PUR_POH(CD_FIRM,NO_PO,DT_PO,CD_PARTNER,NM_PARTNER,CD_EMP,NM_EMP,CD_CURRENCY,RT_EXCHANGE,ST_PO,DC_RMK,CD_USER_REG,TM_REG) VALUES(@firm,@no,@date,@partner,@name,@emp,@empName,@currency,@exchange,@status,@remark,@user,SYSUTCDATETIME())";
            await using (var header = new SqlCommand(headerSql, connection, (SqlTransaction)transaction)) { AddHeader(header, order.Header); await header.ExecuteNonQueryAsync(ct); }
            if (isUpdate) { await using var removeLines = new SqlCommand("DELETE FROM POC.PUR_POL WHERE CD_FIRM=@firm AND NO_PO=@no", connection, (SqlTransaction)transaction); removeLines.Parameters.AddWithValue("@firm", order.Header.CD_FIRM); removeLines.Parameters.AddWithValue("@no", order.Header.NO_PO); await removeLines.ExecuteNonQueryAsync(ct); }
            const string lineSql = "INSERT INTO POC.PUR_POL(CD_FIRM,NO_PO,NO_LINE,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_PO,UM_PO,AM_SUPPLY,AM_VAT,AM_TOTAL,DT_DLV,CD_WH,NM_WH,DC_RMK,CD_USER_REG,TM_REG) VALUES(@firm,@no,@line,@item,@name,@standard,@unit,@quantity,@price,@supply,@vat,@total,@delivery,@warehouse,@warehouseName,@remark,@user,SYSUTCDATETIME())";
            foreach (var line in order.Lines) { await using var command = new SqlCommand(lineSql, connection, (SqlTransaction)transaction); AddLine(command, line); await command.ExecuteNonQueryAsync(ct); }
            await transaction.CommitAsync(ct);
        }
        catch { await transaction.RollbackAsync(ct); throw; }
    }

    private static async Task<IReadOnlyList<PurchaseOrder>> WithLinesAsync(SqlConnection connection, IEnumerable<PurchaseOrderHeader> headers, CancellationToken ct)
    {
        const string sql = "SELECT CD_FIRM,NO_PO,NO_LINE,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_PO,UM_PO,AM_SUPPLY,AM_VAT,AM_TOTAL,DT_DLV,CD_WH,NM_WH,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD FROM POC.PUR_POL WHERE CD_FIRM=@firm AND NO_PO=@no ORDER BY NO_LINE";
        var result = new List<PurchaseOrder>();
        foreach (var header in headers)
        {
            await using var command = new SqlCommand(sql, connection); command.Parameters.AddWithValue("@firm", header.CD_FIRM); command.Parameters.AddWithValue("@no", header.NO_PO); await using var reader = await command.ExecuteReaderAsync(ct); var lines = new List<PurchaseOrderLine>(); while (await reader.ReadAsync(ct)) lines.Add(MapLine(reader)); result.Add(new PurchaseOrder { Header = header, Lines = lines });
        }
        return result;
    }

    private static void AddSearch(SqlCommand command, PurchaseOrderSearch search)
    {
        command.Parameters.AddWithValue("@firm", (object?)NullIfBlank(search.CompanyCode) ?? DBNull.Value); command.Parameters.AddWithValue("@from", DateOrDbNull(search.DateFrom)); command.Parameters.AddWithValue("@to", DateOrDbNull(search.DateTo)); command.Parameters.AddWithValue("@no", (object?)NullIfBlank(search.PurchaseOrderNo) ?? DBNull.Value); command.Parameters.AddWithValue("@partner", (object?)NullIfBlank(search.Partner) ?? DBNull.Value); command.Parameters.AddWithValue("@status", (object?)NullIfBlank(search.Status) ?? DBNull.Value);
    }
    private static object DateOrDbNull(string? value) => DateOnly.TryParse(value, out var date) ? date.ToDateTime(TimeOnly.MinValue) : DBNull.Value;
    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
    private static PurchaseOrderHeader MapHeader(SqlDataReader r) => new() { CD_FIRM = r.GetString(0), NO_PO = r.GetString(1), DT_PO = r.GetDateTime(2).ToString("yyyy-MM-dd"), CD_PARTNER = r.GetString(3), NM_PARTNER = r.GetString(4), CD_EMP = r.GetString(5), NM_EMP = r.IsDBNull(6) ? "" : r.GetString(6), CD_CURRENCY = r.GetString(7), RT_EXCHANGE = r.GetDecimal(8), ST_PO = r.GetString(9), DC_RMK = r.GetString(10), CD_USER_REG = r.GetString(11), TM_REG = r.GetDateTime(12), CD_USER_AMD = r.IsDBNull(13) ? null : r.GetString(13), TM_AMD = r.IsDBNull(14) ? null : r.GetDateTime(14) };
    private static PurchaseOrderLine MapLine(SqlDataReader r) => new() { CD_FIRM = r.GetString(0), NO_PO = r.GetString(1), NO_LINE = r.GetInt32(2), CD_ITEM = r.GetString(3), NM_ITEM = r.GetString(4), STND_ITEM = r.GetString(5), UNIT_ITEM = r.GetString(6), QT_PO = r.GetDecimal(7), UM_PO = r.GetDecimal(8), AM_SUPPLY = r.GetDecimal(9), AM_VAT = r.GetDecimal(10), AM_TOTAL = r.GetDecimal(11), DT_DLV = r.GetDateTime(12).ToString("yyyy-MM-dd"), CD_WH = r.GetString(13), NM_WH = r.GetString(14), DC_RMK = r.GetString(15), CD_USER_REG = r.GetString(16), TM_REG = r.GetDateTime(17), CD_USER_AMD = r.IsDBNull(18) ? null : r.GetString(18), TM_AMD = r.IsDBNull(19) ? null : r.GetDateTime(19) };
    private static void AddHeader(SqlCommand c, PurchaseOrderHeader h) { c.Parameters.AddWithValue("@firm", h.CD_FIRM); c.Parameters.AddWithValue("@no", h.NO_PO); c.Parameters.AddWithValue("@date", DateTime.Parse(h.DT_PO)); c.Parameters.AddWithValue("@partner", h.CD_PARTNER); c.Parameters.AddWithValue("@name", h.NM_PARTNER); c.Parameters.AddWithValue("@emp", h.CD_EMP); c.Parameters.AddWithValue("@empName", (object?)h.NM_EMP ?? DBNull.Value); c.Parameters.AddWithValue("@currency", h.CD_CURRENCY); c.Parameters.AddWithValue("@exchange", h.RT_EXCHANGE); c.Parameters.AddWithValue("@status", h.ST_PO); c.Parameters.AddWithValue("@remark", h.DC_RMK); c.Parameters.AddWithValue("@user", "API"); }
    private static void AddLine(SqlCommand c, PurchaseOrderLine l) { c.Parameters.AddWithValue("@firm", l.CD_FIRM); c.Parameters.AddWithValue("@no", l.NO_PO); c.Parameters.AddWithValue("@line", l.NO_LINE); c.Parameters.AddWithValue("@item", l.CD_ITEM); c.Parameters.AddWithValue("@name", l.NM_ITEM); c.Parameters.AddWithValue("@standard", l.STND_ITEM); c.Parameters.AddWithValue("@unit", l.UNIT_ITEM); c.Parameters.AddWithValue("@quantity", l.QT_PO); c.Parameters.AddWithValue("@price", l.UM_PO); c.Parameters.AddWithValue("@supply", l.AM_SUPPLY); c.Parameters.AddWithValue("@vat", l.AM_VAT); c.Parameters.AddWithValue("@total", l.AM_TOTAL); c.Parameters.AddWithValue("@delivery", DateTime.Parse(l.DT_DLV)); c.Parameters.AddWithValue("@warehouse", l.CD_WH); c.Parameters.AddWithValue("@warehouseName", l.NM_WH); c.Parameters.AddWithValue("@remark", l.DC_RMK); c.Parameters.AddWithValue("@user", "API"); }
}
