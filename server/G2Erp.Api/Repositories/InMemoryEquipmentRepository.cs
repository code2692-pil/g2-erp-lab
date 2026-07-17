using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryEquipmentRepository : IEquipmentRepository
{
    private static readonly Equipment[] Equipment =
    [
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-A01", NM_EQUIP = "Assembly station A1", CD_LINE = "LINE-A", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-A02", NM_EQUIP = "Assembly station A2", CD_LINE = "LINE-A", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-B01", NM_EQUIP = "Precision fastening", CD_LINE = "LINE-B", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-B02", NM_EQUIP = "Torque measuring device", CD_LINE = "LINE-B", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-C01", NM_EQUIP = "Functional tester", CD_LINE = "LINE-C", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-C02", NM_EQUIP = "Gauge inspection", CD_LINE = "LINE-C", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-D01", NM_EQUIP = "Packing machine", CD_LINE = "LINE-D", YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_EQUIP = "EQ-E01", NM_EQUIP = "Packaging machine", CD_LINE = "LINE-E", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_EQUIP = "EQ-X01", NM_EQUIP = "Maintenance equipment", CD_LINE = "LINE-A", YN_USE = "N" }
    ];

    public Task<IReadOnlyList<Equipment>> GetAllAsync(string? companyCode, string? lineCode, string? useYn, string? keyword, CancellationToken cancellationToken)
    {
        var query = Equipment.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(companyCode)) query = query.Where(x => x.CD_FIRM == companyCode);
        if (!string.IsNullOrWhiteSpace(lineCode)) query = query.Where(x => x.CD_LINE == lineCode);
        if (!string.IsNullOrWhiteSpace(useYn)) query = query.Where(x => x.YN_USE == useYn);
        if (!string.IsNullOrWhiteSpace(keyword)) query = query.Where(x => ($"{x.CD_EQUIP} {x.NM_EQUIP}").Contains(keyword, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult<IReadOnlyList<Equipment>>(query.OrderBy(x => x.CD_FIRM).ThenBy(x => x.CD_EQUIP).ToArray());
    }

    public Task<Equipment?> GetAsync(string companyCode, string equipmentCode, CancellationToken cancellationToken) =>
        Task.FromResult(Equipment.SingleOrDefault(x => x.CD_FIRM == companyCode && x.CD_EQUIP == equipmentCode));
}
