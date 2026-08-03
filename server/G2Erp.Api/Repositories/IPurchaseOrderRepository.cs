using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public interface IPurchaseOrderRepository
{
    Task<IReadOnlyList<PurchaseOrder>> GetAllAsync(PurchaseOrderSearch search, CancellationToken cancellationToken);
    Task<PurchaseOrder?> GetAsync(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken);
    Task AddAsync(PurchaseOrder purchaseOrder, CancellationToken cancellationToken);
    Task<PurchaseOrder> AddWithGeneratedNumberAsync(PurchaseOrder purchaseOrder, string yearMonth, CancellationToken cancellationToken);
    Task UpdateAsync(PurchaseOrder purchaseOrder, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken);
}
