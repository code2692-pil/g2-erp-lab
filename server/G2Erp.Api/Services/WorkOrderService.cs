using G2Erp.Api.Contracts;
using G2Erp.Api.Domain.WorkOrders;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class WorkOrderService(
    IWorkOrderRepository workOrders,
    IItemRepository items,
    IProductionLineRepository productionLines,
    IProcessRepository processes,
    IEquipmentRepository equipment) : IWorkOrderService
{
    public async Task<IReadOnlyList<WorkOrderDetailDto>> GetAllAsync(string? companyCode, string? dateFrom, string? dateTo, string? workOrderNo, string? item, string? productionLine, string? status, string? urgent, CancellationToken ct) =>
        (await workOrders.GetAllAsync(new WorkOrderSearch(companyCode, dateFrom, dateTo, workOrderNo, item, productionLine, status, urgent), ct)).Select(ToDto).ToArray();

    public async Task<WorkOrderDetailDto?> GetAsync(string companyCode, string workOrderNo, CancellationToken ct)
    {
        var workOrder = await workOrders.GetAsync(companyCode, workOrderNo, ct);
        return workOrder is null ? null : ToDto(workOrder);
    }

    public async Task<WorkOrderDetailDto> CreateAsync(CreateWorkOrderRequest request, CancellationToken ct)
    {
        var workOrder = await BuildAsync(request.Header, request.Processes, null, ct);
        workOrder = await AssignApiNumberAsync(workOrder, ct);
        if (await workOrders.ExistsAsync(workOrder.Header.CD_FIRM, workOrder.Header.NO_WO, ct))
        {
            throw new DomainConflictException("The header primary key (CD_FIRM, NO_WO) already exists.");
        }

        await workOrders.AddAsync(workOrder, ct);
        return ToDto(workOrder);
    }

    public async Task<WorkOrderDetailDto> UpdateAsync(string companyCode, string workOrderNo, UpdateWorkOrderRequest request, CancellationToken ct)
    {
        if (request.Header.CD_FIRM != companyCode || request.Header.NO_WO != workOrderNo)
        {
            throw new DomainValidationException(["The route primary key must match Header.CD_FIRM and Header.NO_WO."]);
        }

        var existing = await workOrders.GetAsync(companyCode, workOrderNo, ct);
        if (existing is null) throw new KeyNotFoundException("Work order not found.");
        var workOrder = await BuildAsync(request.Header, request.Processes, existing, ct);
        await workOrders.UpdateAsync(workOrder, ct);
        return ToDto(workOrder);
    }

    public async Task DeleteAsync(string companyCode, string workOrderNo, CancellationToken ct)
    {
        if (!await workOrders.DeleteAsync(companyCode, workOrderNo, ct)) throw new KeyNotFoundException("Work order not found.");
    }

    public async Task<IReadOnlyList<ProductionLineDto>> GetProductionLinesAsync(string? companyCode, string? useYn, string? keyword, CancellationToken ct) =>
        (await productionLines.GetAllAsync(companyCode, useYn, keyword, ct)).Select(x => new ProductionLineDto { CD_FIRM = x.CD_FIRM, CD_LINE = x.CD_LINE, NM_LINE = x.NM_LINE, YN_USE = x.YN_USE }).ToArray();

    public async Task<IReadOnlyList<ProductionProcessDto>> GetProcessesAsync(string? companyCode, string? useYn, string? keyword, CancellationToken ct) =>
        (await processes.GetAllAsync(companyCode, useYn, keyword, ct)).Select(x => new ProductionProcessDto { CD_FIRM = x.CD_FIRM, CD_PROC = x.CD_PROC, NM_PROC = x.NM_PROC, NO_SEQ = x.NO_SEQ, YN_USE = x.YN_USE }).ToArray();

    public async Task<IReadOnlyList<EquipmentDto>> GetEquipmentAsync(string? companyCode, string? lineCode, string? useYn, string? keyword, CancellationToken ct) =>
        (await equipment.GetAllAsync(companyCode, lineCode, useYn, keyword, ct)).Select(x => new EquipmentDto { CD_FIRM = x.CD_FIRM, CD_EQUIP = x.CD_EQUIP, NM_EQUIP = x.NM_EQUIP, CD_LINE = x.CD_LINE, YN_USE = x.YN_USE }).ToArray();

    private async Task<WorkOrder> BuildAsync(WorkOrderHeaderDto header, IReadOnlyList<WorkOrderProcessDto> requestedProcesses, WorkOrder? existing, CancellationToken ct)
    {
        var errors = new List<string>();
        Require(header.CD_FIRM, "Company code (CD_FIRM) is required.", errors);
        Require(header.NO_WO, "Work order number (NO_WO) is required.", errors);
        Require(header.DT_WO, "Work order date (DT_WO) is required.", errors);
        Require(header.CD_ITEM, "Item code (CD_ITEM) is required.", errors);
        Require(header.CD_LINE, "Production line code (CD_LINE) is required.", errors);
        if (!DateOnly.TryParse(header.DT_WO, out _)) errors.Add("Work order date (DT_WO) must be a valid date.");
        if (header.QT_WO <= 0) errors.Add("Work order quantity (QT_WO) must be greater than zero.");
        if (header.QT_RESULT < 0) errors.Add("Work order result quantity (QT_RESULT) cannot be negative.");
        var hasPlanStart = DateOnly.TryParse(header.DT_PLAN_START, out var planStart);
        var hasPlanEnd = DateOnly.TryParse(header.DT_PLAN_END, out var planEnd);
        if (!hasPlanStart) errors.Add("Planned start date (DT_PLAN_START) must be a valid date.");
        if (!hasPlanEnd) errors.Add("Planned end date (DT_PLAN_END) must be a valid date.");
        if (hasPlanStart && hasPlanEnd && planStart > planEnd) errors.Add("Planned start date cannot be after planned end date.");
        if (requestedProcesses.Count == 0) errors.Add("At least one work order process is required.");

        var item = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(header.CD_ITEM) ? null : await items.GetAsync(header.CD_FIRM, header.CD_ITEM, ct);
        if (item is null && !string.IsNullOrWhiteSpace(header.CD_FIRM) && !string.IsNullOrWhiteSpace(header.CD_ITEM)) errors.Add("Item code does not exist for the company code.");
        if (item is not null && item.YN_USE != "Y") errors.Add("Item code is not available for use.");
        var line = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(header.CD_LINE) ? null : await productionLines.GetAsync(header.CD_FIRM, header.CD_LINE, ct);
        if (line is null && !string.IsNullOrWhiteSpace(header.CD_FIRM) && !string.IsNullOrWhiteSpace(header.CD_LINE)) errors.Add("Production line code does not exist for the company code.");
        if (line is not null && line.YN_USE != "Y") errors.Add("Production line code is not available for use.");

        var processNumbers = new HashSet<int>();
        var rowKeys = new HashSet<string>(StringComparer.Ordinal);
        var builtProcesses = new List<WorkOrderProcess>();
        foreach (var process in requestedProcesses)
        {
            if (process.CD_FIRM != header.CD_FIRM || process.NO_WO != header.NO_WO) errors.Add($"Process {process.NO_PROC} must use the same company code and work order number as its header.");
            var rowKey = $"{process.CD_FIRM}::{process.NO_WO}::{process.NO_PROC}";
            if (process.NO_PROC <= 0 || !processNumbers.Add(process.NO_PROC)) errors.Add($"Process primary key NO_PROC '{process.NO_PROC}' is invalid or duplicated.");
            if (!rowKeys.Add(rowKey)) errors.Add($"Process row key '{rowKey}' is duplicated.");
            Require(process.CD_PROC, $"Process {process.NO_PROC}: process code (CD_PROC) is required.", errors);
            if (process.QT_PLAN <= 0) errors.Add($"Process {process.NO_PROC}: planned quantity must be greater than zero.");
            if (process.QT_RESULT < 0) errors.Add($"Process {process.NO_PROC}: result quantity cannot be negative.");
            var hasStart = DateTime.TryParse(process.TM_PLAN_START, out var processStart);
            var hasEnd = DateTime.TryParse(process.TM_PLAN_END, out var processEnd);
            if (!hasStart) errors.Add($"Process {process.NO_PROC}: planned start time must be valid.");
            if (!hasEnd) errors.Add($"Process {process.NO_PROC}: planned end time must be valid.");
            if (hasStart && hasEnd && processStart > processEnd) errors.Add($"Process {process.NO_PROC}: planned start time cannot be after planned end time.");
            if (string.IsNullOrWhiteSpace(process.CD_EQUIP) && !string.IsNullOrWhiteSpace(process.NM_EQUIP)) errors.Add($"Process {process.NO_PROC}: equipment name requires an equipment code.");

            var masterProcess = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(process.CD_PROC) ? null : await processes.GetAsync(header.CD_FIRM, process.CD_PROC, ct);
            if (masterProcess is null && !string.IsNullOrWhiteSpace(process.CD_PROC)) errors.Add($"Process {process.NO_PROC}: process code does not exist for the company code.");
            if (masterProcess is not null && masterProcess.YN_USE != "Y") errors.Add($"Process {process.NO_PROC}: process code is not available for use.");
            var masterEquipment = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(process.CD_EQUIP) ? null : await equipment.GetAsync(header.CD_FIRM, process.CD_EQUIP, ct);
            if (masterEquipment is null && !string.IsNullOrWhiteSpace(process.CD_EQUIP)) errors.Add($"Process {process.NO_PROC}: equipment code does not exist for the company code.");
            if (masterEquipment is not null && masterEquipment.YN_USE != "Y") errors.Add($"Process {process.NO_PROC}: equipment code is not available for use.");
            if (masterEquipment is not null && masterEquipment.CD_LINE != header.CD_LINE) errors.Add($"Process {process.NO_PROC}: equipment is not available on the selected production line.");
            if (masterProcess is null || (masterEquipment is null && !string.IsNullOrWhiteSpace(process.CD_EQUIP))) continue;

            builtProcesses.Add(new WorkOrderProcess
            {
                CD_FIRM = header.CD_FIRM,
                NO_WO = header.NO_WO,
                NO_PROC = process.NO_PROC,
                CD_PROC = masterProcess.CD_PROC,
                NM_PROC = masterProcess.NM_PROC,
                CD_EQUIP = masterEquipment?.CD_EQUIP ?? "",
                NM_EQUIP = masterEquipment?.NM_EQUIP ?? "",
                QT_PLAN = process.QT_PLAN,
                QT_RESULT = process.QT_RESULT,
                TM_PLAN_START = process.TM_PLAN_START,
                TM_PLAN_END = process.TM_PLAN_END,
                ST_PROC = string.IsNullOrWhiteSpace(process.ST_PROC) ? "대기" : process.ST_PROC,
                DC_RMK = process.DC_RMK ?? "",
                CD_USER_REG = existing?.Processes.SingleOrDefault(x => x.NO_PROC == process.NO_PROC)?.CD_USER_REG ?? process.CD_USER_REG ?? "SYSTEM",
                TM_REG = existing?.Processes.SingleOrDefault(x => x.NO_PROC == process.NO_PROC)?.TM_REG ?? DateTime.UtcNow,
                CD_USER_AMD = process.CD_USER_AMD ?? "SYSTEM",
                TM_AMD = DateTime.UtcNow
            });
        }

        if (errors.Count > 0) throw new DomainValidationException(errors);
        return new WorkOrder
        {
            Header = new WorkOrderHeader
            {
                CD_FIRM = header.CD_FIRM,
                NO_WO = header.NO_WO,
                DT_WO = header.DT_WO,
                CD_ITEM = item!.CD_ITEM,
                NM_ITEM = item.NM_ITEM,
                STND_ITEM = item.STND_ITEM,
                UNIT_ITEM = item.UNIT_ITEM,
                QT_WO = header.QT_WO,
                QT_RESULT = header.QT_RESULT,
                DT_PLAN_START = header.DT_PLAN_START,
                DT_PLAN_END = header.DT_PLAN_END,
                CD_LINE = line!.CD_LINE,
                NM_LINE = line.NM_LINE,
                ST_WO = string.IsNullOrWhiteSpace(header.ST_WO) ? "미확정" : header.ST_WO,
                YN_URGENT = string.Equals(header.YN_URGENT, "Y", StringComparison.OrdinalIgnoreCase) ? "Y" : "N",
                DC_RMK = header.DC_RMK ?? "",
                CD_USER_REG = existing?.Header.CD_USER_REG ?? header.CD_USER_REG ?? "SYSTEM",
                TM_REG = existing?.Header.TM_REG ?? DateTime.UtcNow,
                CD_USER_AMD = header.CD_USER_AMD ?? "SYSTEM",
                TM_AMD = DateTime.UtcNow
            },
            Processes = builtProcesses.OrderBy(x => x.NO_PROC).ToArray()
        };
    }

    private async Task<WorkOrder> AssignApiNumberAsync(WorkOrder workOrder, CancellationToken ct)
    {
        if (!workOrder.Header.NO_WO.StartsWith("TEMP-WO-", StringComparison.OrdinalIgnoreCase)) return workOrder;
        var yearMonth = DateTime.UtcNow.ToString("yyyyMM");
        var prefix = $"WO{yearMonth}";
        var existingNumbers = (await workOrders.GetAllAsync(new WorkOrderSearch(workOrder.Header.CD_FIRM, null, null, null, null, null, null, null), ct))
            .Select(x => x.Header.NO_WO)
            .Select(x => x.StartsWith(prefix, StringComparison.Ordinal) && int.TryParse(x[prefix.Length..], out var sequence) ? sequence : 0);
        var nextNumber = $"{prefix}{(existingNumbers.DefaultIfEmpty(0).Max() + 1):D4}";
        return new WorkOrder { Header = workOrder.Header with { NO_WO = nextNumber }, Processes = workOrder.Processes.Select(x => x with { NO_WO = nextNumber }).ToArray() };
    }

    private static void Require(string? value, string message, ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add(message);
    }

    private static WorkOrderDetailDto ToDto(WorkOrder workOrder) => new()
    {
        Header = new WorkOrderHeaderDto
        {
            CD_FIRM = workOrder.Header.CD_FIRM, NO_WO = workOrder.Header.NO_WO, DT_WO = workOrder.Header.DT_WO,
            CD_ITEM = workOrder.Header.CD_ITEM, NM_ITEM = workOrder.Header.NM_ITEM, STND_ITEM = workOrder.Header.STND_ITEM, UNIT_ITEM = workOrder.Header.UNIT_ITEM,
            QT_WO = workOrder.Header.QT_WO, QT_RESULT = workOrder.Header.QT_RESULT, DT_PLAN_START = workOrder.Header.DT_PLAN_START, DT_PLAN_END = workOrder.Header.DT_PLAN_END,
            CD_LINE = workOrder.Header.CD_LINE, NM_LINE = workOrder.Header.NM_LINE, ST_WO = workOrder.Header.ST_WO, YN_URGENT = workOrder.Header.YN_URGENT, DC_RMK = workOrder.Header.DC_RMK,
            CD_USER_REG = workOrder.Header.CD_USER_REG, TM_REG = workOrder.Header.TM_REG, CD_USER_AMD = workOrder.Header.CD_USER_AMD, TM_AMD = workOrder.Header.TM_AMD
        },
        Processes = workOrder.Processes.Select(x => new WorkOrderProcessDto
        {
            CD_FIRM = x.CD_FIRM, NO_WO = x.NO_WO, NO_PROC = x.NO_PROC, CD_PROC = x.CD_PROC, NM_PROC = x.NM_PROC, CD_EQUIP = x.CD_EQUIP, NM_EQUIP = x.NM_EQUIP,
            QT_PLAN = x.QT_PLAN, QT_RESULT = x.QT_RESULT, TM_PLAN_START = x.TM_PLAN_START, TM_PLAN_END = x.TM_PLAN_END, ST_PROC = x.ST_PROC, DC_RMK = x.DC_RMK,
            CD_USER_REG = x.CD_USER_REG, TM_REG = x.TM_REG, CD_USER_AMD = x.CD_USER_AMD, TM_AMD = x.TM_AMD
        }).ToArray(),
        Warnings = workOrder.Header.QT_WO > 0 && workOrder.Header.QT_RESULT > workOrder.Header.QT_WO
            ? ["실적수량이 지시수량을 초과했습니다."]
            : []
    };
}
