# RetailEX CallerID Bridge (Android MVP)

Bu proje, mevcut RetailEX Android uygulamasından ayridir. Telefona gelen cagri/SMS/bildirim olaylarini LAN uzerinden bilgisayardaki `pg_bridge` servisine yollar.

## Ne yapiyor?

- Gelen cagrida numarayi push eder
- Gelen SMS'te gonderen numara + kisa mesaj ozetini push eder
- WhatsApp ve WhatsApp Business bildirimlerinden mesaj/arama olaylarini push eder
- Agda PC otomatik bulma: once mDNS/NSD dener, bulunamazsa subnet scan yapar
- Manuel endpoint girisi ve ayarlar SQLite veritabanina kaydedilir
- Bridge saglik kontrolu: bridge kapaliysa veya ayni agda degilseniz uygulama ekranda uyari verir
- Push hedefi: `http://PC_IP:3001/api/caller_id/push`

## Bilgisayar tarafi

1. RetailEX klasorunde bridge baslat:
   - `npm run bridge`
2. Gerekirse token tanimla:
   - `CALLER_ID_PUSH_TOKEN=guclu_token`
3. Android uygulamasinda endpoint:
   - `http://<pc-lan-ip>:3001/api/caller_id/push`

## Android kurulum

1. Android Studio ile `android-callerid-bridge` klasorunu ac.
2. Uygulamayi cihaza kur.
3. "Agda PC otomatik bul (mDNS/scan)" ile endpointi bulmayi dene.
4. Gerekirse endpointi manuel yaz (ornek: `http://192.168.1.45:3001/api/caller_id/push`).
5. Endpoint + token + cihaz adini kaydetmek icin "Kaydet ve izin iste" butonuna bas.
6. Notification Listener ekraninda uygulamayi etkinlestir.

## Notlar

- Android surum/ureticiye gore cagri numarasi her zaman dolu gelmeyebilir.
- WhatsApp icerigine dogrudan API ile degil, sadece bildirim metni kadar erisilir.
- WhatsApp cagrisi aktif ekranda ve bildirim dusmeden sonlanirsa event kacabilir.
- Bu MVP ham event forwarding icindir; tam urun icin queue/retry, TLS ve cihaz kimlik dogrulamasi eklenmelidir.
