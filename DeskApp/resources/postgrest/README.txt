PostgREST (Windows x64) — AsinERP kurulum paketine gömülür
===========================================================

Bu klasördeki postgrest.exe repoda tutulmaz (.gitignore). Üretmek için kök dizinde:

  npm run postgrest:fetch

Windows NSIS kurulumu, `resources\postgrest\postgrest.exe` varsa GitHub indirmeden
INSTDIR'e kopyalar. Yoksa install-postgrest.ps1 yedek olarak indirir.

Sürüm varsayılanı: package.json tauri:build öncesi fetch script içinde (POSTGREST_VERSION ile değiştirilebilir).

Resmi sürümler: https://github.com/PostgREST/postgrest/releases
Windows zip dosya adı: postgrest-v{VERSION}-windows-x86-64.zip
