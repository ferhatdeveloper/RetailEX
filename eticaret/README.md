# RetailEX E-Ticaret (`eticaret/`)

Online satış vitrini — **Ella HTML Template** (HaloThemes) tabanlı, çok kiracılı SaaS yapısı.

## Dizin yapısı

```
eticaret/
├── core/                 # Kiracı çözümleme, katalog API, ayarlar
├── themes/
│   ├── registry.ts       # Tema varyantları + önizleme görselleri
│   └── ella/             # Ella HTML (49 sayfa, assets, lib)
├── storefront/           # React vitrin (ürün listesi + Ella CSS)
├── admin/                # Sistem ayarları — resimli tema seçici
└── README.md
```

## Kiracı adresleme

| Yöntem | Örnek |
|--------|--------|
| URL yolu | `https://uygulama/magaza/zetem` |
| Alt alan adı | `https://zetem.magaza.retailex.app` |
| Demo modu | Sistem ayarları → demo kiracı kodu → ürünler o kiracıdan |

## Demo önizleme

**Sistem Yönetimi → Online Satış / Tema**

1. **Demo önizleme modu** açın
2. **Demo kiracı kodu** girin (örn. `zetem`, `ferhat`)
3. Tema kartından Ella varyantı seçin (10 ana sayfa demosu)
4. **Mağazayı önizle** ile `/magaza/{kiracı}` açılır

## Ella sayfaları

Orijinal HTML şablonu `eticaret/themes/ella/` altında. Geliştirmede:

- Statik dosyalar: `http://localhost:6173/eticaret-static/ella/index.html`
- React vitrin: `http://localhost:6173/magaza/demo`

`manifest.json` içinde ana sayfa, kategori, ürün, sepet, blog vb. sayfa listesi bulunur.

## Tema kaynağı

Şablon: [B2B / Ella HTML Template](https://github.com/ferhatdeveloper/B2B/tree/main/Ella%20HTML%20Template)

Yeniden indirmek için:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/ferhatdeveloper/B2B.git /tmp/b2b-ella
cd /tmp/b2b-ella && git sparse-checkout set "Ella HTML Template/Ella-HTML"
cp -r "/tmp/b2b-ella/Ella HTML Template/Ella-HTML" eticaret/themes/ella
```

## Veritabanı

Migration `093_eticaret_settings.sql` → `public.system_settings.eticaret_settings` (JSONB).
