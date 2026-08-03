using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public sealed class InMemoryPartnerRepository : IPartnerRepository
{
    private static readonly List<Partner> Partners =
    [
        new() { CD_FIRM = "1000", CD_PARTNER = "SUP-001", NM_PARTNER = "세림정밀", NO_COMPANY = "000-00-20801", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PARTNER = "SUP-002", NM_PARTNER = "한빛전자", NO_COMPANY = "000-00-20802", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PARTNER = "P-10021", NM_PARTNER = "가온모션", NO_COMPANY = "120-81-10021", YN_USE = "Y" },
        new() { CD_FIRM = "1000", CD_PARTNER = "P-10044", NM_PARTNER = "미래산업", NO_COMPANY = "120-81-10044", YN_USE = "Y" },
        new() { CD_FIRM = "2000", CD_PARTNER = "P-20012", NM_PARTNER = "동해소재", NO_COMPANY = "220-81-20012", YN_USE = "Y" }
    ];

    public Task<IReadOnlyList<Partner>> GetAllAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Partner>>(Partners);
    public Task<Partner?> GetAsync(string companyCode, string partnerCode, CancellationToken cancellationToken) =>
        Task.FromResult(Partners.SingleOrDefault(x => x.CD_FIRM == companyCode && x.CD_PARTNER == partnerCode));

    public Task AddAsync(Partner partner, CancellationToken cancellationToken)
    {
        if (Partners.Any(x => x.CD_FIRM == partner.CD_FIRM && x.CD_PARTNER == partner.CD_PARTNER))
            throw new InvalidOperationException("Partner key already exists.");
        Partners.Add(partner);
        return Task.CompletedTask;
    }

    public Task<bool> DeleteAsync(string companyCode, string partnerCode, CancellationToken cancellationToken) =>
        Task.FromResult(Partners.RemoveAll(x => x.CD_FIRM == companyCode && x.CD_PARTNER == partnerCode) > 0);
}
