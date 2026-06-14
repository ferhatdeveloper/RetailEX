# RetailEX Terazi Köprüsü — Windows Güvenlik Duvarı kuralları
# Kurulum / kaldırma sırasında yönetici olarak çalıştırılır.
param(
  [ValidateSet('Install', 'Uninstall')]
  [string]$Action = 'Install',
  [string]$InstallDir = '',
  [int]$Port = 0,
  [string]$ConfigPath = 'C:\ProgramData\RetailEX\scale-bridge.json'
)

$ErrorActionPreference = 'Stop'

$RulePrefix = 'RetailEX Terazi Koprusu'

function Write-Step([string]$Message) {
  Write-Host "[firewall] $Message"
}

function Test-IsAdmin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-ListenPort {
  param([int]$OverridePort, [string]$ConfigFile)
  if ($OverridePort -gt 0) { return $OverridePort }
  if (Test-Path $ConfigFile) {
    try {
      $cfg = Get-Content -Raw -Encoding UTF8 $ConfigFile | ConvertFrom-Json
      $p = [int]$cfg.listenPort
      if ($p -gt 0 -and $p -le 65535) { return $p }
    } catch {
      Write-Step "Config okunamadi, varsayilan port 3012 kullanilacak."
    }
  }
  return 3012
}

function Get-RuleNames([int]$ListenPort) {
  @(
    "$RulePrefix — gelen HTTP (TCP $ListenPort)",
    "$RulePrefix — node.exe yerel ag (giden)"
  )
}

function Remove-FirewallRules([string[]]$Names) {
  foreach ($name in $Names) {
    $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
    if ($existing) {
      Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
      Write-Step "Kaldirildi: $name"
    }
  }
}

function Ensure-FirewallRule {
  param(
    [string]$DisplayName,
    [string]$Direction,
    [string]$ActionType = 'Allow',
    [string]$Protocol = 'TCP',
    [string]$Profile = 'Private,Domain',
    [int]$LocalPort = 0,
    [string]$Program = '',
    [string]$RemoteAddress = ''
  )

  $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Step "Zaten var: $DisplayName"
    return
  }

  $params = @{
    DisplayName = $DisplayName
    Direction   = $Direction
    Action      = $ActionType
    Protocol    = $Protocol
    Profile     = $Profile
    Enabled     = 'True'
  }
  if ($LocalPort -gt 0) { $params.LocalPort = $LocalPort }
  if ($Program) { $params.Program = $Program }
  if ($RemoteAddress) { $params.RemoteAddress = $RemoteAddress }

  New-NetFirewallRule @params | Out-Null
  Write-Step "Eklendi: $DisplayName"
}

function Install-FirewallRules {
  param([int]$ListenPort, [string]$AppDir)

  # Köprü HTTP API — ayni agdaki RetailEX / merkez erisimi
  Ensure-FirewallRule `
    -DisplayName "$RulePrefix — gelen HTTP (TCP $ListenPort)" `
    -Direction Inbound `
    -LocalPort $ListenPort

  # node.exe — terazi tarama ve PLU gonderimi (yerel ag subnet)
  $nodeExe = Join-Path $AppDir 'node\node.exe'
  if (Test-Path $nodeExe) {
    Ensure-FirewallRule `
      -DisplayName "$RulePrefix — node.exe yerel ag (giden)" `
      -Direction Outbound `
      -Program $nodeExe `
      -RemoteAddress 'LocalSubnet'
  } else {
    Write-Step "node.exe bulunamadi ($nodeExe); giden terazi kurali atlandi."
  }
}

if (-not (Test-IsAdmin)) {
  Write-Step "Yonetici hakki yok; guvenlik duvari kurallari atlandi."
  exit 0
}

$listenPort = Resolve-ListenPort -OverridePort $Port -ConfigFile $ConfigPath
if (-not $InstallDir) {
  $InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  if ($InstallDir -match 'scale-bridge$') {
    $InstallDir = Split-Path -Parent $InstallDir
  }
}

$ruleNames = Get-RuleNames -ListenPort $listenPort

if ($Action -eq 'Uninstall') {
  Remove-FirewallRules -Names $ruleNames
  exit 0
}

try {
  Install-FirewallRules -ListenPort $listenPort -AppDir $InstallDir
  Write-Step "Guvenlik duvari hazir (gelen TCP $listenPort, giden node yerel ag)."
}
catch {
  Write-Step "Hata: $($_.Exception.Message)"
  exit 1
}
