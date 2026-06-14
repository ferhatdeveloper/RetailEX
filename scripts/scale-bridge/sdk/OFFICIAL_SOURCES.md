# Rongta resmi indirme kaynakları

Ana portal: [rongtatech.com/download/](https://www.rongtatech.com/download/)

Üst menü kategorileri:

| Kategori | URL | Terazi (RLS) için |
|----------|-----|------------------|
| Driver Download | [/category/downloads/1](https://www.rongtatech.com/category/downloads/1) | Hayır — termal/yazıcı sürücüleri |
| User Manual | [/category/downloads/3](https://www.rongtatech.com/category/downloads/3) | **Evet** — RLS ve Label Scale kılavuzları |
| Tool Download | [/category/downloads/4](https://www.rongtatech.com/category/downloads/4) | Hayır — yazıcı araçları |
| SDK | [/category/downloads/9](https://www.rongtatech.com/category/downloads/9) | Hayır — RP/RPP termal yazıcı SDK’ları |

> RLS1000 ürün sayfasındaki «SDK» bağlantısı da aynı yazıcı SDK sayfasına gider. Etiket terazisi için ayrı DLL/SDK **yayımlanmamıştır**.

## Etiket terazisi — indirilebilir resmi dosyalar

Arama API’si (`download` modülü, «RLS» / «label scale») ile doğrulanmış bağlantılar:

### Entegrasyon / «SDK» eşdeğeri (TCP protokolü)

| Dosya | URL | RetailEX kullanımı |
|-------|-----|-------------------|
| **Label Scale Software User Manual** | [PDF](https://file.globalso.com/file_manage/4365/20251121/label-scale-software-user-manual.pdf) | **Birincil kaynak** — §2.2 TCP/IP, komut tablosu (`0201`, `0102`, `0110`, `0120`, `0210`, `0220`). `sdk/rongta/` buradan türetilmiştir. |

### Donanım ve kullanım kılavuzları

| Dosya | URL |
|-------|-----|
| RLS Series User manual_V1.3_EN | [PDF](https://file.globalso.com/file_manage/4365/20251121/rls-series-user-manual_v1-3_en.pdf) |
| RLS Series User manual_NTEP_V1.3_EN | [OneDrive](https://1drv.ms/b/s!AmNw3pDRUHq0gVdHBOdhxLS4cQ7S?e=iGYcUP) |
| Label Scale User Manual（US） | [PDF](https://file.globalso.com/file_manage/4365/20251121/label-scale-user-manual-us-v1-3.pdf) |
| Label Scale Simple User Manual | [PDF](https://file.globalso.com/file_manage/4365/20251114/label-scale-simple-user-manual.pdf) |
| RLS1315&RLS1330 User manual_V1.2_EN | [PDF](https://file.globalso.com/file_manage/4365/20251121/rls1315-rls1330-user-manual_v1-2_en.pdf) |
| RLS1515&RLS1530 User manual_V1.3_EN | [PDF](https://file.globalso.com/file_manage/4365/20251121/rls1515-rls1530-user-manual_v1-3_en.pdf) |

### Sitede listelenmeyen / ayrı temin

- **RLS1000.exe** (üst bilgisayar yazılımı, PLU/etiket yönetimi): genelde terazi CD’si veya distribütör; [download](https://www.rongtatech.com/download/) sayfasında doğrudan zip/exe **yok**.
- Manuelde anlatılan **Windows mesaj entegrasyonu** (`RegisterWindowMessage('RLS1000')`, F8/F9): RLS1000.exe çalışırken kullanılır; RetailEX bunun yerine doğrudan TCP kullanır.

## Yerel kopya indirme

```bash
npm run scale-bridge:fetch-docs
```

Çıktı: `scripts/scale-bridge/sdk/docs/` (PDF’ler `.gitignore` ile repoya girmez).

## Sonuç

| Beklenti | Gerçek |
|----------|--------|
| Terazi DLL SDK | Yok |
| Terazi npm paketi | Yok |
| TCP protokol spesifikasyonu | **Label Scale Software User Manual** PDF |
| RetailEX implementasyonu | `scripts/scale-bridge/sdk/rongta/` |
