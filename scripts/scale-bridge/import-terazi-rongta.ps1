# TeraziRongta C# kaynağını GitHub RetailEX reposuna ekler.
# PowerShell 5.1 uyumlu (&& kullanılmaz).
#
# Kullanım (Yönetici gerekmez):
#   powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\import-terazi-rongta.ps1

$ErrorActionPreference = "Stop"
$SourceDesktop = "C:\Users\FERHAT\Desktop\TeraziRongta"
$CloneDir = "C:\Users\FERHAT\RetailEX-git"
$RepoUrl = "https://github.com/ferhatdeveloper/RetailEX.git"
$Target = Join-Path $CloneDir "reference\TeraziRongta"

if (-not (Test-Path $SourceDesktop)) {
    Write-Error "Kaynak bulunamadi: $SourceDesktop"
}

if (-not (Test-Path $CloneDir)) {
    Write-Host "Repo klonlaniyor: $CloneDir"
    git clone $RepoUrl $CloneDir
} else {
    Write-Host "Mevcut klon: $CloneDir"
    Set-Location $CloneDir
    git pull origin main
}

Set-Location $CloneDir

# Hedef temizle (bin/obj/.vs haric kaynak)
if (Test-Path $Target) {
    Remove-Item -Recurse -Force $Target
}
New-Item -ItemType Directory -Force -Path $Target | Out-Null

# Solution + proje kaynaklari
Copy-Item "$SourceDesktop\WindowsFormsApplication1.sln" $Target -ErrorAction SilentlyContinue
$projDest = Join-Path $Target "WindowsFormsApplication1"
New-Item -ItemType Directory -Force -Path $projDest | Out-Null

$copyFiles = @(
    "labelScale.cs", "uDefine.cs", "Form1.cs", "Form1.Designer.cs", "Form1.resx",
    "Program.cs", "app.config", "WindowsFormsApplication1.csproj"
)
foreach ($f in $copyFiles) {
    $src = Join-Path "$SourceDesktop\WindowsFormsApplication1" $f
    if (Test-Path $src) { Copy-Item $src $projDest }
}

# Resmi Rongta DLL + config (calisan exe ile ayni)
$dllSrc = "$SourceDesktop\WindowsFormsApplication1\bin\x86\Debug"
$cfgSrc = if (Test-Path $SystemCfg) { $SystemCfg } else { Join-Path $dllSrc "SYSTEM.CFG" }
if (Test-Path "$dllSrc\rtslabelscale.dll") {
    Copy-Item "$dllSrc\rtslabelscale.dll" $projDest
    if (Test-Path $cfgSrc) {
        Copy-Item $cfgSrc $projDest -Force
        $bridgeCfg = Join-Path $CloneDir "scripts\scale-bridge\rongta-dll-bridge\SYSTEM.CFG"
        Copy-Item $cfgSrc $bridgeCfg -Force
        Write-Host "SYSTEM.CFG -> reference + rongta-dll-bridge ($cfgSrc)"
    } else {
        Write-Warning "SYSTEM.CFG bulunamadi: $cfgSrc"
    }
    Write-Host "rtslabelscale.dll kopyalandi"
} else {
    Write-Warning "rtslabelscale.dll bulunamadi: $dllSrc"
}

git add reference/TeraziRongta
git status
git commit -m "TeraziRongta C# kaynak ve rtslabelscale.dll"
git push origin main

Write-Host ""
Write-Host "Tamam. Cloud agent artik reference/TeraziRongta dosyalarini okuyabilir."
