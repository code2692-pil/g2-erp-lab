namespace G2Erp.Api.Domain;

public sealed class SalesOrder
{
    public required SalesOrderHeader Header { get; init; }
    public required IReadOnlyList<SalesOrderLine> Lines { get; init; }
}

public sealed record SalesOrderHeader
{
    public required string CD_FIRM { get; init; }
    public required string NO_SO { get; init; }
    public required string DT_SO { get; init; }
    public required string CD_PARTNER { get; init; }
    public required string NM_PARTNER { get; init; }
    public required string CD_EMP { get; init; }
    public required string ST_SO { get; init; }
    public required string DC_RMK { get; init; }
    public string? MAIL_ID { get; init; }
}

public sealed record SalesOrderLine
{
    public required string CD_FIRM { get; init; }
    public required string NO_SO { get; init; }
    public required int NO_LINE { get; init; }
    public required string CD_ITEM { get; init; }
    public required string NM_ITEM { get; init; }
    public required string STND_ITEM { get; init; }
    public required string UNIT_ITEM { get; init; }
    public required decimal QT_SO { get; init; }
    public required decimal UM_SO { get; init; }
    public required decimal AM_SUPPLY { get; init; }
    public required decimal AM_VAT { get; init; }
    public required decimal AM_TOTAL { get; init; }
    public required string DT_DLV { get; init; }
    public required string DC_RMK { get; init; }
}

public sealed class Partner
{
    public required string CD_FIRM { get; init; }
    public required string CD_PARTNER { get; init; }
    public required string NM_PARTNER { get; init; }
    public required string NO_COMPANY { get; init; }
    public required string YN_USE { get; init; }
}

public sealed class Item
{
    public required string CD_FIRM { get; init; }
    public required string CD_ITEM { get; init; }
    public required string NM_ITEM { get; init; }
    public required string STND_ITEM { get; init; }
    public required string UNIT_ITEM { get; init; }
    public required string YN_USE { get; init; }
}
