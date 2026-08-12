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
├── admin/                # /mgz yönetim paneli (izole bootstrap + CSS)
└── README.md
```

## Vitrin mimarisi (CSS izolasyonu)

Online mağaza **ERP arayüzünden tamamen bağımsızdır**:

- `/magaza/*` ve `/shop/*` → `eticaret/storefront/bootstrap.tsx` (Tailwind / Ant Design **yüklenmez**)
- Vitrin, tam Ella HTML sayfasını **iframe** içinde gösterir (`buildVitrinUrl.ts`)
- Ürünler `assets/js/retailex-storefront.js` ile Ella DOM'una enjekte edilir
- `index.html` koyu ERP arka planı mağaza yolunda devre dışıdır

## Yönetim paneli (`/mgz`)

E-ticaret admin paneli de ERP'den izoledir:

- `/mgz/*` → `eticaret/admin/bootstrap.tsx` (Tailwind / ERP `index.css` **yüklenmez**)
- Stiller: `eticaret/admin/eticaret-admin.css` (`html.rex-eticaret-admin`)
- Yalnızca Ant Design + panel bileşenleri; `AuthProvider` ile giriş zorunlu


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

| Katman | Alan | Açıklama |
|--------|------|----------|
| Kiracı DB | `system_settings.eticaret_settings` | Migration `093` — yerel demo / ERP ayarları |
| Merkez DB | `tenant_registry.eticaret_settings` | Script `merkez_tenant_registry_add_eticaret_settings.sql` |

Kiracı ürünleri: `{rest_base_url}/rex_{firm}_products` (PostgREST).

Merkez script:

```bash
psql -h <host> -U postgres -d merkez_db -f database/scripts/merkez_tenant_registry_add_eticaret_settings.sql
```
