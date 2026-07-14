# Rongta LAN — mobil terazi notları

RetailEX mobil (`mobile/`) Rongta **etiket terazisi** ile TCP/LAN üzerinden çalışır. Bu belge kısıtları ve desteklenen uçları netleştirir.

## Ne desteklenir

| İşlem | Yol | Not |
|-------|-----|-----|
| Bağlantı testi | `POST /api/scale/rongta/test` | pg_bridge zorunlu |
| PLU gönderme | `POST /api/scale/rongta/send-plu` | Ürün/etiket sync |
| Satış raporu çekme | `POST /api/scale/rongta/fetch-sales` | Cihaz günlük satış |
| Canlı kg (sürekli) | — | **Yok** — etiket terazisi sürekli ağırlık yaymaz |

Telefon **doğrudan** cihaz TCP’sine bağlanmaz; istekler PC’deki **pg_bridge** (`npm run bridge`, `:3001`) üzerinden gider.

- Emülatör Bridge host: `10.0.2.2`
- Fiziksel cihaz: PC’nin **LAN IP** adresi

## Canlı kg neden yok?

Rongta RLS / etiket modelleri tipik olarak PLU ve satış/rapor protokolü sunar; tartım değerini sürekli stream etmez. Bu nedenle:

1. **LAN seçili** → `NetworkScaleTransport.readLiveWeight()` `weightKg: null` döner.
2. **Tartılı satış** (`ScaleSale`) LAN’da kg yoksa **simüle** yedek kullanabilir.
3. Gerçek canlı kg için **BLE tartı** gerekir (`react-native-ble-plx`, development build; Expo Go’da native yok).

Bu bir eksik entegrasyon değil; donanım/protokol sınırı + bilinçli ürün kararıdır (`TODO_RN_MIGRATION.md` madde 14).

## Transport mimarisi

```
ScaleManagement / ScaleSale
  → scaleStore (IP/port, transport)
  → createScaleTransport()
       ├─ NetworkScaleTransport  → rongtaBridge → pg_bridge
       ├─ SimulateScaleTransport → rastgele canlı kg (geliştirme)
       └─ BluetoothScaleTransport → blePlx (dev client)
```

İlgili kod: `mobile/src/services/scale/scaleTransport.ts`, `rongtaBridge.ts`.

## Expo Go vs development build

| Özellik | Expo Go | Dev client / EAS |
|---------|---------|------------------|
| LAN test / PLU / satış çek | ✓ | ✓ |
| Simüle kg | ✓ | ✓ |
| BLE canlı kg / tarama | ✗ | ✓ (`expo run:android` vb.) |

Smoke: [`TEST_SMOKE_SCALE.md`](./TEST_SMOKE_SCALE.md) · kısa özet: [`README.md`](./README.md) § Terazi BLE.

## Yapma

- LAN Rongta için “canlı kg stream” vaat etme veya `readLiveWeight` ile sürekli kg bekleyen UI yazma.
- Bridge olmadan telefonda ham TCP varsayma.
- Klasik Bluetooth SPP / USB-OTG bekleme — bu RN sürümünde yok (Android TeraziManager native).
