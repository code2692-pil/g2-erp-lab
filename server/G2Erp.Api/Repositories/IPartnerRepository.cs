using G2Erp.Api.Domain;

namespace G2Erp.Api.Repositories;

public interface IPartnerRepository
{
    Task<IReadOnlyList<Partner>> GetAllAsync(CancellationToken cancellationToken);
    Task<Partner?> GetAsync(string companyCode, string partnerCode, CancellationToken cancellationToken);
}
