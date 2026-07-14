using G2Erp.Api.Contracts;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class PartnerService(IPartnerRepository repository) : IPartnerService
{
    public async Task<IReadOnlyList<PartnerDto>> GetAllAsync(CancellationToken cancellationToken) =>
        (await repository.GetAllAsync(cancellationToken)).Select(x => new PartnerDto
        {
            CD_FIRM = x.CD_FIRM, CD_PARTNER = x.CD_PARTNER, NM_PARTNER = x.NM_PARTNER,
            NO_COMPANY = x.NO_COMPANY, YN_USE = x.YN_USE
        }).ToArray();
}
