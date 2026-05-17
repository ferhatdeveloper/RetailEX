# REXERP (Flutter UI Skeleton)

Bu klasor, RetailEX projesi referans alinarak olusturulmus Flutter tabanli bir **UI iskeletidir**.

## Hedef

- Sadece arayuz yapisi ve modul navigasyonu
- Is mantigi, API, veritabani ve auth entegrasyonu **yok**
- Flat UI (duz, cizgisel, elevasyonsuz) tasarim dili
- RetailEX modullerine paralel ekran iskeleti:
  - Dashboard
  - POS
  - Yonetim
  - WMS
  - Restoran
  - Guzellik
  - Muhasebe

## Klasor Yapisi

- `lib/app`: uygulama kabugu ve tema
- `lib/core/navigation`: route sabitleri ve modul anahtarlari
- `lib/core/widgets`: ortak UI shell
- `lib/features/*/presentation`: modullerin placeholder ekranlari

## Sonraki Adimlar

1. Design token sistemi (renk, tipografi, spacing) ekleme
2. Ekran bazli widget parcalama
3. Gercek auth akisi ve rol bazli menu
4. API katmani baglantisi
