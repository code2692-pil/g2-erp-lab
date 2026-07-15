using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IPurchaseOrderService
{
    Task<IReadOnlyList<PurchaseOrderDetailDto>> GetAllAsync(string? companyCode, string? dateFrom, string? dateTo, string? purchaseOrderNo, string? partner, string? status, CancellationToken cancellationToken);
    Task<PurchaseOrderDetailDto?> GetAsync(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken);
    Task<PurchaseOrderDetailDto> CreateAsync(CreatePurchaseOrderRequest request, CancellationToken cancellationToken);
    Task<PurchaseOrderDetailDto> UpdateAsync(string companyCode, string purchaseOrderNo, UpdatePurchaseOrderRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(string companyCode, string purchaseOrderNo, CancellationToken cancellationToken);
}
