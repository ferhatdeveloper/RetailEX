RetailEX Portable
================

Kurulum: RetailEX-Portable-{version}.exe (Yonetici / UAC: Evet)
Varsayilan dizin: C:\RetailEx\App

Hizmetler: Sync, SQL Bridge, Printer, PostgREST

Akilli Uygulama Denetimi (SAC) engellediyse
------------------------------------------
1. Windows Guvenlik > Uygulama ve tarayici denetimi
2. Akilli Uygulama Denetimi = Kapali
3. C:\RetailEx\App\unblock-and-install-services.cmd (Yonetici)

veya: install-services-manual.cmd

Sonraki adimlar
  1. RetailEX_Config.exe → C:\RetailEx\config.db
  2. RetailEX_Tools.exe setup-db
  3. retailex.exe

Guncelleme: RetailEX_Tools.exe update (menu 7)
