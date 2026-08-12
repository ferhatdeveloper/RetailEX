# RetailEX TeraziManager kurulum paketi hazirligi
param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$payload = Join-Path $PSScriptRoot 'payload'
$mgr = Join-Path $ProjectRoot 'WindowsFormsApplication1\bin\x86\Release'
$svc = Join-Path $ProjectRoot 'TeraziRongta.Service\bin\x86\Release'

if (-not (Test-Path $mgr)) { throw "Release build missing: $mgr" }

New-Item -ItemType Directory -Force -Path (Join-Path $payload 'Rongta') | Out-Null

$mainFiles = @(
  'RetailEX.TeraziManager.exe',
  'RetailEX.TeraziManager.exe.config',
  'TeraziRongta.Core.dll',
  'Newtonsoft.Json.dll',
  'rtslabelscale.dll',
  'SYSTEM.CFG',
  'testRT.RLS'
)
foreach ($f in $mainFiles) {
  Copy-Item (Join-Path $mgr $f) (Join-Path $payload $f) -Force
}
Copy-Item (Join-Path $svc 'RetailEX_Terazi_Sync.exe') (Join-Path $payload 'RetailEX_Terazi_Sync.exe') -Force
Copy-Item (Join-Path $ProjectRoot 'terazi-sync.example.json') (Join-Path $payload 'terazi-sync.example.json') -Force
Copy-Item (Join-Path $mgr 'Rongta\*') (Join-Path $payload 'Rongta') -Force -Recurse

Write-Host "Payload guncellendi: $payload"
Copy-Item (Join-Path $PSScriptRoot 'install-service.ps1') (Join-Path $payload 'install-service.ps1') -Force

