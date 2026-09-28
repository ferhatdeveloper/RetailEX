RetailEX Portable
================

Kurulum: RetailEX-Portable-{version}.exe dosyasını Yönetici olarak çalıştırın (UAC: Evet).
Varsayılan dizin: C:\RetailEx\App

Kurulum şu Windows hizmetlerini otomatik kurar:
  - RetailEX_Service (senkron)
  - RetailEX_SQL_Bridge (port 3001)
  - RetailEX_Printer
  - RetailEX_PostgREST (port 3002)

Hizmetler eksikse: install-services-manual.cmd (Yönetici)

Sonraki adımlar:
  1. RetailEX_Config.exe → C:\RetailEx\config.db
  2. RetailEX_Tools.exe setup-db (veya menü 9)
  3. retailex.exe

Güncelleme: RetailEX_Tools.exe update (menü 7)
