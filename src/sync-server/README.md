# RetailEX Sync Server

Merkez senkronizasyon sunucusu - Kasalara veri gönderme ve alma

## Özellikler

- ✅ WebSocket tabanlı gerçek zamanlı iletişim
- ✅ Çoklu kasa (store) desteği
- ✅ Broadcast ile tüm kasalara veya belirli kasalara veri gönderme
- ✅ REST API ile broadcast oluşturma
- ✅ Bağlantı durumu takibi
- ✅ Acknowledge mekanizması

## Kurulum

```bash
cd src/sync-server
npm install
```

## Kullanım

### Sunucuyu Başlat

```bash
npm start
# veya geliştirme modu için:
npm run dev
```

Varsayılan port: `8080`

### Environment Variables

```bash
PORT=8080  # Sunucu portu (varsayılan: 8080)
```

## API Endpoints

### Health Check

```http
GET /health
```

Response:
```json
{
  "status": "OK",
  "online_stores": 3,
  "online_devices": 5,
  "pending_broadcasts": 2
}
```

### Tüm Kasaları Listele

```http
GET /api/stores
```

Response:
```json
{
  "success": true,
  "stores": [
    {
      "store_id": "STORE-001",
      "connections": 2,
      "devices": [
        {
          "device_id": "DEV-123",
          "app_version": "2.0.0",
          "registered_at": "2025-01-20T10:00:00.000Z"
        }
      ]
    }
  ],
  "total_stores": 1
}
```

### Belirli Kasa Durumu

```http
GET /api/stores/:storeId
```

Example:
```http
GET /api/stores/STORE-001
```

Response:
```json
{
  "success": true,
  "store": {
    "store_id": "STORE-001",
    "online": true,
    "connections": 2,
    "devices": [...]
  }
}
```

### Broadcast Oluştur (Kasalara Veri Gönder)

```http
POST /api/broadcast
Content-Type: application/json
```

Request Body:
```json
{
  "message_type": "product",
  "action": "update",
  "payload": {
    "id": "PROD-001",
    "name": "Yeni Ürün Adı",
    "price": 150.00
  },
  "target_stores": ["STORE-001", "STORE-002"],  // Optional: null = tüm kasalar
  "priority": "high"  // "high", "normal", "low"
}
```

Response:
```json
{
  "success": true,
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "sent_to": 2,
  "total_stores": 5,
  "message": "Broadcast created and sent"
}
```

**Tüm Kasalara Göndermek İçin:**
```json
{
  "message_type": "price",
  "action": "update",
  "payload": {
    "product_id": "PROD-001",
    "price": 199.99
  }
  // target_stores belirtilmezse tüm kasalara gönderilir
}
```

### Broadcast Durumu

```http
GET /api/broadcast/:messageId
```

Response:
```json
{
  "success": true,
  "broadcast": {
    "message_id": "550e8400-e29b-41d4-a716-446655440000",
    "message_type": "product",
    "action": "update",
    "priority": "high",
    "created_at": "2025-01-20T10:00:00.000Z",
    "sent_at": "2025-01-20T10:00:01.000Z",
    "sent_to": ["STORE-001", "STORE-002"],
    "acknowledged": true,
    "acknowledged_at": "2025-01-20T10:00:02.000Z"
  }
}
```

## WebSocket Bağlantısı

Kasalar (Electron uygulamaları) şu şekilde bağlanır:

```
ws://localhost:8080/ws/:storeId
```

Örnek:
```
ws://localhost:8080/ws/STORE-001
```

### Mesaj Tipleri

#### Client → Server

**Register:**
```json
{
  "type": "Register",
  "store_id": "STORE-001",
  "device_id": "DEV-123",
  "app_version": "2.0.0"
}
```

**Ping:**
```json
{
  "type": "Ping",
  "timestamp": "2025-01-20T10:00:00.000Z"
}
```

**Acknowledge:**
```json
{
  "type": "Acknowledge",
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "error": null
}
```

**Push (Veri Gönderme):**
```json
{
  "type": "Push",
  "table_name": "sales",
  "record_id": "INV-001",
  "action": "insert",
  "data": {
    "invoice_no": "INV-001",
    "total": 1000.00
  },
  "timestamp": "2025-01-20T10:00:00.000Z"
}
```

**Pull (Veri Çekme İsteği):**
```json
{
  "type": "Pull",
  "pull_type": "all",
  "since": "2025-01-19T10:00:00.000Z",
  "timestamp": "2025-01-20T10:00:00.000Z"
}
```

#### Server → Client

**Broadcast:**
```json
{
  "type": "Broadcast",
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "message_type": "product",
  "action": "update",
  "payload": {
    "id": "PROD-001",
    "name": "Yeni Ürün Adı",
    "price": 150.00
  }
}
```

**Pong:**
```json
{
  "type": "Pong",
  "timestamp": "2025-01-20T10:00:00.000Z"
}
```

**Status:**
```json
{
  "type": "Status",
  "online_stores": 3,
  "pending_messages": 2
}
```

## Örnek Kullanım Senaryoları

### 1. Fiyat Güncellemesi Tüm Kasalara

```bash
curl -X POST http://localhost:8080/api/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message_type": "price",
    "action": "update",
    "payload": {
      "product_id": "PROD-001",
      "price": 199.99,
      "updated_at": "2025-01-20T10:00:00.000Z"
    }
  }'
```

### 2. Belirli Kasalara Ürün Güncellemesi

```bash
curl -X POST http://localhost:8080/api/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message_type": "product",
    "action": "update",
    "payload": {
      "id": "PROD-002",
      "name": "Güncellenmiş Ürün",
      "stock": 50
    },
    "target_stores": ["STORE-001", "STORE-003"],
    "priority": "high"
  }'
```

### 3. Kampanya Duyurusu

```bash
curl -X POST http://localhost:8080/api/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message_type": "campaign",
    "action": "insert",
    "payload": {
      "id": "CAMP-001",
      "name": "Yılbaşı İndirimi",
      "discount": 20,
      "start_date": "2025-01-01",
      "end_date": "2025-01-31"
    },
    "priority": "high"
  }'
```

### 4. Müşteri Güncellemesi

```bash
curl -X POST http://localhost:8080/api/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message_type": "customer",
    "action": "update",
    "payload": {
      "id": "CUST-001",
      "name": "Güncellenmiş Müşteri",
      "phone": "05551234567"
    },
    "target_stores": ["STORE-001"]
  }'
```

## Electron Uygulamasından Kullanım

Electron uygulaması zaten `SyncClient` servisi ile bu sunucuya bağlanır. Sadece sunucu URL'ini yapılandırmanız yeterlidir:

```javascript
await electronAPI.advancedSync.configure({
  storeId: 'STORE-001',
  syncServerUrl: 'ws://your-server:8080',
  autoSync: true,
  syncInterval: 60000
});
```

## Güvenlik Notları

1. Production ortamında CORS ayarlarını yapılandırın
2. Authentication/Authorization ekleyin
3. HTTPS/WSS kullanın
4. Rate limiting ekleyin
5. Input validation yapın

## Yapılacaklar

- [ ] Authentication/Authorization
- [ ] Rate limiting
- [ ] Persistent storage (Redis/PostgreSQL)
- [ ] Message encryption
- [ ] Load balancing support
- [ ] Metrics/Monitoring




