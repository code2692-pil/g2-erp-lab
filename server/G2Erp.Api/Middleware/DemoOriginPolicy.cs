namespace G2Erp.Api.Middleware;

public static class DemoOriginPolicy
{
    public static bool IsAllowed(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttp || uri.Port != 5173) return false;
        if (uri.Host is "localhost" or "127.0.0.1") return true;
        if (!System.Net.IPAddress.TryParse(uri.Host, out var address)) return false;
        var bytes = address.GetAddressBytes();
        return bytes.Length == 4 && (bytes[0] == 10 || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31));
    }
}
