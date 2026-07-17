using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public sealed class UnavailableWorkOrderService : IWorkOrderService
{
    private const string Message = "Work order APIs are available only when RepositoryMode=InMemory. A SqlServer work order repository is outside this sprint's scope.";

    public Task<IReadOnlyList<WorkOrderDetailDto>> GetAllAsync(string? companyCode, string? dateFrom, string? dateTo, string? workOrderNo, string? item, string? productionLine, string? status, string? urgent, CancellationToken cancellationToken) => Unavailable<IReadOnlyList<WorkOrderDetailDto>>();
    public Task<WorkOrderDetailDto?> GetAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken) => Unavailable<WorkOrderDetailDto?>();
    public Task<WorkOrderDetailDto> CreateAsync(CreateWorkOrderRequest request, CancellationToken cancellationToken) => Unavailable<WorkOrderDetailDto>();
    public Task<WorkOrderDetailDto> UpdateAsync(string companyCode, string workOrderNo, UpdateWorkOrderRequest request, CancellationToken cancellationToken) => Unavailable<WorkOrderDetailDto>();
    public Task DeleteAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken) => Task.FromException(new FeatureNotAvailableException(Message));
    public Task<IReadOnlyList<ProductionLineDto>> GetProductionLinesAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken) => Unavailable<IReadOnlyList<ProductionLineDto>>();
    public Task<IReadOnlyList<ProductionProcessDto>> GetProcessesAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken) => Unavailable<IReadOnlyList<ProductionProcessDto>>();
    public Task<IReadOnlyList<EquipmentDto>> GetEquipmentAsync(string? companyCode, string? lineCode, string? useYn, string? keyword, CancellationToken cancellationToken) => Unavailable<IReadOnlyList<EquipmentDto>>();

    private static Task<T> Unavailable<T>() => Task.FromException<T>(new FeatureNotAvailableException(Message));
}
