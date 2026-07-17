using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IWorkOrderService
{
    Task<IReadOnlyList<WorkOrderDetailDto>> GetAllAsync(string? companyCode, string? dateFrom, string? dateTo, string? workOrderNo, string? item, string? productionLine, string? status, string? urgent, CancellationToken cancellationToken);
    Task<WorkOrderDetailDto?> GetAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken);
    Task<WorkOrderDetailDto> CreateAsync(CreateWorkOrderRequest request, CancellationToken cancellationToken);
    Task<WorkOrderDetailDto> UpdateAsync(string companyCode, string workOrderNo, UpdateWorkOrderRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken);
    Task<IReadOnlyList<ProductionLineDto>> GetProductionLinesAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken);
    Task<IReadOnlyList<ProductionProcessDto>> GetProcessesAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken);
    Task<IReadOnlyList<EquipmentDto>> GetEquipmentAsync(string? companyCode, string? lineCode, string? useYn, string? keyword, CancellationToken cancellationToken);
}
