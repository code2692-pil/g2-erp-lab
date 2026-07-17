using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public interface IWorkOrderRepository
{
    Task<IReadOnlyList<WorkOrder>> GetAllAsync(WorkOrderSearch search, CancellationToken cancellationToken);
    Task<WorkOrder?> GetAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken);
    Task<bool> ExistsAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken);
    Task AddAsync(WorkOrder workOrder, CancellationToken cancellationToken);
    Task UpdateAsync(WorkOrder workOrder, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string workOrderNo, CancellationToken cancellationToken);
}
