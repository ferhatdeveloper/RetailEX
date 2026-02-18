Get-ChildItem -Path d:\RetailEX -Recurse -File | 
Where-Object { 
    $_.FullName -notmatch '\\node_modules\\' -and 
    $_.FullName -notmatch '\\target\\' -and 
    $_.FullName -notmatch '\\\.git\\' 
} | ForEach-Object {
    git add $_.FullName
}
