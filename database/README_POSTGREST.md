# PostgREST — RetailEX REST API

PostgREST, PostgreSQL veritabanını doğrudan REST API olarak sunar. RetailEX'te mevcut **pg_bridge** (Hono + ham SQL) ile birlikte isteğe bağlı olarak kullanılabilir.

## Özellikler

- **Tablo bazlı REST**: `GET /firms`, `GET /rex_001_products?select=id,name&firm_nr=eq.001`
- **Şemalar**: `public`, `logic`, `wms`, `rest`, `beauty`, `pos` (header ile: `Accept-Profile`, `Content-Profile`)
- **Filtreleme**: `?column=eq.value`, `?column=gte.100`, `?or=(a.eq.1,b.eq.2)`
- **Sıralama / sayfalama**: `?order=name.asc`, `?limit=20&offset=0`

## Kurulum

### 1. PostgREST binary

- **Windows**: [Releases](https://github.com/PostgREST/postgrest/releases) — `postgrest-*-windows-x64.zip` indir, `postgrest.exe`'yi PATH'e ekleyin.
- **Docker**: `docker run -p 3002:3000 --env-file .env.postgrest postgrest/postgrest`
- **Chocolatey (Windows)**: `choco install postgrest`

### 2. Veritabanı rolü

PostgREST config'de `db-anon-role = "anon"` kullanıyorsanız, önce anon rolünü oluşturun:

```bash
psql -U postgres -d retailex_local -f database/migrations/007_postgrest_anon_role.sql
```

Geliştirme ortamında config içinde `db-anon-role = "postgres"` yaparak bu adımı atlayabilirsiniz (güvenli değildir, sadece local).

### 3. Config

- Proje kökünde `config/postgrest.conf` kullanılır.
- Bağlantı bilgisini ortam değişkeni ile override: `PGRST_DB_URI=postgres://user:pass@host:5432/retailex_local`
- Örnek env: `config/postgrest.env.example` → `.env.postgrest` olarak kopyalayıp düzenleyin.

### 4. Çalıştırma

```bash
# Config dosyası ile (db-uri conf içinde)
postgrest config/postgrest.conf

# veya ortam değişkenleri ile
export PGRST_DB_URI="postgres://postgres:Yq7xwQpt6c@127.0.0.1:5432/retailex_local"
postgrest config/postgrest.conf
```

PostgREST varsayılan olarak **3002** portunda çalışır (pg_bridge 3001 kullandığı için).

### 5. npm script (binary yüklüyse)

```bash
npm run postgrest
```

## Frontend kullanımı

`src/services/api/postgrestClient.ts` ve `src/config/postgrest.config.ts` kullanılır:

```ts
import { postgrest } from '@/services/api/postgrestClient';

// Liste
const firms = await postgrest.get('/firms', { select: 'id,firm_nr,name', order: 'name.asc', limit: 10 });

// Firma tablosu (multi-tenant tablo adı)
const tableName = `rex_${firmNr}_products`;
const products = await postgrest.get(`/${tableName}`, { select: '*', firm_nr: `eq.${firmNr}` });

// Tek kayıt (id ile)
const one = await postgrest.get(`/firms?id=eq.${uuid}`);

// Ekleme
const created = await postgrest.post('/firms', { firm_nr: '002', name: 'Şube 2' });

// Güncelleme
await postgrest.patch(`/firms?id=eq.${uuid}`, { name: 'Yeni Ad' });

// Silme
await postgrest.delete(`/firms?id=eq.${uuid}`);
```

## Port özeti

| Servis     | Port | Açıklama              |
|-----------|------|------------------------|
| Vite      | 5173 | Frontend               |
| pg_bridge | 3001 | Hono SQL proxy         |
| PostgREST | 3002 | PostgreSQL REST API    |

## Referans

- [PostgREST API](https://postgrest.org/en/stable/references/api.html)
- [Configuration](https://docs.postgrest.org/en/stable/references/configuration.html)
