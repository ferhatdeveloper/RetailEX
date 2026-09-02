namespace RetailEX.PrintServer.Core.PrintQueue;

/// <summary>
/// Tek bir (firm, period) tenant'inin PostgREST kapsamini temsil eder.
/// TableName her zaman <c>rest.rex_NNN_NN_print_jobs</c> formundadir.
/// </summary>
public sealed record TenantContext(string FirmNr, string PeriodNr, string TableName);
