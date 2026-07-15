using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class PurchaseOrderService(IPurchaseOrderRepository purchaseOrders, IPartnerRepository partners, IItemRepository items, IWarehouseRepository warehouses) : IPurchaseOrderService
{
    public async Task<IReadOnlyList<PurchaseOrderDetailDto>> GetAllAsync(string? companyCode, string? dateFrom, string? dateTo, string? purchaseOrderNo, string? partner, string? status, CancellationToken ct) =>
        (await purchaseOrders.GetAllAsync(new PurchaseOrderSearch(companyCode, dateFrom, dateTo, purchaseOrderNo, partner, status), ct)).Select(ToDto).ToArray();

    public async Task<PurchaseOrderDetailDto?> GetAsync(string companyCode, string purchaseOrderNo, CancellationToken ct)
    {
        var order = await purchaseOrders.GetAsync(companyCode, purchaseOrderNo, ct); return order is null ? null : ToDto(order);
    }

    public async Task<PurchaseOrderDetailDto> CreateAsync(CreatePurchaseOrderRequest request, CancellationToken ct)
    {
        var order = await BuildAsync(request.Header, request.Lines, ct);
        if (await purchaseOrders.GetAsync(order.Header.CD_FIRM, order.Header.NO_PO, ct) is not null) throw new DomainConflictException("The header primary key (CD_FIRM, NO_PO) already exists.");
        await purchaseOrders.AddAsync(order, ct); return ToDto(order);
    }

    public async Task<PurchaseOrderDetailDto> UpdateAsync(string companyCode, string purchaseOrderNo, UpdatePurchaseOrderRequest request, CancellationToken ct)
    {
        if (request.Header.CD_FIRM != companyCode || request.Header.NO_PO != purchaseOrderNo) throw new DomainValidationException(["The route primary key must match Header.CD_FIRM and Header.NO_PO."]);
        if (await purchaseOrders.GetAsync(companyCode, purchaseOrderNo, ct) is null) throw new KeyNotFoundException("Purchase order not found.");
        var order = await BuildAsync(request.Header, request.Lines, ct); await purchaseOrders.UpdateAsync(order, ct); return ToDto(order);
    }

    public async Task DeleteAsync(string companyCode, string purchaseOrderNo, CancellationToken ct)
    {
        if (!await purchaseOrders.DeleteAsync(companyCode, purchaseOrderNo, ct)) throw new KeyNotFoundException("Purchase order not found.");
    }

    private async Task<PurchaseOrder> BuildAsync(PurchaseOrderHeaderDto header, IReadOnlyList<PurchaseOrderLineDto> requestedLines, CancellationToken ct)
    {
        var errors = new List<string>();
        Require(header.CD_FIRM, "Company code (CD_FIRM) is required.", errors); Require(header.NO_PO, "Purchase order number (NO_PO) is required.", errors); Require(header.DT_PO, "Purchase order date (DT_PO) is required.", errors); Require(header.CD_PARTNER, "Partner code (CD_PARTNER) is required.", errors);
        if (!DateOnly.TryParse(header.DT_PO, out _)) errors.Add("Purchase order date (DT_PO) must be a valid date.");
        var partner = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(header.CD_PARTNER) ? null : await partners.GetAsync(header.CD_FIRM, header.CD_PARTNER, ct);
        if (partner is null && !string.IsNullOrWhiteSpace(header.CD_FIRM) && !string.IsNullOrWhiteSpace(header.CD_PARTNER)) errors.Add("Partner code does not exist for the company code.");
        if (requestedLines.Count == 0) errors.Add("At least one purchase order line is required.");
        var lineNumbers = new HashSet<int>(); var rowKeys = new HashSet<string>(StringComparer.Ordinal); var lines = new List<PurchaseOrderLine>();
        foreach (var line in requestedLines)
        {
            if (line.CD_FIRM != header.CD_FIRM || line.NO_PO != header.NO_PO) errors.Add($"Line {line.NO_LINE} must use the same company code and order number as its header.");
            var rowKey = $"{line.CD_FIRM}::{line.NO_PO}::{line.NO_LINE}";
            if (line.NO_LINE <= 0 || !lineNumbers.Add(line.NO_LINE)) errors.Add($"Line primary key NO_LINE '{line.NO_LINE}' is invalid or duplicated.");
            if (!rowKeys.Add(rowKey)) errors.Add($"Line row key '{rowKey}' is duplicated.");
            Require(line.CD_ITEM, $"Line {line.NO_LINE}: item code (CD_ITEM) is required.", errors); Require(line.CD_WH, $"Line {line.NO_LINE}: warehouse code (CD_WH) is required.", errors);
            if (line.QT_PO <= 0) errors.Add($"Line {line.NO_LINE}: quantity must be greater than zero."); if (line.UM_PO < 0) errors.Add($"Line {line.NO_LINE}: unit price cannot be negative."); if (!DateOnly.TryParse(line.DT_DLV, out _)) errors.Add($"Line {line.NO_LINE}: delivery date must be a valid date.");
            var item = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(line.CD_ITEM) ? null : await items.GetAsync(header.CD_FIRM, line.CD_ITEM, ct);
            var warehouse = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(line.CD_WH) ? null : await warehouses.GetAsync(header.CD_FIRM, line.CD_WH, ct);
            if (item is null && !string.IsNullOrWhiteSpace(line.CD_ITEM)) errors.Add($"Line {line.NO_LINE}: item code does not exist for the company code.");
            if (warehouse is null && !string.IsNullOrWhiteSpace(line.CD_WH)) errors.Add($"Line {line.NO_LINE}: warehouse code does not exist for the company code.");
            if (item is null || warehouse is null) continue;
            var supply = decimal.Round(line.QT_PO * line.UM_PO, 0, MidpointRounding.AwayFromZero); var vat = decimal.Round(supply * .1m, 0, MidpointRounding.AwayFromZero);
            lines.Add(new PurchaseOrderLine { CD_FIRM = header.CD_FIRM, NO_PO = header.NO_PO, NO_LINE = line.NO_LINE, CD_ITEM = item.CD_ITEM, NM_ITEM = item.NM_ITEM, STND_ITEM = item.STND_ITEM, UNIT_ITEM = item.UNIT_ITEM, QT_PO = line.QT_PO, UM_PO = line.UM_PO, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = supply + vat, DT_DLV = line.DT_DLV, CD_WH = warehouse.CD_WH, NM_WH = warehouse.NM_WH, DC_RMK = line.DC_RMK ?? "" });
        }
        if (errors.Count > 0) throw new DomainValidationException(errors);
        return new PurchaseOrder { Header = new PurchaseOrderHeader { CD_FIRM = header.CD_FIRM, NO_PO = header.NO_PO, DT_PO = header.DT_PO, CD_PARTNER = partner!.CD_PARTNER, NM_PARTNER = partner.NM_PARTNER, CD_EMP = header.CD_EMP ?? "", NM_EMP = header.NM_EMP ?? "", CD_CURRENCY = header.CD_CURRENCY ?? "KRW", RT_EXCHANGE = header.RT_EXCHANGE, ST_PO = header.ST_PO ?? "New", DC_RMK = header.DC_RMK ?? "" }, Lines = lines.OrderBy(x => x.NO_LINE).ToArray() };
    }

    private static void Require(string? value, string message, ICollection<string> errors) { if (string.IsNullOrWhiteSpace(value)) errors.Add(message); }
    private static PurchaseOrderDetailDto ToDto(PurchaseOrder order) => new() { Header = new PurchaseOrderHeaderDto { CD_FIRM = order.Header.CD_FIRM, NO_PO = order.Header.NO_PO, DT_PO = order.Header.DT_PO, CD_PARTNER = order.Header.CD_PARTNER, NM_PARTNER = order.Header.NM_PARTNER, CD_EMP = order.Header.CD_EMP, NM_EMP = order.Header.NM_EMP, CD_CURRENCY = order.Header.CD_CURRENCY, RT_EXCHANGE = order.Header.RT_EXCHANGE, ST_PO = order.Header.ST_PO, DC_RMK = order.Header.DC_RMK, CD_USER_REG = order.Header.CD_USER_REG, TM_REG = order.Header.TM_REG, CD_USER_AMD = order.Header.CD_USER_AMD, TM_AMD = order.Header.TM_AMD }, Lines = order.Lines.Select(x => new PurchaseOrderLineDto { CD_FIRM = x.CD_FIRM, NO_PO = x.NO_PO, NO_LINE = x.NO_LINE, CD_ITEM = x.CD_ITEM, NM_ITEM = x.NM_ITEM, STND_ITEM = x.STND_ITEM, UNIT_ITEM = x.UNIT_ITEM, QT_PO = x.QT_PO, UM_PO = x.UM_PO, AM_SUPPLY = x.AM_SUPPLY, AM_VAT = x.AM_VAT, AM_TOTAL = x.AM_TOTAL, DT_DLV = x.DT_DLV, CD_WH = x.CD_WH, NM_WH = x.NM_WH, DC_RMK = x.DC_RMK, CD_USER_REG = x.CD_USER_REG, TM_REG = x.TM_REG, CD_USER_AMD = x.CD_USER_AMD, TM_AMD = x.TM_AMD }).ToArray() };
}
