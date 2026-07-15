using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryWarehouseRepository : IWarehouseRepository
{
    private static readonly Warehouse[] Warehouses =
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
}
