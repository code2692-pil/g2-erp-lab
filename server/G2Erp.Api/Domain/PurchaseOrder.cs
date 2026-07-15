namespace G2Erp.Api.Domain;

public sealed class PurchaseOrder
{
    public required PurchaseOrderHeader Header { get; init; }
    public required IReadOnlyList<PurchaseOrderLine> Lines { get; init; }
}

public sealed record PurchaseOrderHeader
{
    public required string CD_FIRM { get; init; }
    public required string NO_PO { get; init; }
    public required string DT_PO { get; init; }
    public required string CD_PARTNER { get; init; }
    public required string NM_PARTNER { get; init; }
    public required string CD_EMP { get; init; }
    public required string NM_EMP { get; init; }
    public required string CD_CURRENCY { get; init; }
    public required decimal RT_EXCHANGE { get; init; }
    public required string ST_PO { get; init; }
    public required string DC_RMK { get; init; }
    public string? CD_USER_REG { get; init; }
    public DateTime? TM_REG { get; init; }
    public string? CD_USER_AMD { get; init; }
    public DateTime? TM_AMD { get; init; }
}

public sealed record PurchaseOrderLine
{
    public required string CD_FIRM { get; init; }
    public required string NO_PO { get; init; }
    public required int NO_LINE { get; init; }
    public required string CD_ITEM { get; init; }
    public required string NM_ITEM { get; init; }
    public required string STND_ITEM { get; init; }
    public required string UNIT_ITEM { get; init; }
    public required decimal QT_PO { get; init; }
    public required decimal UM_PO { get; init; }
    public required decimal AM_SUPPLY { get; init; }
    public required decimal AM_VAT { get; init; }
    public required decimal AM_TOTAL { get; init; }
    public required string DT_DLV { get; init; }
    public required string CD_WH { get; init; }
    public required string NM_WH { get; init; }
    public required string DC_RMK { get; init; }
    public string? CD_USER_REG { get; init; }
    public DateTime? TM_REG { get; init; }
    public string? CD_USER_AMD { get; init; }
    public DateTime? TM_AMD { get; init; }
}

public sealed class Warehouse
{
    public required string CD_FIRM { get; init; }
    public required string CD_WH { get; init; }
    public required string NM_WH { get; init; }
    public required string YN_USE { get; init; }
}

public sealed record PurchaseOrderSearch(
    string? CompanyCode,
    string? DateFrom,
    string? DateTo,
    string? PurchaseOrderNo,
    string? Partner,
    string? Status);
