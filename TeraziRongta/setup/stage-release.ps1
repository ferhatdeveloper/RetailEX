# RetailEX TeraziManager — CI ve yerel Inno Setup icin staging klasoru hazirlar.
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot),
    [string]$StagingDir = (Join-Path $PSScriptRoot "staging"),
    [string]$Configuration = "Release",
    [string]$Platform = "x86"
)

$ErrorActionPreference = "Stop"

function Copy-ReleaseTree {
    param(
        [string]$Source,
        [string]$Destination,
        [switch]$IncludePdbs
    )

    if (-not (Test-Path $Source)) {
        throw "Derleme ciktisi bulunamadi: $Source"
    }

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null

    $include = @("*.exe", "*.dll", "*.config", "*.xml", "*.CFG", "*.RLS")
    if ($IncludePdbs) { $include += "*.pdb" }

    Get-ChildItem -Path $Source -File -Include $include | ForEach-Object {
        Copy-Item $_.FullName -Destination $Destination -Force
    }

    $rongta = Join-Path $Source "Rongta"
    if (Test-Path $rongta) {
        Copy-Item $rongta -Destination (Join-Path $Destination "Rongta") -Recurse -Force
    }
}

if (Test-Path $StagingDir) {
    Remove-Item $StagingDir -Recurse -Force
}

$appSource = Join-Path $Root "WindowsFormsApplication1\bin\$Platform\$Configuration"
$serviceSource = Join-Path $Root "TeraziRongta.Service\bin\$Platform\$Configuration"

Copy-ReleaseTree -Source $appSource -Destination (Join-Path $StagingDir "app")
Copy-ReleaseTree -Source $serviceSource -Destination (Join-Path $StagingDir "service")

$exampleConfig = Join-Path $Root "terazi-sync.example.json"
if (-not (Test-Path $exampleConfig)) {
    throw "Ornek config bulunamadi: $exampleConfig"
}
New-Item -ItemType Directory -Force -Path (Join-Path $StagingDir "config") | Out-Null
Copy-Item $exampleConfig (Join-Path $StagingDir "config\terazi-sync.example.json") -Force

$installScript = Join-Path $Root "install-service.ps1"
if (Test-Path $installScript) {
    Copy-Item $installScript (Join-Path $StagingDir "install-service.ps1") -Force
}

Write-Host "Staging hazir: $StagingDir"
Write-Host "  app     -> $appSource"
Write-Host "  service -> $serviceSource"
