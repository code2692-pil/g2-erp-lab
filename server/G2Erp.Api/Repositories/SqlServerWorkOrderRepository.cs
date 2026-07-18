using G2Erp.Api.Domain.WorkOrders;
using Microsoft.Data.SqlClient;

namespace G2Erp.Api.Repositories;

/// <summary>ADO.NET work-order repository. Every header and process-line mutation is atomic.</summary>
public sealed class SqlServerWorkOrderRepository(SqlServerConnectionFactory connections) : IWorkOrderRepository
{
    private const string HeaderColumns = "CD_FIRM,NO_WO,DT_WO,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_WO,QT_RESULT,DT_PLAN_START,DT_PLAN_END,CD_LINE,NM_LINE,ST_WO,YN_URGENT,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD";
    private const string ProcessColumns = "CD_FIRM,NO_WO,NO_PROC,CD_PROC,NM_PROC,CD_EQUIP,NM_EQUIP,QT_PLAN,QT_RESULT,TM_PLAN_START,TM_PLAN_END,ST_PROC,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD";

    public async Task<IReadOnlyList<WorkOrder>> GetAllAsync(WorkOrderSearch search, CancellationToken cancellationToken)
    {
        const string sql = $"SELECT {HeaderColumns} FROM POC.PRT_WO WHERE (@firm IS NULL OR CD_FIRM=@firm) AND (@dateFrom IS NULL OR DT_WO>=@dateFrom) AND (@dateTo IS NULL OR DT_WO<=@dateTo) AND (@number IS NULL OR NO_WO LIKE N'%' + @number + N'%') AND (@item IS NULL OR CD_ITEM LIKE N'%' + @item + N'%' OR NM_ITEM LIKE N'%' + @item + N'%') AND (@line IS NULL OR CD_LINE LIKE N'%' + @line + N'%' OR NM_LINE LIKE N'%' + @line + N'%') AND (@status IS NULL OR ST_WO=@status) AND (@urgent IS NULL OR YN_URGENT=@urgent) ORDER BY DT_WO DESC,NO_WO DESC";
        await using var connection = connections.Create();
        await connection.OpenAsync(cancellationToken);
        var headers = new List<WorkOrderHeader>();
        await using (var command = new SqlCommand(sql, connection))
        {
            AddSearch(command, search);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) headers.Add(MapHeader(reader));
        }
        return await WithProcessesAsync(connection, headers, cancellationToken);
    }

    public async Task<WorkOrder?> GetAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create();
        await connection.OpenAsync(cancellationToken);
        WorkOrderHeader? header;
        await using (var command = new SqlCommand($"SELECT {HeaderColumns} FROM POC.PRT_WO WHERE CD_FIRM=@firm AND NO_WO=@number", connection))
        {
            AddText(command, "@firm", companyCode, 10);
            AddText(command, "@number", workOrderNo, 30);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            header = await reader.ReadAsync(cancellationToken) ? MapHeader(reader) : null;
        }
        return header is null ? null : (await WithProcessesAsync(connection, [header], cancellationToken)).Single();
    }

    public async Task<bool> ExistsAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create();
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("SELECT 1 FROM POC.PRT_WO WHERE CD_FIRM=@firm AND NO_WO=@number", connection);
        AddText(command, "@firm", companyCode, 10);
        AddText(command, "@number", workOrderNo, 30);
        return await command.ExecuteScalarAsync(cancellationToken) is not null;
    }

    public Task AddAsync(WorkOrder workOrder, CancellationToken cancellationToken) => InsertAsync(workOrder, cancellationToken);
    public Task UpdateAsync(WorkOrder workOrder, CancellationToken cancellationToken) => UpdateAsyncCore(workOrder, cancellationToken);

    public async Task<bool> DeleteAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var sqlTransaction = (SqlTransaction)transaction;
        try
        {
            await ExecuteAsync("DELETE FROM POC.PRT_WOPROC WHERE CD_FIRM=@firm AND NO_WO=@number", connection, sqlTransaction, companyCode, workOrderNo, cancellationToken);
            var deleted = await ExecuteAsync("DELETE FROM POC.PRT_WO WHERE CD_FIRM=@firm AND NO_WO=@number", connection, sqlTransaction, companyCode, workOrderNo, cancellationToken) > 0;
            await transaction.CommitAsync(cancellationToken);
            return deleted;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task InsertAsync(WorkOrder workOrder, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var sqlTransaction = (SqlTransaction)transaction;
        try
        {
            await using (var command = new SqlCommand("INSERT INTO POC.PRT_WO(CD_FIRM,NO_WO,DT_WO,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_WO,QT_RESULT,DT_PLAN_START,DT_PLAN_END,CD_LINE,NM_LINE,ST_WO,YN_URGENT,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@number,@date,@item,@itemName,@standard,@unit,@quantity,@result,@planStart,@planEnd,@line,@lineName,@status,@urgent,@remark,@user,SYSUTCDATETIME(),@user,SYSUTCDATETIME())", connection, sqlTransaction))
            {
                AddHeader(command, workOrder.Header, workOrder.Header.CD_USER_REG ?? "SYSTEM");
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            foreach (var process in workOrder.Processes)
                await InsertProcessAsync(connection, sqlTransaction, process, process.CD_USER_REG ?? workOrder.Header.CD_USER_REG ?? "SYSTEM", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private async Task UpdateAsyncCore(WorkOrder workOrder, CancellationToken cancellationToken)
    {
        await using var connection = connections.Create();
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        var sqlTransaction = (SqlTransaction)transaction;
        try
        {
            await using (var command = new SqlCommand("UPDATE POC.PRT_WO SET DT_WO=@date,CD_ITEM=@item,NM_ITEM=@itemName,STND_ITEM=@standard,UNIT_ITEM=@unit,QT_WO=@quantity,QT_RESULT=@result,DT_PLAN_START=@planStart,DT_PLAN_END=@planEnd,CD_LINE=@line,NM_LINE=@lineName,ST_WO=@status,YN_URGENT=@urgent,DC_RMK=@remark,CD_USER_AMD=@user,TM_AMD=SYSUTCDATETIME() WHERE CD_FIRM=@firm AND NO_WO=@number", connection, sqlTransaction))
            {
                AddHeader(command, workOrder.Header, workOrder.Header.CD_USER_AMD ?? "SYSTEM");
                if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) throw new KeyNotFoundException("Work order not found.");
            }

            var existingNumbers = await GetExistingProcessNumbersAsync(connection, sqlTransaction, workOrder.Header.CD_FIRM, workOrder.Header.NO_WO, cancellationToken);
            var requestedNumbers = workOrder.Processes.Select(process => process.NO_PROC).ToHashSet();
            foreach (var processNumber in existingNumbers.Where(number => !requestedNumbers.Contains(number)))
            {
                await using var command = new SqlCommand("DELETE FROM POC.PRT_WOPROC WHERE CD_FIRM=@firm AND NO_WO=@number AND NO_PROC=@processNumber", connection, sqlTransaction);
                AddText(command, "@firm", workOrder.Header.CD_FIRM, 10);
                AddText(command, "@number", workOrder.Header.NO_WO, 30);
                AddInt(command, "@processNumber", processNumber);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            foreach (var process in workOrder.Processes)
            {
                if (existingNumbers.Contains(process.NO_PROC))
                    await UpdateProcessAsync(connection, sqlTransaction, process, process.CD_USER_AMD ?? workOrder.Header.CD_USER_AMD ?? "SYSTEM", cancellationToken);
                else
                    await InsertProcessAsync(connection, sqlTransaction, process, process.CD_USER_REG ?? workOrder.Header.CD_USER_REG ?? "SYSTEM", cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IReadOnlyList<WorkOrder>> WithProcessesAsync(SqlConnection connection, IEnumerable<WorkOrderHeader> headers, CancellationToken cancellationToken)
    {
        var result = new List<WorkOrder>();
        foreach (var header in headers)
        {
            await using var command = new SqlCommand($"SELECT {ProcessColumns} FROM POC.PRT_WOPROC WHERE CD_FIRM=@firm AND NO_WO=@number ORDER BY NO_PROC", connection);
            AddText(command, "@firm", header.CD_FIRM, 10);
            AddText(command, "@number", header.NO_WO, 30);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            var processes = new List<WorkOrderProcess>();
            while (await reader.ReadAsync(cancellationToken)) processes.Add(MapProcess(reader));
            result.Add(new WorkOrder { Header = header, Processes = processes });
        }
        return result;
    }

    private static async Task<HashSet<int>> GetExistingProcessNumbersAsync(SqlConnection connection, SqlTransaction transaction, string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT NO_PROC FROM POC.PRT_WOPROC WITH (UPDLOCK, HOLDLOCK) WHERE CD_FIRM=@firm AND NO_WO=@number", connection, transaction);
        AddText(command, "@firm", companyCode, 10);
        AddText(command, "@number", workOrderNo, 30);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var result = new HashSet<int>();
        while (await reader.ReadAsync(cancellationToken)) result.Add(reader.GetInt32(0));
        return result;
    }

    private static async Task UpdateProcessAsync(SqlConnection connection, SqlTransaction transaction, WorkOrderProcess process, string auditUser, CancellationToken cancellationToken)
    {
        const string sql = "UPDATE POC.PRT_WOPROC SET CD_PROC=@processCode,NM_PROC=@processName,CD_EQUIP=@equipmentCode,NM_EQUIP=@equipmentName,QT_PLAN=@planQuantity,QT_RESULT=@resultQuantity,TM_PLAN_START=@planStart,TM_PLAN_END=@planEnd,ST_PROC=@status,DC_RMK=@remark,CD_USER_AMD=@user,TM_AMD=SYSUTCDATETIME() WHERE CD_FIRM=@firm AND NO_WO=@number AND NO_PROC=@processNumber";
        await using var command = new SqlCommand(sql, connection, transaction);
        AddProcess(command, process, auditUser);
        if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) throw new InvalidOperationException("A work order process disappeared during update.");
    }

    private static async Task InsertProcessAsync(SqlConnection connection, SqlTransaction transaction, WorkOrderProcess process, string auditUser, CancellationToken cancellationToken)
    {
        const string sql = "INSERT INTO POC.PRT_WOPROC(CD_FIRM,NO_WO,NO_PROC,CD_PROC,NM_PROC,CD_EQUIP,NM_EQUIP,QT_PLAN,QT_RESULT,TM_PLAN_START,TM_PLAN_END,ST_PROC,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@number,@processNumber,@processCode,@processName,@equipmentCode,@equipmentName,@planQuantity,@resultQuantity,@planStart,@planEnd,@status,@remark,@user,SYSUTCDATETIME(),@user,SYSUTCDATETIME())";
        await using var command = new SqlCommand(sql, connection, transaction);
        AddProcess(command, process, auditUser);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<int> ExecuteAsync(string sql, SqlConnection connection, SqlTransaction transaction, string companyCode, string workOrderNo, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(sql, connection, transaction);
        AddText(command, "@firm", companyCode, 10);
        AddText(command, "@number", workOrderNo, 30);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void AddSearch(SqlCommand command, WorkOrderSearch search)
    {
        AddText(command, "@firm", NullIfBlank(search.CompanyCode), 10);
        AddDate(command, "@dateFrom", search.DateFrom);
        AddDate(command, "@dateTo", search.DateTo);
        AddText(command, "@number", NullIfBlank(search.WorkOrderNo), 30);
        AddText(command, "@item", NullIfBlank(search.Item), 100);
        AddText(command, "@line", NullIfBlank(search.ProductionLine), 100);
        AddText(command, "@status", NullIfBlank(search.Status), 20);
        AddText(command, "@urgent", NullIfBlank(search.Urgent), 1);
    }

    private static void AddHeader(SqlCommand command, WorkOrderHeader header, string auditUser)
    {
        AddText(command, "@firm", header.CD_FIRM, 10); AddText(command, "@number", header.NO_WO, 30); AddDate(command, "@date", header.DT_WO);
        AddText(command, "@item", header.CD_ITEM, 30); AddText(command, "@itemName", header.NM_ITEM, 100); AddText(command, "@standard", header.STND_ITEM, 100); AddText(command, "@unit", header.UNIT_ITEM, 20);
        AddDecimal(command, "@quantity", header.QT_WO); AddDecimal(command, "@result", header.QT_RESULT); AddDate(command, "@planStart", header.DT_PLAN_START); AddDate(command, "@planEnd", header.DT_PLAN_END);
        AddText(command, "@line", header.CD_LINE, 30); AddText(command, "@lineName", header.NM_LINE, 100); AddText(command, "@status", header.ST_WO, 20); AddText(command, "@urgent", header.YN_URGENT, 1); AddText(command, "@remark", header.DC_RMK, 500); AddText(command, "@user", auditUser, 50);
    }

    private static void AddProcess(SqlCommand command, WorkOrderProcess process, string auditUser)
    {
        AddText(command, "@firm", process.CD_FIRM, 10); AddText(command, "@number", process.NO_WO, 30); AddInt(command, "@processNumber", process.NO_PROC);
        AddText(command, "@processCode", process.CD_PROC, 30); AddText(command, "@processName", process.NM_PROC, 100); AddText(command, "@equipmentCode", NullIfBlank(process.CD_EQUIP), 30); AddText(command, "@equipmentName", NullIfBlank(process.NM_EQUIP), 100);
        AddDecimal(command, "@planQuantity", process.QT_PLAN); AddDecimal(command, "@resultQuantity", process.QT_RESULT); AddDateTime(command, "@planStart", process.TM_PLAN_START); AddDateTime(command, "@planEnd", process.TM_PLAN_END);
        AddText(command, "@status", process.ST_PROC, 20); AddText(command, "@remark", process.DC_RMK, 500); AddText(command, "@user", auditUser, 50);
    }

    private static WorkOrderHeader MapHeader(SqlDataReader reader) => new()
    {
        CD_FIRM = reader.GetString(0), NO_WO = reader.GetString(1), DT_WO = reader.GetDateTime(2).ToString("yyyy-MM-dd"), CD_ITEM = reader.GetString(3), NM_ITEM = reader.GetString(4), STND_ITEM = reader.IsDBNull(5) ? "" : reader.GetString(5), UNIT_ITEM = reader.IsDBNull(6) ? "" : reader.GetString(6), QT_WO = reader.GetDecimal(7), QT_RESULT = reader.GetDecimal(8), DT_PLAN_START = reader.GetDateTime(9).ToString("yyyy-MM-dd"), DT_PLAN_END = reader.GetDateTime(10).ToString("yyyy-MM-dd"), CD_LINE = reader.GetString(11), NM_LINE = reader.GetString(12), ST_WO = reader.GetString(13), YN_URGENT = reader.GetString(14), DC_RMK = reader.IsDBNull(15) ? "" : reader.GetString(15), CD_USER_REG = reader.GetString(16), TM_REG = reader.GetDateTime(17), CD_USER_AMD = reader.GetString(18), TM_AMD = reader.GetDateTime(19)
    };

    private static WorkOrderProcess MapProcess(SqlDataReader reader) => new()
    {
        CD_FIRM = reader.GetString(0), NO_WO = reader.GetString(1), NO_PROC = reader.GetInt32(2), CD_PROC = reader.GetString(3), NM_PROC = reader.GetString(4), CD_EQUIP = reader.IsDBNull(5) ? "" : reader.GetString(5), NM_EQUIP = reader.IsDBNull(6) ? "" : reader.GetString(6), QT_PLAN = reader.GetDecimal(7), QT_RESULT = reader.GetDecimal(8), TM_PLAN_START = reader.GetDateTime(9).ToString("yyyy-MM-ddTHH:mm:ss"), TM_PLAN_END = reader.GetDateTime(10).ToString("yyyy-MM-ddTHH:mm:ss"), ST_PROC = reader.GetString(11), DC_RMK = reader.IsDBNull(12) ? "" : reader.GetString(12), CD_USER_REG = reader.GetString(13), TM_REG = reader.GetDateTime(14), CD_USER_AMD = reader.GetString(15), TM_AMD = reader.GetDateTime(16)
    };

    private static void AddText(SqlCommand command, string name, string? value, int size) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.NVarChar, size) { Value = (object?)value ?? DBNull.Value });
    private static void AddInt(SqlCommand command, string name, int value) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.Int) { Value = value });
    private static void AddDecimal(SqlCommand command, string name, decimal value) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.Decimal) { Precision = 18, Scale = 4, Value = value });
    private static void AddDate(SqlCommand command, string name, string? value) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.Date) { Value = DateOnly.TryParse(value, out var date) ? date.ToDateTime(TimeOnly.MinValue) : DBNull.Value });
    private static void AddDateTime(SqlCommand command, string name, string value) => command.Parameters.Add(new SqlParameter(name, System.Data.SqlDbType.DateTime2) { Value = DateTime.Parse(value) });
    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
