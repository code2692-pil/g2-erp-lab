using G2Erp.Api.Repositories;
using Xunit;

namespace G2Erp.Api.Tests;

public sealed class SqlServerConnectionFactoryTests
{
    [Theory]
    [InlineData("Server=localhost;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True")]
    [InlineData("Server=127.0.0.1;Database=G2ERP_DEV_LOCAL;Integrated Security=True;Encrypt=True;TrustServerCertificate=True")]
    public void ValidateLocalOnly_AllowsOnlyApprovedLocalDevelopmentTargets(string connectionString) =>
        SqlServerConnectionFactory.ValidateLocalOnly(connectionString, true, true, "G2ERP_DEV_LOCAL", "G2ERP_DEV_LOCAL_TEST");

    [Theory]
    [InlineData("Server=remote.example.test;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=True")]
    [InlineData("Server=localhost;Database=master;Trusted_Connection=True;Encrypt=True")]
    [InlineData("Server=localhost;Database=G2ERP_DEV_LOCAL_TEST;User ID=sa;Password=not-a-real-password;Encrypt=True")]
    public void ValidateLocalOnly_RejectsRemoteUnapprovedAndSqlAuthenticationTargets(string connectionString) =>
        Assert.Throws<InvalidOperationException>(() => SqlServerConnectionFactory.ValidateLocalOnly(connectionString, true, true, "G2ERP_DEV_LOCAL", "G2ERP_DEV_LOCAL_TEST"));

    [Fact]
    public void ValidateLocalOnly_RejectsUnencryptedProductionConnection() =>
        Assert.Throws<InvalidOperationException>(() => SqlServerConnectionFactory.ValidateLocalOnly("Server=localhost;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False", false, true, "G2ERP_DEV_LOCAL", "G2ERP_DEV_LOCAL_TEST"));
}
