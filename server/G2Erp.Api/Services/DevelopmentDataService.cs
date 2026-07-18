using System.Globalization;
using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Domain.WorkOrders;
using G2Erp.Api.Repositories;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;

namespace G2Erp.Api.Services;

/// <summary>Development-only manager for the fixed, fictional Sample data set.</summary>
public sealed class DevelopmentDataService(
    IHostEnvironment hostEnvironment,
    IConfiguration configuration,
    IServiceProvider services,
    IItemRepository items,
    IPartnerRepository partners,
    IWarehouseRepository warehouses,
    IProductionLineRepository productionLines,
    IProcessRepository processes,
    IEquipmentRepository equipment,
    ISalesOrderRepository salesOrders,
    IPurchaseOrderRepository purchaseOrders,
    IWorkOrderRepository workOrders) : IDevelopmentDataService
{
    private const string Firm = "1000";
    private const string SafetyMessage = "Test data management is available only in the permitted local development environment.";
    private static readonly string[] AllowedDatabases = ["G2ERP_DEV_LOCAL", "G2ERP_DEV_LOCAL_TEST"];

    public async Task<DevelopmentDataEnvironmentDto> GetStatusAsync(CancellationToken cancellationToken)
    {
        var environment = hostEnvironment.EnvironmentName;
        var mode = configuration["RepositoryMode"] ?? "InMemory";
        if (!hostEnvironment.IsDevelopment()) return Denied(environment, mode, "-", "-", false, "Development environment is required.");
        if (!string.Equals(mode, "InMemory", StringComparison.OrdinalIgnoreCase) && !string.Equals(mode, "SqlServer", StringComparison.OrdinalIgnoreCase))
            return Denied(environment, mode, "-", "-", false, "RepositoryMode must be InMemory or SqlServer.");
        if (string.Equals(mode, "InMemory", StringComparison.OrdinalIgnoreCase))
            return Allowed(environment, "InMemory", "InMemory", "InMemory", true, "InMemory data is cleared when the API restarts.");

        var factory = services.GetService<SqlServerConnectionFactory>();
        if (factory is null) return Denied(environment, mode, "-", "-", false, "SqlServer connection factory is not configured.");
        try
        {
            await using var connection = factory.Create();
            await connection.OpenAsync(cancellationToken);
            await using var command = new SqlCommand("SELECT DB_NAME(), CONVERT(nvarchar(256), SERVERPROPERTY('ServerName')), SUSER_SNAME()", connection);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Denied(environment, mode, "-", "-", false, "Unable to verify the SQL Server target.");
            var database = reader.IsDBNull(0) ? "" : reader.GetString(0);
            var server = reader.IsDBNull(1) ? "" : reader.GetString(1);
            var isAllowedDatabase = AllowedDatabases.Contains(database, StringComparer.OrdinalIgnoreCase);
            var isLocal = IsLocalConfiguredServer();
            return isAllowedDatabase && isLocal
                ? Allowed(environment, mode, server, database, true, "Local SQL Server target verified.")
                : Denied(environment, mode, server, database, isLocal, "The SQL Server target is not an allowed local development database.");
        }
        catch
        {
            return Denied(environment, mode, "-", "-", false, "Unable to verify the SQL Server target.");
        }
    }

    public async Task<DevelopmentDataSummaryDto> GetSummaryAsync(CancellationToken cancellationToken)
    {
        var status = await GetStatusAsync(cancellationToken);
        if (!status.IsAllowed) return EmptySummary(status, "Access blocked");
        var allItems = await items.GetAllAsync(cancellationToken);
        var allLines = await productionLines.GetAllAsync(null, null, null, cancellationToken);
        var allProcesses = await processes.GetAllAsync(null, null, null, cancellationToken);
        var allEquipment = await equipment.GetAllAsync(null, null, null, null, cancellationToken);
        var allSales = await salesOrders.GetAllAsync(cancellationToken);
        var allPurchase = await purchaseOrders.GetAllAsync(new PurchaseOrderSearch(null, null, null, null, null, null), cancellationToken);
        var allWork = await workOrders.GetAllAsync(new WorkOrderSearch(null, null, null, null, null, null, null, null), cancellationToken);
        var e2e = CountE2ERemnants(allItems, allLines, allProcesses, allEquipment, allSales, allPurchase, allWork);
        return new DevelopmentDataSummaryDto
        {
            Environment = status,
            SampleItems = allItems.Count(x => StartsWith(x.CD_ITEM, "ITEM-SMP-")),
            SampleProductionLines = allLines.Count(x => StartsWith(x.CD_LINE, "LINE-SMP-")),
            SampleProcesses = allProcesses.Count(x => StartsWith(x.CD_PROC, "PROC-SMP-")),
            SampleEquipment = allEquipment.Count(x => StartsWith(x.CD_EQUIP, "EQ-SMP-")),
            SampleSalesOrders = allSales.Count(x => StartsWith(x.Header.NO_SO, "SO-SAMPLE-")),
            SampleSalesOrderLines = allSales.Where(x => StartsWith(x.Header.NO_SO, "SO-SAMPLE-")).Sum(x => x.Lines.Count),
            SamplePurchaseOrders = allPurchase.Count(x => StartsWith(x.Header.NO_PO, "PO-SAMPLE-")),
            SamplePurchaseOrderLines = allPurchase.Where(x => StartsWith(x.Header.NO_PO, "PO-SAMPLE-")).Sum(x => x.Lines.Count),
            SampleWorkOrders = allWork.Count(x => StartsWith(x.Header.NO_WO, "WO-SAMPLE-")),
            SampleWorkOrderProcesses = allWork.Where(x => StartsWith(x.Header.NO_WO, "WO-SAMPLE-")).Sum(x => x.Processes.Count),
            E2ERemnantRows = e2e,
            Status = "Healthy"
        };
    }

    public async Task<DevelopmentDataPreviewDto> PreviewAsync(DevelopmentDataRequest request, CancellationToken cancellationToken)
    {
        var status = await EnsureAllowedAsync(cancellationToken);
        var scope = NormalizeScope(request.Scope);
        var inspection = await InspectAsync(scope, cancellationToken);
        return new DevelopmentDataPreviewDto
        {
            Scope = scope,
            Environment = status,
            ExistingRows = inspection.ExistingRows,
            NewRows = inspection.NewRows,
            ConflictRows = inspection.Conflicts.Count,
            Conflicts = inspection.Conflicts,
            AffectedTables = inspection.Tables.OrderBy(x => x).ToArray(),
            DeletesData = false
        };
    }

    public async Task<DevelopmentDataOperationDto> SeedAsync(string requestedScope, CancellationToken cancellationToken)
    {
        await EnsureAllowedAsync(cancellationToken);
        var scope = NormalizeScope(requestedScope);
        var inspection = await InspectAsync(scope, cancellationToken);
        if (inspection.Conflicts.Count > 0) return Operation("seed", scope, "Blocked", 0, 0, inspection.ExistingRows, inspection.Conflicts.Count, "Conflicting Sample keys were found. No data was changed.");

        var created = 0;
        if (scope is "production-masters" or "all") created += await SeedProductionMastersAsync(cancellationToken);
        if (scope is "sales-orders" or "all") { created += await SeedCommercialMastersAsync(includeWarehouse: false, cancellationToken); created += await SeedSalesOrdersAsync(cancellationToken); }
        if (scope is "purchase-orders" or "all") { created += await SeedCommercialMastersAsync(includeWarehouse: true, cancellationToken); created += await SeedPurchaseOrdersAsync(cancellationToken); }
        if (scope is "work-orders" or "all")
        {
            if (!await HasWorkOrderPrerequisitesAsync(cancellationToken))
                return Operation("seed", scope, "Blocked", created, 0, inspection.ExistingRows, 0, "Production Sample masters are required before creating work orders.");
            created += await SeedWorkOrdersAsync(cancellationToken);
        }
        return Operation("seed", scope, "Success", created, 0, inspection.ExistingRows, 0, created == 0 ? "Matching Sample data already exists; no rows were changed." : "Sample data was created safely.");
    }

    public async Task<DevelopmentDataOperationDto> CleanupAsync(DevelopmentDataRequest request, CancellationToken cancellationToken)
    {
        await EnsureAllowedAsync(cancellationToken);
        var scope = NormalizeScope(request.Scope);
        if (!string.Equals(request.ConfirmationText, "SAMPLE DELETE", StringComparison.Ordinal))
            return Operation("cleanup", scope, "Blocked", 0, 0, 0, 0, "Enter SAMPLE DELETE exactly to run cleanup.");

        var deleted = 0;
        if (scope is "sales-orders" or "all") deleted += await DeleteSalesSamplesAsync(cancellationToken);
        if (scope is "purchase-orders" or "all") deleted += await DeletePurchaseSamplesAsync(cancellationToken);
        if (scope is "work-orders" or "all") deleted += await DeleteWorkSamplesAsync(cancellationToken);
        if (scope is "production-masters" or "all")
        {
            if (await HasSampleBusinessRowsAsync(cancellationToken))
                return Operation("cleanup", scope, "Blocked", 0, deleted, 0, 0, "Clean up Sample sales, purchase, and work orders before removing Sample masters.");
            deleted += await DeleteProductionMastersAsync(cancellationToken);
        }
        return Operation("cleanup", scope, "Success", 0, deleted, 0, 0, deleted == 0 ? "No matching Sample rows were found." : "Only fixed Sample Prefix rows were deleted.");
    }

    public async Task<DevelopmentDataE2ERemnantsDto> GetE2ERemnantsAsync(CancellationToken cancellationToken)
    {
        await EnsureAllowedAsync(cancellationToken);
        var result = new List<DevelopmentDataRemnantRowDto>();
        var allItems = await items.GetAllAsync(cancellationToken);
        var allLines = await productionLines.GetAllAsync(null, null, null, cancellationToken);
        var allProcesses = await processes.GetAllAsync(null, null, null, cancellationToken);
        var allEquipment = await equipment.GetAllAsync(null, null, null, null, cancellationToken);
        var allSales = await salesOrders.GetAllAsync(cancellationToken);
        var allPurchase = await purchaseOrders.GetAllAsync(new PurchaseOrderSearch(null, null, null, null, null, null), cancellationToken);
        var allWork = await workOrders.GetAllAsync(new WorkOrderSearch(null, null, null, null, null, null, null, null), cancellationToken);
        result.AddRange(allItems.Where(x => StartsWith(x.CD_ITEM, "E2E-")).Select(x => Remnant("POC.MA_ITEM", x.CD_ITEM)));
        result.AddRange(allLines.Where(x => StartsWith(x.CD_LINE, "E2E-")).Select(x => Remnant("POC.MST_PRODUCTION_LINE", x.CD_LINE)));
        result.AddRange(allProcesses.Where(x => StartsWith(x.CD_PROC, "E2E-")).Select(x => Remnant("POC.MST_PROCESS", x.CD_PROC)));
        result.AddRange(allEquipment.Where(x => StartsWith(x.CD_EQUIP, "E2E-")).Select(x => Remnant("POC.MST_EQUIPMENT", x.CD_EQUIP)));
        result.AddRange(allSales.Where(x => StartsWith(x.Header.NO_SO, "E2E-")).Select(x => Remnant("POC.SAL_SOH", x.Header.NO_SO)));
        result.AddRange(allPurchase.Where(x => StartsWith(x.Header.NO_PO, "E2E-")).Select(x => Remnant("POC.PUR_POH", x.Header.NO_PO)));
        result.AddRange(allWork.Where(x => StartsWith(x.Header.NO_WO, "E2E-")).Select(x => Remnant("POC.PRT_WO", x.Header.NO_WO)));
        return new DevelopmentDataE2ERemnantsDto { TotalRows = result.Count, Rows = result.OrderBy(x => x.Table).ThenBy(x => x.Key).ToArray() };
    }

    private async Task<DevelopmentDataEnvironmentDto> EnsureAllowedAsync(CancellationToken cancellationToken)
    {
        var status = await GetStatusAsync(cancellationToken);
        if (!status.IsAllowed) throw new DevelopmentDataAccessException(SafetyMessage);
        return status;
    }

    private async Task<Inspection> InspectAsync(string scope, CancellationToken cancellationToken)
    {
        var result = new Inspection();
        if (scope is "production-masters" or "sales-orders" or "purchase-orders" or "all") await InspectCommercialMastersAsync(result, scope is "production-masters" or "all", scope is "purchase-orders" or "all", cancellationToken);
        if (scope is "work-orders" or "all")
        {
            foreach (var workOrder in SampleData.WorkOrders) await InspectWorkOrderAsync(result, workOrder, cancellationToken);
        }
        if (scope is "sales-orders" or "all") foreach (var salesOrder in SampleData.SalesOrders) await InspectSalesOrderAsync(result, salesOrder, cancellationToken);
        if (scope is "purchase-orders" or "all") foreach (var purchaseOrder in SampleData.PurchaseOrders) await InspectPurchaseOrderAsync(result, purchaseOrder, cancellationToken);
        return result;
    }

    private async Task InspectCommercialMastersAsync(Inspection result, bool includeProductionMasters, bool includeWarehouse, CancellationToken ct)
    {
        foreach (var item in SampleData.Items) await InspectAsync(result, await items.GetAsync(item.CD_FIRM, item.CD_ITEM, ct), item, Same, "POC.MA_ITEM", item.CD_ITEM, 1);
        foreach (var partner in SampleData.Partners) await InspectAsync(result, await partners.GetAsync(partner.CD_FIRM, partner.CD_PARTNER, ct), partner, Same, "POC.MA_PARTNER", partner.CD_PARTNER, 1);
        if (includeWarehouse) foreach (var warehouse in SampleData.Warehouses) await InspectAsync(result, await warehouses.GetAsync(warehouse.CD_FIRM, warehouse.CD_WH, ct), warehouse, Same, "POC.MA_WH", warehouse.CD_WH, 1);
        if (!includeProductionMasters) return;
        foreach (var line in SampleData.Lines) await InspectAsync(result, await productionLines.GetAsync(line.CD_FIRM, line.CD_LINE, ct), line, Same, "POC.MST_PRODUCTION_LINE", line.CD_LINE, 1);
        foreach (var process in SampleData.Processes) await InspectAsync(result, await processes.GetAsync(process.CD_FIRM, process.CD_PROC, ct), process, Same, "POC.MST_PROCESS", process.CD_PROC, 1);
        foreach (var machine in SampleData.Equipment) await InspectAsync(result, await equipment.GetAsync(machine.CD_FIRM, machine.CD_EQUIP, ct), machine, Same, "POC.MST_EQUIPMENT", machine.CD_EQUIP, 1);
    }

    private async Task InspectSalesOrderAsync(Inspection result, SalesOrder expected, CancellationToken ct) => await InspectAsync(result, await salesOrders.GetAsync(expected.Header.CD_FIRM, expected.Header.NO_SO, ct), expected, Same, "POC.SAL_SOH/POC.SAL_SOL", expected.Header.NO_SO, 1 + expected.Lines.Count);
    private async Task InspectPurchaseOrderAsync(Inspection result, PurchaseOrder expected, CancellationToken ct) => await InspectAsync(result, await purchaseOrders.GetAsync(expected.Header.CD_FIRM, expected.Header.NO_PO, ct), expected, Same, "POC.PUR_POH/POC.PUR_POL", expected.Header.NO_PO, 1 + expected.Lines.Count);
    private async Task InspectWorkOrderAsync(Inspection result, WorkOrder expected, CancellationToken ct) => await InspectAsync(result, await workOrders.GetAsync(expected.Header.CD_FIRM, expected.Header.NO_WO, ct), expected, Same, "POC.PRT_WO/POC.PRT_WOPROC", expected.Header.NO_WO, 1 + expected.Processes.Count);

    private static Task InspectAsync<T>(Inspection result, T? actual, T expected, Func<T, T, bool> same, string table, string key, int rows) where T : class
    {
        result.Tables.Add(table);
        if (actual is null) result.NewRows += rows;
        else if (same(actual, expected)) result.ExistingRows += rows;
        else result.Conflicts.Add($"{table}: {key}");
        return Task.CompletedTask;
    }

    private async Task<int> SeedProductionMastersAsync(CancellationToken ct)
    {
        var created = 0;
        foreach (var item in SampleData.Items) if (await items.GetAsync(item.CD_FIRM, item.CD_ITEM, ct) is null) { await items.AddAsync(item, ct); created++; }
        foreach (var line in SampleData.Lines) if (await productionLines.GetAsync(line.CD_FIRM, line.CD_LINE, ct) is null) { await productionLines.AddAsync(line, ct); created++; }
        foreach (var process in SampleData.Processes) if (await processes.GetAsync(process.CD_FIRM, process.CD_PROC, ct) is null) { await processes.AddAsync(process, ct); created++; }
        foreach (var machine in SampleData.Equipment) if (await equipment.GetAsync(machine.CD_FIRM, machine.CD_EQUIP, ct) is null) { await equipment.AddAsync(machine, ct); created++; }
        return created;
    }

    private async Task<int> SeedCommercialMastersAsync(bool includeWarehouse, CancellationToken ct)
    {
        var created = 0;
        foreach (var item in SampleData.Items) if (await items.GetAsync(item.CD_FIRM, item.CD_ITEM, ct) is null) { await items.AddAsync(item, ct); created++; }
        foreach (var partner in SampleData.Partners) if (await partners.GetAsync(partner.CD_FIRM, partner.CD_PARTNER, ct) is null) { await partners.AddAsync(partner, ct); created++; }
        if (includeWarehouse) foreach (var warehouse in SampleData.Warehouses) if (await warehouses.GetAsync(warehouse.CD_FIRM, warehouse.CD_WH, ct) is null) { await warehouses.AddAsync(warehouse, ct); created++; }
        return created;
    }

    private async Task<int> SeedSalesOrdersAsync(CancellationToken ct)
    {
        var created = 0;
        foreach (var order in SampleData.SalesOrders) if (await salesOrders.GetAsync(order.Header.CD_FIRM, order.Header.NO_SO, ct) is null) { await salesOrders.AddAsync(order, ct); created += 1 + order.Lines.Count; }
        return created;
    }

    private async Task<int> SeedPurchaseOrdersAsync(CancellationToken ct)
    {
        var created = 0;
        foreach (var order in SampleData.PurchaseOrders) if (await purchaseOrders.GetAsync(order.Header.CD_FIRM, order.Header.NO_PO, ct) is null) { await purchaseOrders.AddAsync(order, ct); created += 1 + order.Lines.Count; }
        return created;
    }

    private async Task<int> SeedWorkOrdersAsync(CancellationToken ct)
    {
        ValidateWorkOrderSampleDates(SampleData.WorkOrders);
        var created = 0;
        foreach (var order in SampleData.WorkOrders) if (await workOrders.GetAsync(order.Header.CD_FIRM, order.Header.NO_WO, ct) is null) { await workOrders.AddAsync(order, ct); created += 1 + order.Processes.Count; }
        return created;
    }

    internal static void ValidateWorkOrderSampleDates(IEnumerable<WorkOrder> orders)
    {
        foreach (var order in orders)
        {
            var header = order.Header;
            var workOrderDate = ParseDate(header, null, "DT_WO", header.DT_WO);
            var planStart = ParseDate(header, null, "DT_PLAN_START", header.DT_PLAN_START);
            var planEnd = ParseDate(header, null, "DT_PLAN_END", header.DT_PLAN_END);
            if (planStart > planEnd) ThrowDateValidation(header.NO_WO, null, "DT_PLAN_START/DT_PLAN_END", $"{header.DT_PLAN_START}/{header.DT_PLAN_END}");
            if (workOrderDate > planEnd) ThrowDateValidation(header.NO_WO, null, "DT_WO/DT_PLAN_END", $"{header.DT_WO}/{header.DT_PLAN_END}");

            DateTime? previousStart = null;
            DateTime? previousEnd = null;
            foreach (var process in order.Processes.OrderBy(x => x.NO_PROC))
            {
                var processStart = ParseDateTime(header, process.NO_PROC, "TM_PLAN_START", process.TM_PLAN_START);
                var processEnd = ParseDateTime(header, process.NO_PROC, "TM_PLAN_END", process.TM_PLAN_END);
                if (processStart > processEnd) ThrowDateValidation(header.NO_WO, process.NO_PROC, "TM_PLAN_START/TM_PLAN_END", $"{process.TM_PLAN_START}/{process.TM_PLAN_END}");
                if (DateOnly.FromDateTime(processStart) < planStart || DateOnly.FromDateTime(processEnd) > planEnd)
                    ThrowDateValidation(header.NO_WO, process.NO_PROC, "TM_PLAN_RANGE", $"{process.TM_PLAN_START}/{process.TM_PLAN_END}");
                if (previousStart is not null && processStart < previousStart)
                    ThrowDateValidation(header.NO_WO, process.NO_PROC, "TM_PLAN_START_ORDER", process.TM_PLAN_START);
                if (previousEnd is not null && processEnd < previousEnd)
                    ThrowDateValidation(header.NO_WO, process.NO_PROC, "TM_PLAN_END_ORDER", process.TM_PLAN_END);
                previousStart = processStart;
                previousEnd = processEnd;
            }
        }
    }

    private static DateOnly ParseDate(WorkOrderHeader header, int? processNo, string field, string value)
    {
        if (DateOnly.TryParseExact(value, SampleData.SampleDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var result)) return result;
        ThrowDateValidation(header.NO_WO, processNo, field, value);
        return default;
    }

    private static DateTime ParseDateTime(WorkOrderHeader header, int? processNo, string field, string value)
    {
        if (DateTime.TryParseExact(value, SampleData.SampleDateTimeFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var result)) return result;
        ThrowDateValidation(header.NO_WO, processNo, field, value);
        return default;
    }

    private static void ThrowDateValidation(string workOrderNo, int? processNo, string field, string value) =>
        throw new InvalidOperationException($"Invalid Sample work-order date: NO_WO={workOrderNo}; NO_PROC={processNo?.ToString(CultureInfo.InvariantCulture) ?? "-"}; Field={field}; Value={value}");

    private async Task<int> DeleteSalesSamplesAsync(CancellationToken ct)
    {
        var deleted = 0;
        foreach (var order in (await salesOrders.GetAllAsync(ct)).Where(x => StartsWith(x.Header.NO_SO, "SO-SAMPLE-")).ToArray()) if (await salesOrders.DeleteAsync(order.Header.CD_FIRM, order.Header.NO_SO, ct)) deleted += 1 + order.Lines.Count;
        return deleted;
    }

    private async Task<int> DeletePurchaseSamplesAsync(CancellationToken ct)
    {
        var deleted = 0;
        foreach (var order in (await purchaseOrders.GetAllAsync(new PurchaseOrderSearch(null, null, null, null, null, null), ct)).Where(x => StartsWith(x.Header.NO_PO, "PO-SAMPLE-")).ToArray()) if (await purchaseOrders.DeleteAsync(order.Header.CD_FIRM, order.Header.NO_PO, ct)) deleted += 1 + order.Lines.Count;
        return deleted;
    }

    private async Task<int> DeleteWorkSamplesAsync(CancellationToken ct)
    {
        var deleted = 0;
        foreach (var order in (await workOrders.GetAllAsync(new WorkOrderSearch(null, null, null, null, null, null, null, null), ct)).Where(x => StartsWith(x.Header.NO_WO, "WO-SAMPLE-")).ToArray()) if (await workOrders.DeleteAsync(order.Header.CD_FIRM, order.Header.NO_WO, ct)) deleted += 1 + order.Processes.Count;
        return deleted;
    }

    private async Task<int> DeleteProductionMastersAsync(CancellationToken ct)
    {
        var deleted = 0;
        foreach (var machine in (await equipment.GetAllAsync(null, null, null, null, ct)).Where(x => StartsWith(x.CD_EQUIP, "EQ-SMP-")).ToArray()) if (await equipment.DeleteAsync(machine.CD_FIRM, machine.CD_EQUIP, ct)) deleted++;
        foreach (var process in (await processes.GetAllAsync(null, null, null, ct)).Where(x => StartsWith(x.CD_PROC, "PROC-SMP-")).ToArray()) if (await processes.DeleteAsync(process.CD_FIRM, process.CD_PROC, ct)) deleted++;
        foreach (var line in (await productionLines.GetAllAsync(null, null, null, ct)).Where(x => StartsWith(x.CD_LINE, "LINE-SMP-")).ToArray()) if (await productionLines.DeleteAsync(line.CD_FIRM, line.CD_LINE, ct)) deleted++;
        foreach (var item in (await items.GetAllAsync(ct)).Where(x => StartsWith(x.CD_ITEM, "ITEM-SMP-")).ToArray()) if (await items.DeleteAsync(item.CD_FIRM, item.CD_ITEM, ct)) deleted++;
        foreach (var warehouse in (await warehouses.GetAllAsync(ct)).Where(x => StartsWith(x.CD_WH, "WH-SMP-")).ToArray()) if (await warehouses.DeleteAsync(warehouse.CD_FIRM, warehouse.CD_WH, ct)) deleted++;
        foreach (var partner in (await partners.GetAllAsync(ct)).Where(x => StartsWith(x.CD_PARTNER, "PARTNER-SMP-")).ToArray()) if (await partners.DeleteAsync(partner.CD_FIRM, partner.CD_PARTNER, ct)) deleted++;
        return deleted;
    }

    private async Task<bool> HasWorkOrderPrerequisitesAsync(CancellationToken ct) =>
        (await Task.WhenAll(SampleData.Items.Select(x => items.GetAsync(x.CD_FIRM, x.CD_ITEM, ct)))).All(x => x?.YN_USE == "Y") &&
        (await Task.WhenAll(SampleData.Lines.Select(x => productionLines.GetAsync(x.CD_FIRM, x.CD_LINE, ct)))).All(x => x?.YN_USE == "Y") &&
        (await Task.WhenAll(SampleData.Processes.Select(x => processes.GetAsync(x.CD_FIRM, x.CD_PROC, ct)))).All(x => x?.YN_USE == "Y") &&
        (await Task.WhenAll(SampleData.Equipment.Select(x => equipment.GetAsync(x.CD_FIRM, x.CD_EQUIP, ct)))).All(x => x?.YN_USE == "Y");

    private async Task<bool> HasSampleBusinessRowsAsync(CancellationToken ct) =>
        (await salesOrders.GetAllAsync(ct)).Any(x => StartsWith(x.Header.NO_SO, "SO-SAMPLE-")) ||
        (await purchaseOrders.GetAllAsync(new PurchaseOrderSearch(null, null, null, null, null, null), ct)).Any(x => StartsWith(x.Header.NO_PO, "PO-SAMPLE-")) ||
        (await workOrders.GetAllAsync(new WorkOrderSearch(null, null, null, null, null, null, null, null), ct)).Any(x => StartsWith(x.Header.NO_WO, "WO-SAMPLE-"));

    private bool IsLocalConfiguredServer()
    {
        var connectionString = configuration.GetConnectionString("G2Erp");
        if (string.IsNullOrWhiteSpace(connectionString)) return false;
        var source = new SqlConnectionStringBuilder(connectionString).DataSource.Trim();
        if (source.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase)) source = source[4..];
        var host = source.Split([',', '\\'], 2)[0].Trim();
        return host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.Equals("127.0.0.1", StringComparison.Ordinal) || host.Equals(".", StringComparison.Ordinal) || host.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeScope(string? scope) => scope?.Trim().ToLowerInvariant() switch
    {
        "production-masters" => "production-masters",
        "sales-orders" => "sales-orders",
        "purchase-orders" => "purchase-orders",
        "work-orders" => "work-orders",
        _ => "all"
    };

    private static bool StartsWith(string value, string prefix) => value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase);
    private static DevelopmentDataRemnantRowDto Remnant(string table, string key) => new() { Table = table, Key = key, Prefix = "E2E-*" };
    private static int CountE2ERemnants(IEnumerable<Item> itemRows, IEnumerable<ProductionLine> lineRows, IEnumerable<ProductionProcess> processRows, IEnumerable<Equipment> equipmentRows, IEnumerable<SalesOrder> salesRows, IEnumerable<PurchaseOrder> purchaseRows, IEnumerable<WorkOrder> workRows) => itemRows.Count(x => StartsWith(x.CD_ITEM, "E2E-")) + lineRows.Count(x => StartsWith(x.CD_LINE, "E2E-")) + processRows.Count(x => StartsWith(x.CD_PROC, "E2E-")) + equipmentRows.Count(x => StartsWith(x.CD_EQUIP, "E2E-")) + salesRows.Count(x => StartsWith(x.Header.NO_SO, "E2E-")) + purchaseRows.Count(x => StartsWith(x.Header.NO_PO, "E2E-")) + workRows.Count(x => StartsWith(x.Header.NO_WO, "E2E-"));
    private static DevelopmentDataEnvironmentDto Allowed(string environment, string mode, string server, string database, bool local, string message) => new() { Environment = environment, RepositoryMode = mode, Server = server, Database = database, IsLocal = local, IsAllowed = true, SafetyStatus = "Allowed", Message = message, GeneratedAt = DateTime.UtcNow };
    private static DevelopmentDataEnvironmentDto Denied(string environment, string mode, string server, string database, bool local, string message) => new() { Environment = environment, RepositoryMode = mode, Server = server, Database = database, IsLocal = local, IsAllowed = false, SafetyStatus = "Blocked", Message = message, GeneratedAt = DateTime.UtcNow };
    private static DevelopmentDataSummaryDto EmptySummary(DevelopmentDataEnvironmentDto status, string state) => new() { Environment = status, SampleItems = 0, SampleProductionLines = 0, SampleProcesses = 0, SampleEquipment = 0, SampleSalesOrders = 0, SampleSalesOrderLines = 0, SamplePurchaseOrders = 0, SamplePurchaseOrderLines = 0, SampleWorkOrders = 0, SampleWorkOrderProcesses = 0, E2ERemnantRows = 0, Status = state };
    private static DevelopmentDataOperationDto Operation(string operation, string scope, string status, int created, int deleted, int skipped, int conflicts, string message) => new() { Operation = operation, Scope = scope, Status = status, CreatedRows = created, DeletedRows = deleted, SkippedRows = skipped, ConflictRows = conflicts, Message = message, ExecutedAt = DateTime.UtcNow };
    private static bool Same(Item actual, Item expected) => actual.CD_FIRM == expected.CD_FIRM && actual.CD_ITEM == expected.CD_ITEM && actual.NM_ITEM == expected.NM_ITEM && actual.STND_ITEM == expected.STND_ITEM && actual.UNIT_ITEM == expected.UNIT_ITEM && actual.YN_USE == expected.YN_USE;
    private static bool Same(Partner actual, Partner expected) => actual.CD_FIRM == expected.CD_FIRM && actual.CD_PARTNER == expected.CD_PARTNER && actual.NM_PARTNER == expected.NM_PARTNER && actual.NO_COMPANY == expected.NO_COMPANY && actual.YN_USE == expected.YN_USE;
    private static bool Same(Warehouse actual, Warehouse expected) => actual.CD_FIRM == expected.CD_FIRM && actual.CD_WH == expected.CD_WH && actual.NM_WH == expected.NM_WH && actual.YN_USE == expected.YN_USE;
    private static bool Same(ProductionLine actual, ProductionLine expected) => actual.CD_FIRM == expected.CD_FIRM && actual.CD_LINE == expected.CD_LINE && actual.NM_LINE == expected.NM_LINE && actual.YN_USE == expected.YN_USE;
    private static bool Same(ProductionProcess actual, ProductionProcess expected) => actual.CD_FIRM == expected.CD_FIRM && actual.CD_PROC == expected.CD_PROC && actual.NM_PROC == expected.NM_PROC && actual.NO_SEQ == expected.NO_SEQ && actual.YN_USE == expected.YN_USE;
    private static bool Same(Equipment actual, Equipment expected) => actual.CD_FIRM == expected.CD_FIRM && actual.CD_EQUIP == expected.CD_EQUIP && actual.NM_EQUIP == expected.NM_EQUIP && actual.CD_LINE == expected.CD_LINE && actual.YN_USE == expected.YN_USE;
    private static bool Same(SalesOrder actual, SalesOrder expected) => actual.Header.CD_FIRM == expected.Header.CD_FIRM && actual.Header.NO_SO == expected.Header.NO_SO && actual.Header.DT_SO == expected.Header.DT_SO && actual.Header.CD_PARTNER == expected.Header.CD_PARTNER && actual.Header.NM_PARTNER == expected.Header.NM_PARTNER && actual.Header.ST_SO == expected.Header.ST_SO && actual.Header.CD_EMP == expected.Header.CD_EMP && actual.Header.DC_RMK == expected.Header.DC_RMK && actual.Header.MAIL_ID == expected.Header.MAIL_ID && actual.Lines.SequenceEqual(expected.Lines);
    private static bool Same(PurchaseOrder actual, PurchaseOrder expected) => actual.Header.CD_FIRM == expected.Header.CD_FIRM && actual.Header.NO_PO == expected.Header.NO_PO && actual.Header.DT_PO == expected.Header.DT_PO && actual.Header.CD_PARTNER == expected.Header.CD_PARTNER && actual.Header.NM_PARTNER == expected.Header.NM_PARTNER && actual.Header.CD_EMP == expected.Header.CD_EMP && actual.Header.NM_EMP == expected.Header.NM_EMP && actual.Header.CD_CURRENCY == expected.Header.CD_CURRENCY && actual.Header.RT_EXCHANGE == expected.Header.RT_EXCHANGE && actual.Header.ST_PO == expected.Header.ST_PO && actual.Header.DC_RMK == expected.Header.DC_RMK && actual.Lines.Count == expected.Lines.Count && actual.Lines.Zip(expected.Lines).All(x => Same(x.First, x.Second));
    private static bool Same(WorkOrder actual, WorkOrder expected) => actual.Header.CD_FIRM == expected.Header.CD_FIRM && actual.Header.NO_WO == expected.Header.NO_WO && actual.Header.DT_WO == expected.Header.DT_WO && actual.Header.CD_ITEM == expected.Header.CD_ITEM && actual.Header.NM_ITEM == expected.Header.NM_ITEM && actual.Header.STND_ITEM == expected.Header.STND_ITEM && actual.Header.UNIT_ITEM == expected.Header.UNIT_ITEM && actual.Header.CD_LINE == expected.Header.CD_LINE && actual.Header.NM_LINE == expected.Header.NM_LINE && actual.Header.QT_WO == expected.Header.QT_WO && actual.Header.QT_RESULT == expected.Header.QT_RESULT && actual.Header.DT_PLAN_START == expected.Header.DT_PLAN_START && actual.Header.DT_PLAN_END == expected.Header.DT_PLAN_END && actual.Header.ST_WO == expected.Header.ST_WO && actual.Header.YN_URGENT == expected.Header.YN_URGENT && actual.Header.DC_RMK == expected.Header.DC_RMK && actual.Processes.Count == expected.Processes.Count && actual.Processes.Zip(expected.Processes).All(x => Same(x.First, x.Second));
    private static bool Same(PurchaseOrderLine actual, PurchaseOrderLine expected) => actual.CD_FIRM == expected.CD_FIRM && actual.NO_PO == expected.NO_PO && actual.NO_LINE == expected.NO_LINE && actual.CD_ITEM == expected.CD_ITEM && actual.NM_ITEM == expected.NM_ITEM && actual.STND_ITEM == expected.STND_ITEM && actual.UNIT_ITEM == expected.UNIT_ITEM && actual.QT_PO == expected.QT_PO && actual.UM_PO == expected.UM_PO && actual.AM_SUPPLY == expected.AM_SUPPLY && actual.AM_VAT == expected.AM_VAT && actual.AM_TOTAL == expected.AM_TOTAL && actual.DT_DLV == expected.DT_DLV && actual.CD_WH == expected.CD_WH && actual.NM_WH == expected.NM_WH && actual.DC_RMK == expected.DC_RMK;
    private static bool Same(WorkOrderProcess actual, WorkOrderProcess expected) => actual.CD_FIRM == expected.CD_FIRM && actual.NO_WO == expected.NO_WO && actual.NO_PROC == expected.NO_PROC && actual.CD_PROC == expected.CD_PROC && actual.NM_PROC == expected.NM_PROC && actual.CD_EQUIP == expected.CD_EQUIP && actual.NM_EQUIP == expected.NM_EQUIP && actual.QT_PLAN == expected.QT_PLAN && actual.QT_RESULT == expected.QT_RESULT && actual.TM_PLAN_START == expected.TM_PLAN_START && actual.TM_PLAN_END == expected.TM_PLAN_END && actual.ST_PROC == expected.ST_PROC && actual.DC_RMK == expected.DC_RMK;

    private sealed class Inspection
    {
        public int ExistingRows { get; set; }
        public int NewRows { get; set; }
        public List<string> Conflicts { get; } = [];
        public HashSet<string> Tables { get; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
