using System.Data;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain.WorkOrders;
using G2Erp.Api.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.SqlClient;
using Xunit;
using Xunit.Sdk;

namespace G2Erp.Api.Tests;

public sealed class SqlServerWorkOrdersIntegrationTests
{
    private const string ConnectionString = "Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerWorkOrderRepository_SearchesSynchronizesProcessesAndCleansUp()
    {
        var master = WorkOrderTestMaster.Create();
        var number = CreateWorkOrderNumber("E2E-WO-SQL");
        var repository = new SqlServerWorkOrderRepository(new SqlServerConnectionFactory(ConnectionString));

        try
        {
            await EnsureTestMasterDataAsync(master);

            await repository.AddAsync(
                CreateDomainOrder(master, number, 10, 0,
                [Process(master, number, 10, master.ProcessCode1, 10, 0)]),
                CancellationToken.None);

            var created = await repository.GetAsync(master.CompanyCode, number, CancellationToken.None);
            Assert.NotNull(created);
            Assert.Single(created.Processes);
            Assert.Equal("SYSTEM", created.Header.CD_USER_REG);
            Assert.NotNull(created.Header.TM_REG);
            Assert.Equal("SYSTEM", created.Header.CD_USER_AMD);

            await repository.UpdateAsync(
                CreateDomainOrder(master, number, 12, 4,
                [
                    Process(master, number, 10, master.ProcessCode1, 12, 4, "In progress"),
                    Process(master, number, 20, master.ProcessCode2, 12, 0)
                ]),
                CancellationToken.None);

            var updated = await repository.GetAsync(master.CompanyCode, number, CancellationToken.None);
            Assert.NotNull(updated);
            Assert.Equal(12m, updated.Header.QT_WO);
            Assert.Equal([10, 20], updated.Processes.Select(x => x.NO_PROC));
            Assert.Equal("In progress", updated.Processes.Single(x => x.NO_PROC == 10).ST_PROC);

            await repository.UpdateAsync(
                CreateDomainOrder(master, number, 12, 4,
                [Process(master, number, 20, master.ProcessCode2, 12, 4, "Completed")]),
                CancellationToken.None);

            var synchronized = await repository.GetAsync(master.CompanyCode, number, CancellationToken.None);
            Assert.NotNull(synchronized);
            Assert.Single(synchronized.Processes);
            Assert.Equal(20, synchronized.Processes.Single().NO_PROC);

            var search = await repository.GetAllAsync(
                new WorkOrderSearch(master.CompanyCode, null, null, number, "Controller", master.LineCode, null, null),
                CancellationToken.None);
            Assert.Contains(search, order => order.Header.NO_WO == number);

            Assert.True(await repository.DeleteAsync(master.CompanyCode, number, CancellationToken.None));
            Assert.Null(await repository.GetAsync(master.CompanyCode, number, CancellationToken.None));
            Assert.Equal(0, await CountWorkOrderRowsAsync(master.CompanyCode, number));
        }
        finally
        {
            await CleanupTestDataAsync(master, number);
        }
    }

    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerWorkOrderRepository_RollsBackHeaderWhenAProcessInsertFails()
    {
        var master = WorkOrderTestMaster.Create();
        var number = CreateWorkOrderNumber("E2E-WO-SQL");
        var repository = new SqlServerWorkOrderRepository(new SqlServerConnectionFactory(ConnectionString));

        try
        {
            await EnsureTestMasterDataAsync(master);

            await Assert.ThrowsAsync<SqlException>(() => repository.AddAsync(
                CreateDomainOrder(master, number, 10, 0,
                [Process(master, number, 10, "E2E-WO-PROC-MISSING", 10, 0)]),
                CancellationToken.None));

            Assert.Null(await repository.GetAsync(master.CompanyCode, number, CancellationToken.None));
            Assert.Equal(0, await CountWorkOrderRowsAsync(master.CompanyCode, number));
        }
        finally
        {
            await CleanupTestDataAsync(master, number);
        }
    }

    [Fact]
    [Trait("Category", "SqlServerIntegration")]
    public async Task SqlServerWorkOrderApi_UsesSharedValidationAndMasterLookups()
    {
        var master = WorkOrderTestMaster.Create();
        var number = CreateWorkOrderNumber("E2E-WO-DUP");
        var request = CreateRequest(master, number, 3, 4);
        var requestSummary = DescribeCreateRequest(master, number);

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("RepositoryMode", "SqlServer");
            builder.UseSetting("ConnectionStrings:G2Erp", ConnectionString);
            builder.UseSetting("G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL", "true");
        });
        using var client = factory.CreateClient();

        try
        {
            await EnsureTestMasterDataAsync(master);

            var created = await client.PostAsJsonAsync("/api/work-orders", request);
            var body = await ReadSuccessJsonAsync<WorkOrderDetailDto>(created, HttpStatusCode.Created, requestSummary);
            Assert.NotNull(body);
            Assert.NotEmpty(body.Warnings);
            Assert.Equal(master.LineCode, body.Header.CD_LINE);
            Assert.Equal(master.ProcessCode1, body.Processes.Single().CD_PROC);
            Assert.Equal(master.EquipmentCode, body.Processes.Single().CD_EQUIP);

            var duplicate = await client.PostAsJsonAsync("/api/work-orders", request);
            var duplicateError = await ReadErrorJsonAsync(duplicate, HttpStatusCode.Conflict, requestSummary);
            Assert.Contains("already exists", (duplicateError.Error ?? string.Empty).ToLowerInvariant());

            var invalidNumber = CreateWorkOrderNumber("E2E-WO-DUP");
            var invalid = await client.PostAsJsonAsync("/api/work-orders", CreateRequest(master, invalidNumber, 0, 0));
            var validationError = await ReadErrorJsonAsync(invalid, HttpStatusCode.BadRequest, DescribeCreateRequest(master, invalidNumber));
            Assert.NotEmpty(validationError.Errors ?? []);

            var lines = await client.GetAsync($"/api/production-lines?companyCode={master.CompanyCode}&useYn=Y&keyword={Uri.EscapeDataString(master.LineCode)}");
            Assert.Contains(await ReadSuccessJsonAsync<List<ProductionLineDto>>(lines, HttpStatusCode.OK, "GET production-line master lookup"), line => line.CD_LINE == master.LineCode);

            var processes = await client.GetAsync($"/api/processes?companyCode={master.CompanyCode}&useYn=Y&keyword={Uri.EscapeDataString(master.ProcessCode1)}");
            Assert.Contains(await ReadSuccessJsonAsync<List<ProductionProcessDto>>(processes, HttpStatusCode.OK, "GET process master lookup"), process => process.CD_PROC == master.ProcessCode1);

            var equipment = await client.GetAsync($"/api/equipment?companyCode={master.CompanyCode}&lineCode={Uri.EscapeDataString(master.LineCode)}&useYn=Y&keyword={Uri.EscapeDataString(master.EquipmentCode)}");
            Assert.Contains(await ReadSuccessJsonAsync<List<EquipmentDto>>(equipment, HttpStatusCode.OK, "GET equipment master lookup"), item => item.CD_EQUIP == master.EquipmentCode);

            Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/work-orders/{master.CompanyCode}/{number}")).StatusCode);
            Assert.Equal(0, await CountWorkOrderRowsAsync(master.CompanyCode, number));
        }
        finally
        {
            await CleanupTestDataAsync(master, number);
        }
    }

    private static WorkOrder CreateDomainOrder(WorkOrderTestMaster master, string number, decimal quantity, decimal result, IReadOnlyList<WorkOrderProcess> processes) => new()
    {
        Header = new WorkOrderHeader
        {
            CD_FIRM = master.CompanyCode,
            NO_WO = number,
            DT_WO = "2026-07-17",
            CD_ITEM = "ITM-1001",
            NM_ITEM = "Controller A",
            STND_ITEM = "CTRL-A / 24V",
            UNIT_ITEM = "EA",
            QT_WO = quantity,
            QT_RESULT = result,
            DT_PLAN_START = "2026-07-20",
            DT_PLAN_END = "2026-07-21",
            CD_LINE = master.LineCode,
            NM_LINE = master.LineName,
            ST_WO = "Planned",
            YN_URGENT = "N",
            DC_RMK = "SQL integration test",
            CD_USER_REG = "SYSTEM",
            CD_USER_AMD = "SYSTEM"
        },
        Processes = processes
    };

    private static WorkOrderProcess Process(WorkOrderTestMaster master, string number, int processNumber, string processCode, decimal quantity, decimal result, string status = "Waiting") => new()
    {
        CD_FIRM = master.CompanyCode,
        NO_WO = number,
        NO_PROC = processNumber,
        CD_PROC = processCode,
        NM_PROC = processCode == master.ProcessCode1 ? master.ProcessName1 : master.ProcessName2,
        CD_EQUIP = master.EquipmentCode,
        NM_EQUIP = master.EquipmentName,
        QT_PLAN = quantity,
        QT_RESULT = result,
        TM_PLAN_START = "2026-07-20T08:00",
        TM_PLAN_END = "2026-07-20T10:00",
        ST_PROC = status,
        DC_RMK = "SQL integration test",
        CD_USER_REG = "SYSTEM",
        CD_USER_AMD = "SYSTEM"
    };

    private static CreateWorkOrderRequest CreateRequest(WorkOrderTestMaster master, string number, decimal quantity, decimal result) => new()
    {
        Header = new WorkOrderHeaderDto
        {
            CD_FIRM = master.CompanyCode,
            NO_WO = number,
            DT_WO = "2026-07-17",
            CD_ITEM = "ITM-1001",
            NM_ITEM = "Ignored",
            STND_ITEM = "Ignored",
            UNIT_ITEM = "EA",
            QT_WO = quantity,
            QT_RESULT = result,
            DT_PLAN_START = "2026-07-20",
            DT_PLAN_END = "2026-07-21",
            CD_LINE = master.LineCode,
            NM_LINE = "Ignored",
            ST_WO = "Planned",
            YN_URGENT = "N",
            DC_RMK = "SQL integration test"
        },
        Processes =
        [
            new WorkOrderProcessDto
            {
                CD_FIRM = master.CompanyCode,
                NO_WO = number,
                NO_PROC = 10,
                CD_PROC = master.ProcessCode1,
                NM_PROC = "Ignored",
                CD_EQUIP = master.EquipmentCode,
                NM_EQUIP = "Ignored",
                QT_PLAN = quantity,
                QT_RESULT = result,
                TM_PLAN_START = "2026-07-20T08:00",
                TM_PLAN_END = "2026-07-20T10:00",
                ST_PROC = "Waiting",
                DC_RMK = "SQL integration test"
            }
        ]
    };

    private static async Task EnsureTestMasterDataAsync(WorkOrderTestMaster master)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        try
        {
            await ExecuteNonQueryAsync(connection, transaction,
                "INSERT INTO POC.MST_PRODUCTION_LINE(CD_FIRM,CD_LINE,NM_LINE,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@line,@lineName,N'Y',N'SYSTEM',SYSUTCDATETIME(),N'SYSTEM',SYSUTCDATETIME())",
                Text("@firm", master.CompanyCode, 10), Text("@line", master.LineCode, 30), Text("@lineName", master.LineName, 100));
            await ExecuteNonQueryAsync(connection, transaction,
                "INSERT INTO POC.MST_PROCESS(CD_FIRM,CD_PROC,NM_PROC,NO_SEQ,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@process,@processName,@sequence,N'Y',N'SYSTEM',SYSUTCDATETIME(),N'SYSTEM',SYSUTCDATETIME())",
                Text("@firm", master.CompanyCode, 10), Text("@process", master.ProcessCode1, 30), Text("@processName", master.ProcessName1, 100), Integer("@sequence", 10));
            await ExecuteNonQueryAsync(connection, transaction,
                "INSERT INTO POC.MST_PROCESS(CD_FIRM,CD_PROC,NM_PROC,NO_SEQ,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@process,@processName,@sequence,N'Y',N'SYSTEM',SYSUTCDATETIME(),N'SYSTEM',SYSUTCDATETIME())",
                Text("@firm", master.CompanyCode, 10), Text("@process", master.ProcessCode2, 30), Text("@processName", master.ProcessName2, 100), Integer("@sequence", 20));
            await ExecuteNonQueryAsync(connection, transaction,
                "INSERT INTO POC.MST_EQUIPMENT(CD_FIRM,CD_EQUIP,NM_EQUIP,CD_LINE,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD) VALUES(@firm,@equipment,@equipmentName,@line,N'Y',N'SYSTEM',SYSUTCDATETIME(),N'SYSTEM',SYSUTCDATETIME())",
                Text("@firm", master.CompanyCode, 10), Text("@equipment", master.EquipmentCode, 30), Text("@equipmentName", master.EquipmentName, 100), Text("@line", master.LineCode, 30));
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static async Task CleanupTestDataAsync(WorkOrderTestMaster master, string workOrderNo)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync();
        try
        {
            await ExecuteNonQueryAsync(connection, transaction,
                "DELETE FROM POC.PRT_WOPROC WHERE CD_FIRM=@firm AND NO_WO=@number",
                Text("@firm", master.CompanyCode, 10), Text("@number", workOrderNo, 30));
            await ExecuteNonQueryAsync(connection, transaction,
                "DELETE FROM POC.PRT_WO WHERE CD_FIRM=@firm AND NO_WO=@number",
                Text("@firm", master.CompanyCode, 10), Text("@number", workOrderNo, 30));
            await ExecuteNonQueryAsync(connection, transaction,
                "DELETE FROM POC.MST_EQUIPMENT WHERE CD_FIRM=@firm AND CD_EQUIP=@equipment",
                Text("@firm", master.CompanyCode, 10), Text("@equipment", master.EquipmentCode, 30));
            await ExecuteNonQueryAsync(connection, transaction,
                "DELETE FROM POC.MST_PROCESS WHERE CD_FIRM=@firm AND CD_PROC IN (@process1,@process2)",
                Text("@firm", master.CompanyCode, 10), Text("@process1", master.ProcessCode1, 30), Text("@process2", master.ProcessCode2, 30));
            await ExecuteNonQueryAsync(connection, transaction,
                "DELETE FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=@firm AND CD_LINE=@line",
                Text("@firm", master.CompanyCode, 10), Text("@line", master.LineCode, 30));
            await transaction.CommitAsync();
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }

        if (await CountTestDataRowsAsync(master, workOrderNo) != 0)
        {
            throw new InvalidOperationException("Exact SQL integration-test cleanup left residual test data.");
        }
    }

    private static async Task<int> CountWorkOrderRowsAsync(string companyCode, string workOrderNo)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand("SELECT (SELECT COUNT(*) FROM POC.PRT_WO WHERE CD_FIRM=@firm AND NO_WO=@number) + (SELECT COUNT(*) FROM POC.PRT_WOPROC WHERE CD_FIRM=@firm AND NO_WO=@number)", connection);
        command.Parameters.Add(Text("@firm", companyCode, 10));
        command.Parameters.Add(Text("@number", workOrderNo, 30));
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static async Task<int> CountTestDataRowsAsync(WorkOrderTestMaster master, string workOrderNo)
    {
        await using var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new SqlCommand(@"
SELECT
    (SELECT COUNT(*) FROM POC.PRT_WO WHERE CD_FIRM=@firm AND NO_WO=@number) +
    (SELECT COUNT(*) FROM POC.PRT_WOPROC WHERE CD_FIRM=@firm AND NO_WO=@number) +
    (SELECT COUNT(*) FROM POC.MST_EQUIPMENT WHERE CD_FIRM=@firm AND CD_EQUIP=@equipment) +
    (SELECT COUNT(*) FROM POC.MST_PROCESS WHERE CD_FIRM=@firm AND CD_PROC IN (@process1,@process2)) +
    (SELECT COUNT(*) FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=@firm AND CD_LINE=@line);", connection);
        command.Parameters.Add(Text("@firm", master.CompanyCode, 10));
        command.Parameters.Add(Text("@number", workOrderNo, 30));
        command.Parameters.Add(Text("@equipment", master.EquipmentCode, 30));
        command.Parameters.Add(Text("@process1", master.ProcessCode1, 30));
        command.Parameters.Add(Text("@process2", master.ProcessCode2, 30));
        command.Parameters.Add(Text("@line", master.LineCode, 30));
        return Convert.ToInt32(await command.ExecuteScalarAsync());
    }

    private static async Task ExecuteNonQueryAsync(SqlConnection connection, SqlTransaction transaction, string sql, params SqlParameter[] parameters)
    {
        await using var command = new SqlCommand(sql, connection, transaction);
        command.Parameters.AddRange(parameters);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<T> ReadSuccessJsonAsync<T>(HttpResponseMessage response, HttpStatusCode expectedStatus, string requestSummary)
    {
        var body = await response.Content.ReadAsStringAsync();
        AssertExpectedStatusAndJsonContent(response, expectedStatus, requestSummary, body);
        try
        {
            return JsonSerializer.Deserialize<T>(body, JsonOptions)
                ?? throw new XunitException($"{ResponseDiagnostic(response, requestSummary, body)} Response JSON was empty.");
        }
        catch (JsonException exception)
        {
            throw new XunitException($"{ResponseDiagnostic(response, requestSummary, body)} Success DTO deserialization failed: {exception.Message}");
        }
    }

    private static async Task<ApiErrorResponse> ReadErrorJsonAsync(HttpResponseMessage response, HttpStatusCode expectedStatus, string requestSummary)
    {
        var body = await response.Content.ReadAsStringAsync();
        AssertExpectedStatusAndJsonContent(response, expectedStatus, requestSummary, body);
        try
        {
            var error = JsonSerializer.Deserialize<ApiErrorResponse>(body, JsonOptions)
                ?? throw new XunitException($"{ResponseDiagnostic(response, requestSummary, body)} Error response JSON was empty.");
            Assert.False(string.IsNullOrWhiteSpace(error.TraceId), $"{ResponseDiagnostic(response, requestSummary, body)} Error response did not include traceId.");
            return error;
        }
        catch (JsonException exception)
        {
            throw new XunitException($"{ResponseDiagnostic(response, requestSummary, body)} Error DTO deserialization failed: {exception.Message}");
        }
    }

    private static void AssertExpectedStatusAndJsonContent(HttpResponseMessage response, HttpStatusCode expectedStatus, string requestSummary, string body)
    {
        Assert.True(response.StatusCode == expectedStatus, $"{ResponseDiagnostic(response, requestSummary, body)} Expected status {(int)expectedStatus} ({expectedStatus}).");
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
    }

    private static string ResponseDiagnostic(HttpResponseMessage response, string requestSummary, string body) =>
        $"Request: {requestSummary}; Actual status: {(int)response.StatusCode} ({response.StatusCode}); Content-Type: {response.Content.Headers.ContentType}; Response body: {body}";

    private static string DescribeCreateRequest(WorkOrderTestMaster master, string number) =>
        $"POST /api/work-orders; CD_FIRM={master.CompanyCode}; NO_WO={number}; CD_LINE={master.LineCode}; CD_PROC={master.ProcessCode1}; CD_EQUIP={master.EquipmentCode}";

    private static string CreateWorkOrderNumber(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..30];

    private static SqlParameter Text(string name, string value, int size) => new(name, SqlDbType.NVarChar, size) { Value = value };
    private static SqlParameter Integer(string name, int value) => new(name, SqlDbType.Int) { Value = value };

    private sealed record ApiErrorResponse(string? Error, string[]? Errors, string? TraceId);

    private sealed record WorkOrderTestMaster(
        string CompanyCode,
        string LineCode,
        string LineName,
        string ProcessCode1,
        string ProcessName1,
        string ProcessCode2,
        string ProcessName2,
        string EquipmentCode,
        string EquipmentName)
    {
        public static WorkOrderTestMaster Create()
        {
            var id = Guid.NewGuid().ToString("N")[..12];
            return new WorkOrderTestMaster(
                "1000",
                $"E2E-WO-LINE-{id}",
                $"E2E test line {id}",
                $"E2E-WO-PROC1-{id}",
                $"E2E test process 1 {id}",
                $"E2E-WO-PROC2-{id}",
                $"E2E test process 2 {id}",
                $"E2E-WO-EQUIP-{id}",
                $"E2E test equipment {id}");
        }
    }
}
