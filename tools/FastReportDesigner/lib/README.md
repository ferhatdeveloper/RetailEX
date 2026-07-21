# FastReport DLL klasörü

Bu klasöre FastReport lisansınızdan gelen DLL dosyalarını kopyalayın.

Zorunlu / beklenen dosyalar:

- `FastReport.dll`
- `FastReport.Bars.dll`
- `FastReport.Editor.dll`

Kullandığınız FastReport paketine göre gerekirse ek DLL'leri de aynı klasöre koyun:

- `FastReport.Data.*.dll`
- `FastReport.Web.dll`
- FastReport paketinin istediği diğer bağımlılık DLL'leri

Notlar:

- Bu DLL dosyaları proprietary/lisanslı olduğu için depoya commit edilmez.
- `tools/FastReportDesigner/.gitignore`, `lib/*.dll` dosyalarını bilerek dışarıda bırakır.
- Proje FastReport paketlerine compile-time referans vermez; DLL'leri çalışma anında `Assembly.LoadFrom` ile yükler.
- DLL'ler bu klasördeyken build sırasında çıktı klasörüne kopyalanır.
