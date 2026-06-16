# TeraziRongta — C# referans uygulaması

Çalışan Rongta entegrasyonunuz (`C:\Users\FERHAT\Desktop\TeraziRongta`) buraya kopyalanırsa RetailEX ile birebir karşılaştırılır.

## Otomatik entegrasyon (RetailEX 0.1.88+)

C# kodu olmadan da şu modlar eklendi:

| Mod | Açıklama |
|-----|----------|
| **Gelen TCP (background)** | RLS1000/C# gibi: PC dinler, terazi bağlanır → IP otomatik bulunur |
| **İki aşamalı tarama** | TCP port + Rongta protokol; TCP adayları da listelenir |
| **Çoklu alt ağ** | Tüm ağ kartları taranır |

Köprü dinleme portları: `20304, 4001, 8888, 3000, 9200, 19204`

## Terazi menü ayarı (önemli)

Terazide **PC IP adresi** bu mağaza bilgisayarının IP'si olmalı. Terazi PLU güncellemesi veya ağ testi yapınca köprü otomatik görür (`/scales/inbound`).

## Kopyalama (tam C# port için)

```powershell
xcopy "C:\Users\FERHAT\Desktop\TeraziRongta" "C:\path\to\RetailEX\reference\TeraziRongta" /E /I /Y
git add reference/TeraziRongta
git commit -m "TeraziRongta C# referans kaynağı"
git push origin main
```

## Teşhis

```bash
npm run scale:bridge:diagnose -- 192.168.1.87
npm run scale:bridge:diagnose -- --scan
```

## RetailEX dosyaları

- `scripts/scale-bridge/listen.mjs` — gelen TCP
- `scripts/scale-bridge/scan.mjs` — ağ taraması
- `scripts/scale-bridge/sdk/rongta/` — protokol SDK
