using G2Erp.Api.Contracts;
using G2Erp.Api.Domain;
using G2Erp.Api.Repositories;

namespace G2Erp.Api.Services;

public sealed class SalesOrderService(
    ISalesOrderRepository salesOrderRepository,
    IPartnerRepository partnerRepository,
    IItemRepository itemRepository) : ISalesOrderService
{
    public async Task<IReadOnlyList<SalesOrderDto>> GetAllAsync(CancellationToken cancellationToken) =>
        (await salesOrderRepository.GetAllAsync(cancellationToken)).Select(ToDto).ToArray();

    public async Task<SalesOrderDto?> GetAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken)
    {
        var order = await salesOrderRepository.GetAsync(companyCode, salesOrderNo, cancellationToken);
        return order is null ? null : ToDto(order);
    }

    public async Task<SalesOrderDto> CreateAsync(UpsertSalesOrderRequest request, CancellationToken cancellationToken)
    {
        var order = await ValidateAndBuildAsync(request, cancellationToken);
        var existing = await salesOrderRepository.GetAsync(order.Header.CD_FIRM, order.Header.NO_SO, cancellationToken);
        if (existing is not null) throw new DomainConflictException("The header primary key (CD_FIRM, NO_SO) already exists.");

        await salesOrderRepository.AddAsync(order, cancellationToken);
        return ToDto(order);
    }

    public async Task<SalesOrderDto> UpdateAsync(string companyCode, string salesOrderNo, UpsertSalesOrderRequest request, CancellationToken cancellationToken)
    {
        if (request.Header.CD_FIRM != companyCode || request.Header.NO_SO != salesOrderNo)
            throw new DomainValidationException(["The route primary key must match Header.CD_FIRM and Header.NO_SO."]);

        var existing = await salesOrderRepository.GetAsync(companyCode, salesOrderNo, cancellationToken);
        if (existing is null) throw new KeyNotFoundException("Sales order not found.");

        var order = await ValidateAndBuildAsync(request, cancellationToken);
        await salesOrderRepository.UpdateAsync(order, cancellationToken);
        return ToDto(order);
    }

    public async Task DeleteAsync(string companyCode, string salesOrderNo, CancellationToken cancellationToken)
    {
        if (!await salesOrderRepository.DeleteAsync(companyCode, salesOrderNo, cancellationToken))
            throw new KeyNotFoundException("Sales order not found.");
    }

    private async Task<SalesOrder> ValidateAndBuildAsync(UpsertSalesOrderRequest request, CancellationToken cancellationToken)
    {
        var errors = new List<string>();
        var header = request.Header;
        Require(header.CD_FIRM, "Company code (CD_FIRM) is required.", errors);
        Require(header.NO_SO, "Sales order number (NO_SO) is required.", errors);
        Require(header.DT_SO, "Sales order date (DT_SO) is required.", errors);
        Require(header.CD_PARTNER, "Partner code (CD_PARTNER) is required.", errors);
        if (!DateOnly.TryParse(header.DT_SO, out _)) errors.Add("Sales order date (DT_SO) must be a valid date.");

        var partner = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(header.CD_PARTNER)
            ? null
            : await partnerRepository.GetAsync(header.CD_FIRM, header.CD_PARTNER, cancellationToken);
        if (partner is null && !string.IsNullOrWhiteSpace(header.CD_FIRM) && !string.IsNullOrWhiteSpace(header.CD_PARTNER))
            errors.Add("Partner code does not exist for the company code.");

        if (request.Lines.Count == 0) errors.Add("At least one sales order line is required.");
        var seenLineKeys = new HashSet<int>();
        var lines = new List<SalesOrderLine>();
        foreach (var line in request.Lines)
        {
            if (line.CD_FIRM != header.CD_FIRM || line.NO_SO != header.NO_SO)
                errors.Add($"Line {line.NO_LINE} must use the same company code and order number as its header.");
            if (line.NO_LINE <= 0 || !seenLineKeys.Add(line.NO_LINE)) errors.Add($"Line primary key NO_LINE '{line.NO_LINE}' is invalid or duplicated.");
            Require(line.CD_ITEM, $"Line {line.NO_LINE}: item code (CD_ITEM) is required.", errors);
            if (line.QT_SO <= 0) errors.Add($"Line {line.NO_LINE}: quantity must be greater than zero.");
            if (line.UM_SO < 0) errors.Add($"Line {line.NO_LINE}: unit price cannot be negative.");
            if (!DateOnly.TryParse(line.DT_DLV, out _)) errors.Add($"Line {line.NO_LINE}: delivery date must be a valid date.");

            var item = string.IsNullOrWhiteSpace(header.CD_FIRM) || string.IsNullOrWhiteSpace(line.CD_ITEM)
                ? null
                : await itemRepository.GetAsync(header.CD_FIRM, line.CD_ITEM, cancellationToken);
            if (item is null)
            {
                if (!string.IsNullOrWhiteSpace(line.CD_ITEM)) errors.Add($"Line {line.NO_LINE}: item code does not exist for the company code.");
                continue;
            }

            var supply = decimal.Round(line.QT_SO * line.UM_SO, 0, MidpointRounding.AwayFromZero);
            var vat = decimal.Round(supply * 0.1m, 0, MidpointRounding.AwayFromZero);
            lines.Add(new SalesOrderLine
            {
                CD_FIRM = header.CD_FIRM, NO_SO = header.NO_SO, NO_LINE = line.NO_LINE,
                CD_ITEM = item.CD_ITEM, NM_ITEM = item.NM_ITEM, STND_ITEM = item.STND_ITEM, UNIT_ITEM = item.UNIT_ITEM,
                QT_SO = line.QT_SO, UM_SO = line.UM_SO, AM_SUPPLY = supply, AM_VAT = vat, AM_TOTAL = supply + vat,
                DT_DLV = line.DT_DLV, DC_RMK = line.DC_RMK ?? ""
            });
        }

        if (errors.Count > 0) throw new DomainValidationException(errors);
        return new SalesOrder
        {
            Header = new SalesOrderHeader
            {
                CD_FIRM = header.CD_FIRM, NO_SO = header.NO_SO, DT_SO = header.DT_SO,
                CD_PARTNER = partner!.CD_PARTNER, NM_PARTNER = partner.NM_PARTNER, CD_EMP = header.CD_EMP ?? "",
                ST_SO = header.ST_SO ?? "New", DC_RMK = header.DC_RMK ?? "", MAIL_ID = header.MAIL_ID
            },
            Lines = lines.OrderBy(x => x.NO_LINE).ToArray()
        };
    }

    private static void Require(string? value, string message, ICollection<string> errors)
    {
        if (string.IsNullOrWhiteSpace(value)) errors.Add(message);
    }

    private static SalesOrderDto ToDto(SalesOrder order) => new()
    {
        Header = new SalesOrderHeaderDto
        {
            CD_FIRM = order.Header.CD_FIRM, NO_SO = order.Header.NO_SO, DT_SO = order.Header.DT_SO,
            CD_PARTNER = order.Header.CD_PARTNER, NM_PARTNER = order.Header.NM_PARTNER, CD_EMP = order.Header.CD_EMP,
            ST_SO = order.Header.ST_SO, DC_RMK = order.Header.DC_RMK, MAIL_ID = order.Header.MAIL_ID
        },
        Lines = order.Lines.Select(line => new SalesOrderLineDto
        {
            CD_FIRM = line.CD_FIRM, NO_SO = line.NO_SO, NO_LINE = line.NO_LINE, CD_ITEM = line.CD_ITEM,
            NM_ITEM = line.NM_ITEM, STND_ITEM = line.STND_ITEM, UNIT_ITEM = line.UNIT_ITEM, QT_SO = line.QT_SO,
            UM_SO = line.UM_SO, AM_SUPPLY = line.AM_SUPPLY, AM_VAT = line.AM_VAT, AM_TOTAL = line.AM_TOTAL,
            DT_DLV = line.DT_DLV, DC_RMK = line.DC_RMK
        }).ToArray()
    };
}
