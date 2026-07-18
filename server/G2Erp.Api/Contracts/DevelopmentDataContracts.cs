namespace G2Erp.Api.Contracts;

public sealed class DevelopmentDataEnvironmentDto
{
    public required string Environment { get; init; }
    public required string RepositoryMode { get; init; }
    public required string Server { get; init; }
    public required string Database { get; init; }
    public required bool IsLocal { get; init; }
    public required bool IsAllowed { get; init; }
    public required string SafetyStatus { get; init; }
    public required string Message { get; init; }
    public required DateTime GeneratedAt { get; init; }
}

public sealed class DevelopmentDataSummaryDto
{
    public required DevelopmentDataEnvironmentDto Environment { get; init; }
    public required int SampleItems { get; init; }
    public required int SampleProductionLines { get; init; }
    public required int SampleProcesses { get; init; }
    public required int SampleEquipment { get; init; }
    public required int SampleSalesOrders { get; init; }
    public required int SampleSalesOrderLines { get; init; }
    public required int SamplePurchaseOrders { get; init; }
    public required int SamplePurchaseOrderLines { get; init; }
    public required int SampleWorkOrders { get; init; }
    public required int SampleWorkOrderProcesses { get; init; }
    public required int E2ERemnantRows { get; init; }
    public required string Status { get; init; }
}

public sealed class DevelopmentDataRequest
{
    public string? Scope { get; init; }
    public string? ConfirmationText { get; init; }
}

public sealed class DevelopmentDataPreviewDto
{
    public required string Scope { get; init; }
    public required DevelopmentDataEnvironmentDto Environment { get; init; }
    public required int ExistingRows { get; init; }
    public required int NewRows { get; init; }
    public required int ConflictRows { get; init; }
    public required IReadOnlyList<string> Conflicts { get; init; }
    public required IReadOnlyList<string> AffectedTables { get; init; }
    public required bool DeletesData { get; init; }
}

public sealed class DevelopmentDataOperationDto
{
    public required string Operation { get; init; }
    public required string Scope { get; init; }
    public required string Status { get; init; }
    public required int CreatedRows { get; init; }
    public required int DeletedRows { get; init; }
    public required int SkippedRows { get; init; }
    public required int ConflictRows { get; init; }
    public required string Message { get; init; }
    public required DateTime ExecutedAt { get; init; }
}

public sealed class DevelopmentDataE2ERemnantsDto
{
    public required int TotalRows { get; init; }
    public required IReadOnlyList<DevelopmentDataRemnantRowDto> Rows { get; init; }
}

public sealed class DevelopmentDataRemnantRowDto
{
    public required string Table { get; init; }
    public required string Key { get; init; }
    public required string Prefix { get; init; }
}
