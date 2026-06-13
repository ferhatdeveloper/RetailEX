# RetailEX Terazi Köprüsü — Windows Servisi + Yönetim UI

Mağaza PC'de RetailEX kapalıyken bile merkezden teraziye PLU gönderimi için Windows servisi.

## Tek kurulum (önerilen)

1. GitHub **Releases** → `RetailEX-ScaleBridge-Setup.exe` indirin  
   (veya geliştirici makinede `build-windows-installer.ps1` ile üretin)
2. Kurulumu **yönetici** olarak çalıştırın
3. Kurulum sonunda **yönetim arayüzü** tarayıcıda açılır: `http://127.0.0.1:3012/ui/`

Kurulum içeriği:

| Bileşen | Açıklama |
|---------|----------|
| `RetailEX_Scale_Bridge.exe` | Windows servisi (Node köprüsünü başlatır) |
| `RetailEX_ScaleBridge_Manager.exe` | Kurulum / kaldırma / UI başlatıcı |
| `node.exe` | Taşınabilir Node (ayrı kurulum gerekmez) |
| `scale-bridge/*.mjs` | HTTP API + ağ taraması |
| Config | `C:\ProgramData\RetailEX\scale-bridge.json` |

## Yönetim arayüzü

- Mağaza kodu, token, terazi listesi düzenleme
- **Ağ taraması**: yerel subnet'te Rongta terazileri (TCP probe)
- JSON gelişmiş düzenleme
- Terazi bağlantı testi

Başlat menüsü → **RetailEX Terazi Köprüsü** veya masaüstü kısayolu.

## Geliştirici kurulum (repo)

```powershell
# Yönetici PowerShell
powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\build-windows-installer.ps1
```

veya kaynak kurulum:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-scale-bridge-service.ps1
.\DeskApp\target\release\RetailEX_ScaleBridge_Manager.exe
```

Geliştirme modu (servis olmadan):

```bash
npm run scale:bridge
# UI: http://127.0.0.1:3012/ui/
```

## Merkez bağlantısı

RetailEX bulutta kiracı girişinden sonra köprü URL/token otomatik gelir (`tenant_registry` / `stores`).

Mağaza PC config örneği:

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
