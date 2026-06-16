# TeraziRongta — Rongta `rtslabelscale.dll` örnek uygulama

Çalışan C# WinForms örneği. **Asıl entegrasyon `rtslabelscale.dll`** üzerinden; ham TCP değil.

## Önemli dosyalar

| Dosya | Rol |
|-------|-----|
| `WindowsFormsApplication1/labelScale.cs` | DLL sarmalayıcı |
| `WindowsFormsApplication1/uDefine.cs` | Yapılar / sabitler |
| `WindowsFormsApplication1/lib/rtslabelscale.dll` | Rongta resmi kütüphane |
| `WindowsFormsApplication1/SYSTEM.CFG` | DLL yapılandırması (repoda yok — aşağıya bakın) |

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

## SYSTEM.CFG (önemli)

Repoda yalnızca placeholder var. Çalışan terazi bağlantısı için masaüstü projesindeki dosyayı kopyalayın:

```powershell
copy "C:\Users\FERHAT\Desktop\TeraziRongta\WindowsFormsApplication1\bin\x86\Debug\SYSTEM.CFG" `
     "scripts\scale-bridge\rongta-dll-bridge\SYSTEM.CFG"
git add scripts/scale-bridge/rongta-dll-bridge/SYSTEM.CFG
git commit -m "chore: Rongta SYSTEM.CFG"
git push origin main
```
