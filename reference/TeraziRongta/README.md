# TeraziRongta — Rongta `rtslabelscale.dll` örnek uygulama

Çalışan C# WinForms örneği. **Asıl entegrasyon `rtslabelscale.dll`** üzerinden; ham TCP değil.

## Önemli dosyalar

| Dosya | Rol |
|-------|-----|
| `WindowsFormsApplication1/labelScale.cs` | DLL sarmalayıcı |
| `WindowsFormsApplication1/uDefine.cs` | Yapılar / sabitler |
| `WindowsFormsApplication1/lib/rtslabelscale.dll` | Rongta resmi kütüphane |
| `WindowsFormsApplication1/SYSTEM.CFG` | DLL yapılandırması (repoda varsayılan) |

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

Node köprüsü (`scripts/scale-bridge/`) Windows'ta bu DLL'i `rongta-dll-bridge` yardımcı exe ile çağırır (0.1.90+).

C# `button9` akışı ile aynı: **Connect → DownLoadPLU (4/paket) → DownLoadHotkey → Disconnect**

## SYSTEM.CFG

**Sizin çalışan dosya:**
`C:\Users\FERHAT\Desktop\TeraziRongta\WindowsFormsApplication1\bin\x86\Debug\SYSTEM.CFG`

Repoda varsayılan şablon var; terazi bağlanmazsa **bu dosyayı kopyalayın**:

```powershell
cd C:\Users\FERHAT\RetailEX-git
powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\copy-rongta-system-cfg.ps1
```

Git'e de yüklemek için:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\scale-bridge\copy-rongta-system-cfg.ps1 -Commit
```

Manuel kopya:

```powershell
copy "C:\Users\FERHAT\Desktop\TeraziRongta\WindowsFormsApplication1\bin\x86\Debug\SYSTEM.CFG" `
     "scripts\scale-bridge\rongta-dll-bridge\SYSTEM.CFG"
```

## Kurulum (Windows)

```powershell
cd C:\Users\FERHAT\RetailEX-git
git pull origin main
# Sürüm: package.json → 0.1.91
npm run scale:bridge
# veya Scale Bridge kurulum paketi: dist\RetailEX-ScaleBridge-Setup.exe (derleme makinesinde)
```
