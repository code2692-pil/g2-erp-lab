namespace G2Erp.Api.Domain.WorkOrders;

public sealed class WorkOrder
{
    public required WorkOrderHeader Header { get; init; }
    public required IReadOnlyList<WorkOrderProcess> Processes { get; init; }
}

public sealed record WorkOrderHeader
{
    public required string CD_FIRM { get; init; }
    public required string NO_WO { get; init; }
    public required string DT_WO { get; init; }
    public required string CD_ITEM { get; init; }
    public required string NM_ITEM { get; init; }
    public required string STND_ITEM { get; init; }
    public required string UNIT_ITEM { get; init; }
    public required decimal QT_WO { get; init; }
    public required decimal QT_RESULT { get; init; }
    public required string DT_PLAN_START { get; init; }
    public required string DT_PLAN_END { get; init; }
    public required string CD_LINE { get; init; }
    public required string NM_LINE { get; init; }
    public required string ST_WO { get; init; }
    public required string YN_URGENT { get; init; }
    public required string DC_RMK { get; init; }
    public string? CD_USER_REG { get; init; }
    public DateTime? TM_REG { get; init; }
    public string? CD_USER_AMD { get; init; }
    public DateTime? TM_AMD { get; init; }
}

public sealed record WorkOrderProcess
{
    public required string CD_FIRM { get; init; }
    public required string NO_WO { get; init; }
    public required int NO_PROC { get; init; }
    public required string CD_PROC { get; init; }
    public required string NM_PROC { get; init; }
    public required string CD_EQUIP { get; init; }
    public required string NM_EQUIP { get; init; }
    public required decimal QT_PLAN { get; init; }
    public required decimal QT_RESULT { get; init; }
    public required string TM_PLAN_START { get; init; }
    public required string TM_PLAN_END { get; init; }
    public required string ST_PROC { get; init; }
    public required string DC_RMK { get; init; }
    public string? CD_USER_REG { get; init; }
    public DateTime? TM_REG { get; init; }
    public string? CD_USER_AMD { get; init; }
    public DateTime? TM_AMD { get; init; }
}

public sealed record WorkOrderSearch(
    string? CompanyCode,
    string? DateFrom,
    string? DateTo,
    string? WorkOrderNo,
    string? Item,
    string? ProductionLine,
    string? Status,
    string? Urgent);
