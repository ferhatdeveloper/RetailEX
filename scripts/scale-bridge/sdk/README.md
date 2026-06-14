# RetailEX Terazi SDK

## Rongta RLS1000 / RLS1100

Rongta resmi sitesindeki [SDK indirme](https://www.rongtatech.com/category/downloads/9) sayfası **yalnızca termal/yazıcı** cihazları içerir; etiket terazisi (RLS1000/RLS1100) için DLL/npm paketi **yayımlanmamıştır**.

Etiket terazisi entegrasyonu, **RLS1000 Software User Manual** içindeki **TCP/IP protokol spesifikasyonuna** dayanır:

- Paket: `4 bayt uzunluk + 4 bayt komut + ASCII veri`
- Komutlar: `0201` başlat, `0102` ACK, `0110` PLU, `0120` satış isteği, `0210` satış kaydı, `0220` satış sonu

Bu dizindeki `rongta/` modülü bu spesifikasyonun RetailEX uygulamasıdır (iç SDK).

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
