using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryWarehouseRepository : IWarehouseRepository
{
    private static readonly List<Warehouse> Warehouses =
    [
        new() { CD_FIRM = "1000", CD_WH = "WH-100", NM_WH = "Central Warehouse", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_WH = "WH-110", NM_WH = "Parts Warehouse", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_WH = "WH-120", NM_WH = "Quality Warehouse", YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_WH = "WH-200", NM_WH = "Busan Warehouse", YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_WH = "WH-210", NM_WH = "Export Warehouse", YN_USE = "Y" }
    ];

    public Task<IReadOnlyList<Warehouse>> GetAllAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Warehouse>>(Warehouses);
    public Task<Warehouse?> GetAsync(string companyCode, string warehouseCode, CancellationToken cancellationToken) =>
        Task.FromResult(Warehouses.SingleOrDefault(x => x.CD_FIRM == companyCode && x.CD_WH == warehouseCode));

    public Task AddAsync(Warehouse warehouse, CancellationToken cancellationToken)
    {
        if (Warehouses.Any(x => x.CD_FIRM == warehouse.CD_FIRM && x.CD_WH == warehouse.CD_WH))
            throw new InvalidOperationException("Warehouse key already exists.");
        Warehouses.Add(warehouse);
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string companyCode, string warehouseCode, CancellationToken cancellationToken) =>
        Task.FromResult(Warehouses.RemoveAll(x => x.CD_FIRM == companyCode && x.CD_WH == warehouseCode) > 0);
}
