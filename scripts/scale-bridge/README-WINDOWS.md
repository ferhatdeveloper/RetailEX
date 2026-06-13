# RetailEX Terazi Köprüsü — Windows Servisi + Yönetim UI

Mağaza PC'de RetailEX kapalıyken bile merkezden teraziye PLU gönderimi için Windows servisi.

## Yol 1 — GitHub Release (önerilen)

### Mağaza PC (tek kurulum)

1. GitHub Releases sayfasını açın:  
   https://github.com/ferhatdeveloper/RetailEX/releases  
2. En güncel **`RetailEX Terazi Köprüsü`** yayınından  
   **`RetailEX-ScaleBridge-Setup.exe`** dosyasını indirin.
3. Dosyayı **yönetici olarak** çalıştırın.
4. Kurulum bitince tarayıcıda yönetim arayüzü açılır:  
   **http://127.0.0.1:3012/ui/**

Kurulum otomatik olarak:

- Windows servisini kurar (`RetailEX_Scale_Bridge`)
- Taşınabilir Node + köprü scriptlerini kopyalar
- Başlat menüsü kısayolu oluşturur
- Örnek config üretir: `C:\ProgramData\RetailEX\scale-bridge.json`

### Geliştirici — yeni Release üretme

**Otomatik (GitHub Actions):**

```bash
# package.json sürümünü güncelledikten sonra:
git tag scale-bridge-v0.1.74
git push origin scale-bridge-v0.1.74
```

Workflow: `.github/workflows/scale-bridge-release.yml`  
Çıktı: `RetailEX-ScaleBridge-Setup.exe` → GitHub Release'e yüklenir.

İsterseniz GitHub → **Actions** → **Scale Bridge Windows Release** → **Run workflow** ile etiket olmadan da derleyebilirsiniz.

**Yerel derleme (isteğe bağlı):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\build-windows-installer.ps1
# Çıktı: dist\RetailEX-ScaleBridge-Setup.exe
```

---

## Yönetim arayüzü

| Özellik | Açıklama |
|---------|----------|
| Genel ayarlar | Mağaza kodu, token, port |
| Terazi listesi | Ekle / sil / test |
| Ağ taraması | Subnet'te Rongta terazi bulma |
| JSON | Gelişmiş config düzenleme |

Başlat menüsü → **RetailEX Terazi Köprüsü**

## Kurulum içeriği

| Bileşen | Açıklama |
|---------|----------|
| `RetailEX_Scale_Bridge.exe` | Windows servisi |
| `RetailEX_ScaleBridge_Manager.exe` | Kur / kaldır / UI aç |
| `node.exe` | Taşınabilir Node |
| `scale-bridge/*.mjs` | HTTP API + tarama |

## Merkez bağlantısı

Buluttan kiracı girişinde köprü URL/token otomatik gelir (`tenant_registry` / `stores`).

Mağaza PC `scale-bridge.json` örneği:

```json
{
  "listenHost": "0.0.0.0",
  "listenPort": 3012,
  "authToken": "rex-bridge-kasap",
  "storeCode": "kasap",
  "storeName": "Kasaphane Merkez",
  "scales": [
    {
      "id": "kasap-terazi-1",
      "name": "Etiket Terazisi",
      "brand": "rongta",
      "model": "RLS1100",
      "ipAddress": "192.168.1.87",
      "port": 20304,
      "enabled": true
    }
  ]
}
```

`authToken` merkez DB'deki `scale_bridge_token` ile aynı olmalı.

## Servis komutları

```powershell
net start RetailEX_Scale_Bridge
net stop RetailEX_Scale_Bridge
sc query RetailEX_Scale_Bridge
```

Log: `C:\ProgramData\RetailEX\scale_bridge_service.log`

## Kaldırma

Başlat → **Terazi Köprüsü Kaldır** veya:

```powershell
& "C:\Program Files\RetailEX\ScaleBridge\RetailEX_ScaleBridge_Manager.exe" --uninstall
```

## Yol 2 — Repo kaynak kurulum (geliştirici)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-scale-bridge-service.ps1
```

Geliştirme modu (servis olmadan):

```bash
npm run scale:bridge
# UI: http://127.0.0.1:3012/ui/
```
