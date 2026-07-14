using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IPartnerService
{
    Task<IReadOnlyList<PartnerDto>> GetAllAsync(CancellationToken cancellationToken);
}
