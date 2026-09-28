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
  1. retailex.exe — giriste siyah Kurulum sihirbazi (veya degnek ikonu)
  2. Istege bagli: RetailEX_Config.exe → C:\RetailEx\config.db
  3. Istege bagli: RetailEX_Tools.exe setup-db

Kurulum EXE acilmiyorsa
  - UAC'ta Evet deyin
  - SAC kapali olsun (yukari)
  - %TEMP%\retailex_portable_setup.log var mi bakin (onInit)
  - Sag tik → Ozellikler → Engellemeyi kaldir

Guncelleme: RetailEX_Tools.exe update (menu 7)
