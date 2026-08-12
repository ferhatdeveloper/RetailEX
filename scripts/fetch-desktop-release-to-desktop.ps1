# GitHub Actions release kurulumunu Windows Masaüstü'ne indirir.
# Kullanım: .\scripts\fetch-desktop-release-to-desktop.ps1
#          .\scripts\fetch-desktop-release-to-desktop.ps1 -Tag app-v0.1.151

param(
  [string]$Tag = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$argsList = @()
if ($Tag) { $argsList += @("--tag", $Tag) }
if ($OutDir) { $argsList += @("--out", $OutDir) }

Push-Location $root
try {
  node (Join-Path $PSScriptRoot "fetch-desktop-release-to-desktop.mjs") @argsList
} finally {
  Pop-Location
}
