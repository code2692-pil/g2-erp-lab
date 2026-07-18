using G2Erp.Api.Domain.WorkOrders;

namespace G2Erp.Api.Repositories;

public interface IEquipmentRepository
{
    Task<IReadOnlyList<Equipment>> GetAllAsync(string? companyCode, string? lineCode, string? useYn, string? keyword, CancellationToken cancellationToken);
    Task<Equipment?> GetAsync(string companyCode, string equipmentCode, CancellationToken cancellationToken);
    Task AddAsync(Equipment equipment, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(string companyCode, string equipmentCode, CancellationToken cancellationToken);
}
