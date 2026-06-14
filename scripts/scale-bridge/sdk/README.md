# RetailEX Terazi SDK

## Rongta RLS1000 / RLS1100

Resmi indirme portalı: [rongtatech.com/download/](https://www.rongtatech.com/download/)

Ayrıntılı dosya listesi: [OFFICIAL_SOURCES.md](./OFFICIAL_SOURCES.md)

### Sitede ne var, ne yok?

| İndirme kategorisi | Terazi için? |
|--------------------|--------------|
| [SDK](https://www.rongtatech.com/category/downloads/9) | **Hayır** — yalnızca termal/yazıcı (RP, RPP, ACE…) |
| [Tool Download](https://www.rongtatech.com/category/downloads/4) | **Hayır** — yazıcı araçları |
| [Driver Download](https://www.rongtatech.com/category/downloads/1) | **Hayır** — yazıcı sürücüleri |
| **User Manual** (portal araması: «label scale» / «RLS») | **Evet** |

Etiket terazisi için resmi **DLL/npm SDK yok**. Entegrasyon kaynağı:

**[Label Scale Software User Manual](https://file.globalso.com/file_manage/4365/20251121/label-scale-software-user-manual.pdf)** — §2.2 TCP/IP protokolü:

- Paket: `4 bayt uzunluk + 4 bayt komut + ASCII veri`
- Komutlar: `0201` başlat, `0102` ACK, `0110` PLU, `0120` satış isteği, `0210` satış kaydı, `0220` satış sonu

`rongta/` modülü bu PDF spesifikasyonunun RetailEX uygulamasıdır (iç SDK). RLS1000.exe veya yazıcı SDK zip’leri kullanılmaz.

Resmi PDF’leri yerel indirmek için:

```bash
npm run scale-bridge:fetch-docs
```

## Kullanım (Node / scale-bridge)

```js
import { RongtaScaleClient } from './sdk/rongta/index.mjs';

const client = new RongtaScaleClient({ ipAddress: '192.168.1.200', port: 20304 });
const probe = await client.probe();
const test = await client.testConnection();
const sync = await client.sendPlu(records);
const sales = await client.fetchSalesRecords();
```

## Diğer markalar

Bizerba, Toledo, CAS vb. için ayrı protokoller gerekir; `scaleProtocol.ts` marka bazlı yönlendirme sağlar. Rongta dışı markalar henüz bu SDK kapsamında değildir.
