namespace G2Erp.Api.Domain.WorkOrders;

public sealed record ProductionLine
{
    public required string CD_FIRM { get; init; }
    public required string CD_LINE { get; init; }
    public required string NM_LINE { get; init; }
    public required string YN_USE { get; init; }
}

public sealed record ProductionProcess
{
    public required string CD_FIRM { get; init; }
    public required string CD_PROC { get; init; }
    public required string NM_PROC { get; init; }
    public required int NO_SEQ { get; init; }
    public required string YN_USE { get; init; }
}

public sealed record Equipment
{
    public required string CD_FIRM { get; init; }
    public required string CD_EQUIP { get; init; }
    public required string NM_EQUIP { get; init; }
    public required string CD_LINE { get; init; }
    public required string YN_USE { get; init; }
}
