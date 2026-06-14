# RetailEX Terazi Köprüsü — Windows Servisi + Yönetim UI

Mağaza PC'de RetailEX kapalıyken bile merkezden teraziye PLU gönderimi için Windows servisi.

## Yol 1 — GitHub Release (önerilen)

### Mağaza PC (tek kurulum)

1. **En güncel sürüm** (önerilen):  
   https://github.com/ferhatdeveloper/RetailEX/releases/latest  
   veya doğrudan:  
   https://github.com/ferhatdeveloper/RetailEX/releases/tag/scale-bridge-v0.1.80
2. **`RetailEX-ScaleBridge-Setup.exe`** dosyasını indirin.
3. Dosyayı **yönetici olarak** çalıştırın.
4. Kurulum bitince **masaüstü yönetim penceresi** açılır (tarayıcı gerekmez). İsterseniz: `RetailEX_ScaleBridge_Manager.exe --web`

### Güncelleme (eski sürümün üzerine kurulum)

Eski sürümü elle kaldırmanız gerekmez. Yeni **Setup.exe** dosyasını yönetici olarak çalıştırmanız yeterli:

1. Köprü servisi otomatik durdurulur
2. Dosyalar aynı klasöre (`C:\Program Files\RetailEX\ScaleBridge`) güncellenir
3. Servis yeni sürümle yeniden kurulur ve başlatılır
4. `C:\ProgramData\RetailEX\scale-bridge.json` ayarlarınız korunur

Kurulum otomatik olarak:

- **Windows Güvenlik Duvarı** kurallarını ekler (gelen TCP 3012, giden terazi/node yerel ağ)
- **Visual C++ Runtime** yoksa kurar (`VCRUNTIME140.dll` — `vc_redist.x64.exe` gömülü)
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

Başlat menüsü → **RetailEX Terazi Köprüsü** (masaüstü pencere)

İsteğe bağlı web arayüzü: `RetailEX_ScaleBridge_Manager.exe --web` veya penceredeki **Web arayüz** düğmesi → http://127.0.0.1:3012/ui/

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

## Windows hataları (sık görülen)

| Ekrandaki hata | Çözüm |
|----------------|--------|
| **Windows korunması / SmartScreen** | Dosya Özellikleri → **Engellemeyi kaldır** → Yönetici olarak çalıştır |
| **Servis kurulumu başarısız** | Yönetici PowerShell; antivirüs geçici kapat; `RetailEX_Scale_Bridge_install_last_error.txt` oku |
| **VCRUNTIME140.dll was not found** | VC++ Runtime eksik — asagidaki hizli cozum veya yeni Setup.exe |
| **node.exe not found** | GitHub **Setup.exe** kullanın (Node dahil); eski kurulumu kaldırıp yeniden kurun |
| **ECONNREFUSED 192.168.x.x:20304** | Terazi IP/port yanlış veya terazi ethernet kapalı. Köprü UI → Manuel ekle → **Bağlantıyı kontrol et**; port **4001** deneyin; terazi menüsünden IP doğrulayın |
| **RetailEX_Scale_Bridge.exe bulunamadı** | Kurulum: `C:\Program Files\RetailEX\ScaleBridge` — Setup'ı yeniden çalıştırın |

### Teşhis betiği (çıktıyı paylaşın)

Yönetici PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\RetailEX\ScaleBridge\scale-bridge\diagnose-windows.ps1"
```

Çıktının tamamını kopyalayıp gönderin.

### VCRUNTIME140.dll hatası

Pencere: `RetailEX_ScaleBridge_Manager.exe - System Error`  
Metin: `VCRUNTIME140.dll was not found`

**Güncel Setup.exe** bu DLL yoksa kurulum sırasında otomatik VC++ Runtime kurar. Eski paket kullanıyorsanız:

1. https://github.com/ferhatdeveloper/RetailEX/releases — **scale-bridge-v0.1.76** veya üzeri Setup indirin  
2. veya elle: https://aka.ms/vs/17/release/vc_redist.x64.exe

## Güvenlik duvarı (otomatik)

Kurulum sırasında (yönetici olarak) şu kurallar eklenir:

| Kural | Yön | Açıklama |
|-------|-----|----------|
| `RetailEX Terazi Koprusu — gelen HTTP (TCP 3012)` | Gelen | Köprü API ve yönetim UI (`/ui/`) |
| `RetailEX Terazi Koprusu — node.exe yerel ag (giden)` | Giden | Terazi tarama ve PLU gönderimi (yerel ağ) |

Profil: **Özel** ve **Etki alanı** (genel/kafe ağı açılmaz).

Elle yeniden uygulamak için (yönetici PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Program Files\RetailEX\ScaleBridge\scale-bridge\configure-firewall.ps1" -Action Install -InstallDir "C:\Program Files\RetailEX\ScaleBridge"
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

## Yol 2 — Repo kaynak kurulum (geliştirici)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-scale-bridge-service.ps1
```

Geliştirme modu (servis olmadan):

```bash
npm run scale:bridge
# UI: http://127.0.0.1:3012/ui/
```
