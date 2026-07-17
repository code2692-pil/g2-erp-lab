namespace G2Erp.Api.Contracts;

public sealed class WorkOrderHeaderDto
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

public sealed class WorkOrderProcessDto
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

public sealed class WorkOrderDetailDto
{
    public required WorkOrderHeaderDto Header { get; init; }
    public required IReadOnlyList<WorkOrderProcessDto> Processes { get; init; }
    public required IReadOnlyList<string> Warnings { get; init; }
}

public sealed class CreateWorkOrderRequest
{
    public required WorkOrderHeaderDto Header { get; init; }
    public required IReadOnlyList<WorkOrderProcessDto> Processes { get; init; }
}

public sealed class UpdateWorkOrderRequest
{
    public required WorkOrderHeaderDto Header { get; init; }
    public required IReadOnlyList<WorkOrderProcessDto> Processes { get; init; }
}

public sealed class ProductionLineDto
{
    public required string CD_FIRM { get; init; }
    public required string CD_LINE { get; init; }
    public required string NM_LINE { get; init; }
    public required string YN_USE { get; init; }
}

public sealed class ProductionProcessDto
{
    public required string CD_FIRM { get; init; }
    public required string CD_PROC { get; init; }
    public required string NM_PROC { get; init; }
    public required int NO_SEQ { get; init; }
    public required string YN_USE { get; init; }
}

public sealed class EquipmentDto
{
    public required string CD_FIRM { get; init; }
    public required string CD_EQUIP { get; init; }
    public required string NM_EQUIP { get; init; }
    public required string CD_LINE { get; init; }
    public required string YN_USE { get; init; }
}
