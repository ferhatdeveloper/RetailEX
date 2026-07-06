param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'prepare-payload.ps1') -ProjectRoot $ProjectRoot

$isccCandidates = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
)
$iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'ISCC.exe bulunamadi. Inno Setup 6 kurun.' }

& $iscc (Join-Path $PSScriptRoot 'setup.iss')
Write-Host "Setup olusturuldu: $(Join-Path $PSScriptRoot 'output')"
