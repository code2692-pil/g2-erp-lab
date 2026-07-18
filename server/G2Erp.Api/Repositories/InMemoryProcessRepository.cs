using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryProcessRepository : IProcessRepository
{
    private static readonly List<ProductionProcess> Processes =
    [
        new() { CD_FIRM = "1000", CD_PROC = "PROC-010", NM_PROC = "Material preparation", NO_SEQ = 10, YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PROC = "PROC-020", NM_PROC = "Module assembly", NO_SEQ = 20, YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PROC = "PROC-030", NM_PROC = "Functional inspection", NO_SEQ = 30, YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PROC = "PROC-040", NM_PROC = "Final inspection", NO_SEQ = 40, YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PROC = "PROC-050", NM_PROC = "Packing", NO_SEQ = 50, YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_PROC = "PROC-070", NM_PROC = "Packaging", NO_SEQ = 70, YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_PROC = "PROC-080", NM_PROC = "Packing inspection", NO_SEQ = 80, YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PROC = "PROC-090", NM_PROC = "Retired process", NO_SEQ = 90, YN_USE = "N" }
    ];

    public Task<IReadOnlyList<ProductionProcess>> GetAllAsync(string? companyCode, string? useYn, string? keyword, CancellationToken cancellationToken)
    {
        var query = Processes.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(companyCode)) query = query.Where(x => x.CD_FIRM == companyCode);
        if (!string.IsNullOrWhiteSpace(useYn)) query = query.Where(x => x.YN_USE == useYn);
        if (!string.IsNullOrWhiteSpace(keyword)) query = query.Where(x => ($"{x.CD_PROC} {x.NM_PROC}").Contains(keyword, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult<IReadOnlyList<ProductionProcess>>(query.OrderBy(x => x.CD_FIRM).ThenBy(x => x.NO_SEQ).ToArray());
    }

    public Task<ProductionProcess?> GetAsync(string companyCode, string processCode, CancellationToken cancellationToken) =>
        Task.FromResult(Processes.SingleOrDefault(x => x.CD_FIRM == companyCode && x.CD_PROC == processCode));

    public Task AddAsync(ProductionProcess process, CancellationToken cancellationToken)
    {
        if (Processes.Any(x => x.CD_FIRM == process.CD_FIRM && x.CD_PROC == process.CD_PROC))
            throw new InvalidOperationException("Process key already exists.");
        Processes.Add(process);
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string companyCode, string processCode, CancellationToken cancellationToken) =>
        Task.FromResult(Processes.RemoveAll(x => x.CD_FIRM == companyCode && x.CD_PROC == processCode) > 0);
}
