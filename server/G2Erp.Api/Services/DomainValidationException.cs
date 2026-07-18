namespace G2Erp.Api.Services;

public sealed class DomainValidationException : Exception
{
    public DomainValidationException(IReadOnlyList<string> errors) : base("Domain validation failed.") => Errors = errors;
    public IReadOnlyList<string> Errors { get; }
}

public sealed class DomainConflictException(string message) : Exception(message);
