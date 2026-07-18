using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public interface IWarehouseRepository
{
    Task<IReadOnlyList<Warehouse>> GetAllAsync(CancellationToken cancellationToken);
    Task<Warehouse?> GetAsync(string companyCode, string warehouseCode, CancellationToken cancellationToken);
    Task AddAsync(Warehouse warehouse, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string warehouseCode, CancellationToken cancellationToken);
}
