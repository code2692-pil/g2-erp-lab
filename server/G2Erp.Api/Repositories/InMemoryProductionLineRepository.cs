using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryProductionLineRepository : IProductionLineRepository
{
    private static readonly ProductionLine[] Lines =
    [
        new() { CD_FIRM = "1000", CD_LINE = "LINE-A", NM_LINE = "Assembly Line A", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_LINE = "LINE-B", NM_LINE = "Assembly Line B", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_LINE = "LINE-C", NM_LINE = "Quality Line C", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_LINE = "LINE-D", NM_LINE = "Packing Line D", YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_LINE = "LINE-E", NM_LINE = "Packaging Line E", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_LINE = "LINE-X", NM_LINE = "Retired Line", YN_USE = "N" }
    ];

    public Task<IReadOnlyList<ProductionLine>> GetAllAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken)
    {
        var query = Lines.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(companyCode)) query = query.Where(x => x.CD_FIRM == companyCode);
        if (!string.IsNullOrWhiteSpace(useYn)) query = query.Where(x => x.YN_USE == useYn);
        if (!string.IsNullOrWhiteSpace(keyword)) query = query.Where(x => ($"{x.CD_LINE} {x.NM_LINE}").Contains(keyword, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult<IReadOnlyList<ProductionLine>>(query.OrderBy(x => x.CD_FIRM).ThenBy(x => x.CD_LINE).ToArray());
    }

    public Task<ProductionLine?> GetAsync(string companyCode, string lineCode, CancellationToken cancellationToken) =>
        Task.FromResult(Lines.SingleOrDefault(x => x.CD_FIRM == companyCode && x.CD_LINE == lineCode));
}
