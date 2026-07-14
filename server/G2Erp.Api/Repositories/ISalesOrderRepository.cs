using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public interface ISalesOrderRepository
{
    Task<IReadOnlyList<SalesOrder>> GetAllAsync(CancellationToken cancellationToken);
    Task<SalesOrder?> GetAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken);
    Task AddAsync(SalesOrder salesOrder, CancellationToken cancellationToken);
    Task UpdateAsync(SalesOrder salesOrder, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken);
}
