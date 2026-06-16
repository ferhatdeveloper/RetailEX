# TeraziRongta — Rongta `rtslabelscale.dll` örnek uygulama

Çalışan C# WinForms örneği. **Asıl entegrasyon `rtslabelscale.dll`** üzerinden; ham TCP değil.

## Önemli dosyalar

| Dosya | Rol |
|-------|-----|
| `WindowsFormsApplication1/labelScale.cs` | DLL sarmalayıcı |
| `WindowsFormsApplication1/uDefine.cs` | Yapılar / sabitler |
| `WindowsFormsApplication1/rtslabelscale.dll` | Rongta resmi kütüphane |
| `WindowsFormsApplication1/SYSTEM.CFG` | DLL yapılandırması |

## Repoya ekleme (PowerShell — `C:\RetailEX` git değilse)

`C:\RetailEX` klasöründe `.git` yoksa `git push` çalışmaz. Bunun yerine:

```powershell
cd C:\Users\FERHAT\RetailEX-git
# veya tek komut:
powershell -ExecutionPolicy Bypass -File C:\Users\FERHAT\RetailEX-git\scripts\scale-bridge\import-terazi-rongta.ps1
```

İlk seferde önce repo klonlayın:

```powershell
cd C:\Users\FERHAT
git clone https://github.com/ferhatdeveloper/RetailEX.git RetailEX-git
cd RetailEX-git
git pull origin main
powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\import-terazi-rongta.ps1
```

## RetailEX köprüsü

Node köprüsü (`scripts/scale-bridge/`) Windows'ta bu DLL'i `rongta-dll-bridge` yardımcı exe ile çağırır (0.1.89+).
