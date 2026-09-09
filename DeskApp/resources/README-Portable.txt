RetailEX Portable
=================

Bu dosya zip paketine VERSION.txt ile birlikte kopyalanır; asıl metin
scripts/pack-retailex-portable-zip.mjs içinde üretilir.

Hızlı özet
- Zip'i C:\RetailEx\App\ altına açın (PostgreSQL elle kurulu olmalı)
- RetailEX_Config.exe → C:\RetailEx\config.db
- RetailEX_Tools.exe setup-db  (DB oluştur + migration) veya menü 9
- retailex.exe
- Güncelleme: RetailEX_Tools.exe update / menü 7
- SQL güncelle + migrate: RetailEX_Tools.exe sync-migrate / menü C
- Yalnız SQL çek: RetailEX_Tools.exe fetch-sql / menü B
- Yalnız migration: RetailEX_Tools.exe migrate / menü 8

RetailEX_Tools.exe zip kökünde ve RetailEXTools\ altında bulunur.
SQL kaynağı: GitHub ferhatdeveloper/RetailEX (ref: main, RETAILEX_SQL_REF ile değiştirilebilir)

Mark of the Web: scripts/customer-unblock-portable.ps1
