namespace RetailEX.FastReportDesigner;

internal sealed record ReportTemplateRecord(
    Guid Id,
    string Name,
    string? FirmNr,
    string? PeriodNr,
    DateTimeOffset? UpdatedAt)
{
    public override string ToString()
    {
        var scope = string.Join("/", new[] { FirmNr, PeriodNr }.Where(x => !string.IsNullOrWhiteSpace(x)));
        var updated = UpdatedAt?.ToLocalTime().ToString("yyyy-MM-dd HH:mm") ?? "-";
        return string.IsNullOrWhiteSpace(scope) ? $"{Name} ({updated})" : $"{Name} [{scope}] ({updated})";
    }
}
