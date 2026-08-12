# Rongta LAN — mobil terazi notları

RetailEX mobil (`mobile/`) Rongta **etiket terazisi** ile TCP/LAN üzerinden çalışır. Bu belge kısıtları ve desteklenen uçları netleştirir.

## Ne desteklenir

| İşlem | Yol | Not |
|-------|-----|-----|
| Bağlantı testi | Doğrudan TCP **veya** `POST /api/scale/rongta/test` | Dev build: telefon→terazi; Expo Go: pg_bridge |
| PLU gönderme | Doğrudan / `send-plu` | Ürün/etiket sync; `LabelId` slot ayarından |
| PLU temizleme | Doğrudan / `clear-plu` | Açık protokol: `operate=D` (SDK `clearPludata` değil) |
| Satış raporu | Doğrudan / `fetch-sales` | Cihaz günlük satış |
| LAN tarama | Doğrudan TCP probe **veya** `lan-scan` | Portlar: 5001, 9100, 4001, 20304 |
| Hotkey / .scr / SYSTEM.CFG | Bridge dürüst yanıt | Windows DLL / Android `lib_plu` gerekir |
| Canlı kg (sürekli LAN) | — | **Yok** — etiket terazisi sürekli ağırlık yaymaz |

## Transport önceliği (network)

1. `react-native-tcp-socket` yüklüyse → **doğrudan** telefon → terazi IP:port  
2. Aksi halde / başarısızlıkta → **pg_bridge** (`npm run bridge`, `:3001`)

- Emülatör Bridge host: `10.0.2.2`
- Fiziksel cihaz (köprü): PC’nin **LAN IP** adresi

## Canlı kg neden LAN’da yok?

Rongta RLS / etiket modelleri tipik olarak PLU ve satış/rapor protokolü sunar; tartım değerini sürekli stream etmez. Bu nedenle:

1. **LAN seçili** → `NetworkScaleTransport.readLiveWeight()` `weightKg: null` döner (dürüst UI).
2. **Tartılı satış** (`ScaleSale`) LAN’da kg yoksa **simüle** yedek kullanabilir.
3. Gerçek canlı kg: **BLE** (`react-native-ble-plx`) veya **Classic SPP** (`react-native-bluetooth-classic`, opsiyonel).

## USB-OTG / SPP

| Yol | Expo Go | Dev client |
|-----|---------|------------|
| USB seri (FTDI/CH340…) | ✗ | Native modül + Rt2 köprüsü gerekir (`usbSerialScale.ts`) |
| Classic SPP | ✗ | `react-native-bluetooth-classic` (tartım ASCII) |
| BLE canlı kg | ✗ | `react-native-ble-plx` |

## Transport mimarisi

```
ScaleManagement / ScaleSale
  → scaleStore (IP/port, transport, labelSlot, hotkey flags)
  → createScaleTransport()
       ├─ NetworkScaleTransport  → rongtaTcpNative → yedek rongtaBridge
       ├─ BluetoothScaleTransport → blePlx | sppBluetoothScale
       ├─ UsbScaleTransport      → usbSerialScale (native bağlanınca)
       └─ SimulateScaleTransport → rastgele canlı kg
```

İlgili kod: `mobile/src/services/scale/*`, bridge: `src/services/pg_bridge.ts` + `rongtaTcpNode.ts`.

## Expo Go vs development build

| Özellik | Expo Go | Dev client / EAS |
|---------|---------|------------------|
| LAN test / PLU / satış / clear (köprü) | ✓ | ✓ |
| Doğrudan TCP + LAN tarama | ✗ | ✓ (`react-native-tcp-socket`) |
| Simüle kg | ✓ | ✓ |
| BLE / SPP canlı kg | ✗ | ✓ (modül + izinler) |
| USB-OTG PLU | ✗ | Partial (native köprü) |

Smoke: [`TEST_SMOKE_SCALE.md`](./TEST_SMOKE_SCALE.md).
