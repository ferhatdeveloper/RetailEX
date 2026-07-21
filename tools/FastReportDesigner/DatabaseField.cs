namespace RetailEX.FastReportDesigner;

internal sealed record DatabaseField(
    string SchemaName,
    string ActualTableName,
    string DisplayTableName,
    string ColumnName,
    string DataType,
    int OrdinalPosition)
{
    public string FieldPath => $"{DisplayTableName}.{ColumnName}";

    public string QualifiedTableName =>
        SchemaName.Equals("public", StringComparison.OrdinalIgnoreCase)
            ? ActualTableName
            : $"{SchemaName}.{ActualTableName}";
}
