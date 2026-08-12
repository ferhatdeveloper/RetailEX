# Online / Offline / Hybrid politikası

RetailEX mobil (`mobile/`) ağ davranışı. Web Login `db_mode` (local / online) ile **birlikte** çalışır; birbirinin yerine geçmez.

## İki katman

| Katman | Alan | Anlam |
|--------|------|--------|
| **PG hedefi** | `configStore.config.dbMode` = `local` \| `online` | Canlı sorguda bridge hangi PG’ye bağlanır (şube `local` vs merkez `remote`) — web Offline≈local / Online≈uzak ile aynı |
| **Ağ politikası** | `configStore.config.networkPolicy` = `online` \| `offline` \| `hybrid` | Cihaz NetInfo + cache / kuyruk kullanımı |

## Politikalar

### Online
- Her zaman bridge + aktif PG (`getActiveEndpoint` / `dbMode`).
- Cache yazılır (son başarılı liste snapshot).
- Ağ yoksa veya bridge düşerse hata (liste cache’e düşmez — bilinçli “canlı zorunlu”).

### Offline
- Liste okuma: AsyncStorage snapshot (ürün / cari).
- Yazma: `pending mutations` kuyruğuna; canlı PG yok.
- Net açılsa bile politika Offline kaldıkça canlıya çıkılmaz (kullanıcı Hybrid/Online seçene).

### Hybrid (varsayılan)
- **Net var** → canlı PG (`dbMode` hedefini kullan) + başarılı listeleri cache’e yaz.
- **Net yok / bridge hata** → ürün & cari listesinde son snapshot; yazmalar kuyruğa.
- Net geri gelince kuyruk senkron denemesi (`flushPendingMutations`).

## Ne cache’lenir?

| Anahtar | İçerik | Güncelleme |
|---------|--------|------------|
| `retailex_offline_products` | Son başarılı ürün listesi (firma bazlı snapshot) | Canlı `fetchProducts` (boş arama veya full sonuç) |
| `retailex_offline_customers` | Son başarılı cari listesi | Canlı `fetchCustomers` |
| `retailex_offline_mutations` | Bekleyen mutasyonlar (`customer.*` / `pos.sale` / `invoice.*` / `wms.counting.*`) | Offline/Hybrid yazma |
| `retailex_offline_pending_invoices` | Kuyruğa alınmış fatura taslakları (liste/detay) | Fatura offline create/update |
| `retailex_offline_counting_slips` | Sayım fişleri + satırlar (yerel taslak) | WMS sayım offline fiş/satır |

POS / fatura / WMS sayım kuyruğu: **POS fiş**, **satış/alış/iade fatura**, **hizmet/irsaliye/sipariş/teklif belge**, **WMS sayım fiş/satır/mutabakat/stok uygulama** desteklenir.

## UI göstergesi

- **Header** (`ScreenHeader` / Dashboard): kısa rozet — Online · Offline · Hybrid (+ net kapalıysa “cache”).
- **Config** / **Diğer**: politika seçimi + bekleyen mutasyon sayısı + manuel senkron.

## Kod giriş noktaları

- `src/store/connectivityStore.ts` — NetInfo durumu
- `src/offline/snapshotCache.ts` — liste snapshot
- `src/offline/mutationQueue.ts` + `syncEngine.ts` — kuyruk / flush
- `src/offline/policy.ts` — `shouldUseLiveData()`
