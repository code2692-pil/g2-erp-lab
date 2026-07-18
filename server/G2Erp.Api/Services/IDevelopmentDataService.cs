using G2Erp.Api.Contracts;

namespace G2Erp.Api.Services;

public interface IDevelopmentDataService
{
    Task<DevelopmentDataEnvironmentDto> GetStatusAsync(CancellationToken cancellationToken);
    Task<DevelopmentDataSummaryDto> GetSummaryAsync(CancellationToken cancellationToken);
    Task<DevelopmentDataPreviewDto> PreviewAsync(DevelopmentDataRequest request, CancellationToken cancellationToken);
    Task<DevelopmentDataOperationDto> SeedAsync(string scope, CancellationToken cancellationToken);
    Task<DevelopmentDataOperationDto> CleanupAsync(DevelopmentDataRequest request, CancellationToken cancellationToken);
    Task<DevelopmentDataE2ERemnantsDto> GetE2ERemnantsAsync(CancellationToken cancellationToken);
}
