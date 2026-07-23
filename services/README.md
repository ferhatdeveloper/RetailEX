# RetailEX Arka Plan Servisleri

Bu klasörde Windows yürütülebilir dosyaları bulunur.

| Dosya | Sürüm | Görev |
|-------|-------|--------|
| `windows-x64/RetailEX-Sync-Service.exe` | 2.0.0 | Çok mağazalı **WebSocket** senkron motoru |
| `windows-x64/RetailEX-Logo-Connector.exe` | 1.0.0 | **(Legacy — varsayılan derlemede yok)** Eski Logo MSSQL poll servisi |

## Önemli — Logo entegrasyonu

| Senaryo | Gerekli bileşen |
|---------|-----------------|
| **Web / SaaS Logo REST** | `pg_bridge` + uygulama içi `logoRestSync` — **connector gerekmez** |
| **Masaüstü Logo REST** | Tauri + `logoRestSync` — **connector gerekmez** |
| **Masaüstü Logo MSSQL (LOBJECT)** | Tauri `sync_logo_data` — **connector gerekmez** |
| **Eski arka plan poll** | `RetailEX-Logo-Connector.exe` — yalnızca legacy kurulumlar |

Güncel **Entegrasyonlar** ekranı connector servisini başlatmaz veya yapılandırmaz. Yeni kurulumlarda Logo Connector kurmayın; REST veya Tauri içi MSSQL senkronunu kullanın.

## Derleme

**Windows (Visual Studio Build Tools / MSVC):**

```powershell
npm run build:services:win
```

Logo Connector yalnızca eski kurulumlar için: `BUILD_LOGO_CONNECTOR=1 npm run build:services:win`

**Linux cross-compile (MinGW):**

```bash
sudo apt-get install -y gcc-mingw-w64-x86-64
npm run build:services:win
```

Çıktı: `services/windows-x64/*.exe` + `manifest.json`

## RetailEX-Logo-Connector (legacy — yeni kurulumlarda kullanmayın)

> **Kaldırıldı / yerine geçen:** Entegrasyonlar → REST Servis veya LOBJECT (Tauri `sync_logo_data`). Web’de `pg_bridge` Logo proxy.

Eski Windows servisi: Logo MSSQL’e 30 sn poll, kısmi kuyruk tabanlı aktarım. REST modunda ve güncel masaüstü MSSQL senkronunda **gerekli değildir**.

**Ortam değişkenleri:**

| Değişken | Açıklama |
|----------|----------|
| `DATABASE_URL` | PostgreSQL bağlantı dizesi |
| `LOGO_DATABASE_URL` | Logo MSSQL ADO bağlantı dizesi |

**Kurulum (yönetici PowerShell):**

```powershell
$env:DATABASE_URL = "postgres://postgres:ŞİFRE@127.0.0.1:5432/retailex_local"
$env:LOGO_DATABASE_URL = "Server=LOGO-SERVER;Database=TIGERDB;User Id=sa;Password=..."
.\RetailEX-Logo-Connector.exe --install
```

**Kaldırma:** `RetailEX-Logo-Connector.exe --uninstall`  
**Konsol testi:** `RetailEX-Logo-Connector.exe --console`

Windows servis adı: `RetailEXLogoConnector`

## RetailEX-Sync-Service

Kiracı başına WebSocket + REST senkron (Caddy: `https://api.retailex.app/{kiracı}/ws`, `.../{kiracı}/sync`).

**Ortam değişkenleri:**

| Değişken | Varsayılan |
|----------|------------|
| `DATABASE_URL` | Kiracı PostgreSQL (075 migration uygulanmış olmalı) |
| `BIND_ADDRESS` | `0.0.0.0:8080` |

**Windows (mağaza PC — yerel):**

- **`RetailEX_Service.exe`** (Windows servisi): arka planda merkeze `wss://api.retailex.app/{kiracı}/ws` bağlanır; tarayıcı kapalıyken hibrit senkron devam eder.
- Tarayıcı UI, kiracı bağlandıktan sonra aynı merkez WS adresine gider; yedek yerel dinleyici: `ws://127.0.0.1:9999/ws`.

**Çalıştırma (merkez / kiracı sunucu):**

```powershell
$env:DATABASE_URL = "postgres://..."
.\RetailEX-Sync-Service.exe
```

Sağlık kontrolü: `GET http://localhost:8080/health`

## Kaynak kod

| Bileşen | Yol |
|---------|-----|
| Logo Connector | `services/logo-connector/` (ortak: `DeskApp/src/logo_bridge.rs`) |
| Sync Service | `src/sync-service/` |

## Not

Web / SaaS (`retailex.app`) Logo **REST** içe aktarma `pg_bridge` üzerinden çalışır; bu exe'ler zorunlu değildir. Logo SQL veya mağaza senkronu için kullanılır.
