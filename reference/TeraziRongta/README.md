# TeraziRongta — C# referans uygulaması

Çalışan Rongta terazi entegrasyonunuz (`C:\Users\FERHAT\Desktop\TeraziRongta`) buraya kopyalanırsa RetailEX köprüsü ile satır satır karşılaştırılır.

## Kopyalama (Windows)

```powershell
xcopy "C:\Users\FERHAT\Desktop\TeraziRongta" "C:\path\to\RetailEX\reference\TeraziRongta" /E /I /Y
cd C:\path\to\RetailEX
git add reference/TeraziRongta
git commit -m "TeraziRongta C# referans uygulaması eklendi"
git push origin main
```

## Öncelikli dosyalar

| Dosya | Neden |
|-------|--------|
| Keşif / tarama `.cs` | Hangi port, UDP/TCP, timeout |
| Bağlantı / test `.cs` | Handshake sırası |
| PLU gönderim `.cs` | Paket formatı |
| `.csproj` | DLL / NuGet referansları |

## RetailEX tarafı

- HTTP köprü: `scripts/scale-bridge/server.mjs`
- Rongta SDK: `scripts/scale-bridge/sdk/rongta/`
- İki aşamalı tarama: `scripts/scale-bridge/scan.mjs` (TCP + protokol)

C# kodu eklendikten sonra farklar bu README altına not edilir ve Node/Rust implementasyonu güncellenir.
