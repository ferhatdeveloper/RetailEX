Get-ChildItem -Path src -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\target\\' } | ForEach-Object {
    git add $_.FullName
}
Get-ChildItem -Path src-tauri -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\target\\' } | ForEach-Object {
    git add $_.FullName
}
