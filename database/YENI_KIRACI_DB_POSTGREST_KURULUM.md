# Yeni kiracı veritabanı + PostgREST kurulumu

RetailEX SaaS ortamında **yeni bir PostgreSQL veritabanı** (ör. `aqua_beauty`, `berzin_com`) oluşturup **PostgREST** ile web’den erişilebilir hale getirmek için adım adım rehber.

**Örnek senaryo:** `aqua_beauty` — dump kaynağı: repo kökündeki `aqua.sql` (~4,6 MB, dolu pg_dump).

---

## Ön koşullar

| Gereksinim | Açıklama |
|------------|----------|
| Dump dosyası | Dolu `pg_dump` çıktısı (boş dump işe yaramaz; `aqua_beauty.sql` gibi ~1 KB dosyalar yalnızca başlık içerir) |
| PostgREST SQL | `database/scripts/aqua_beauty_postgrest.sql` (anon + `logic.verify_login`) |
| Sunucu | Docker: `saas_postgres`, `saas_postgrest_<kiracı>`; API: `https://api.retailex.app/<prefix>/` |
| Merkez kayıt | `merkez_db.public.tenant_registry` satırı (`rest_base_url`, `database_name`) |

PostgREST ortam değişkenleri (`docker-compose.dokploy.yml`):

- `PGRST_DB_ANON_ROLE=anon`
- `PGRST_DB_SCHEMAS=public,logic,wms,rest,beauty,pos,logistics`

---

## Dosya eşlemesi

| Dosya | Kullanım |
|-------|----------|
| `aqua.sql` | Kiracı şema + veri (pg_dump) — **import için bunu kullanın** |
| `aqua_beauty.sql` | Boş dump örneği — **kullanmayın** |
| `database/scripts/aqua_beauty_postgrest.sql` | Dump **sonrası** anon yetkileri + `verify_login` RPC |
| `database/migrations/000_master_schema.sql` | Dump yoksa sıfırdan şema (alternatif) |

Yeni kiracı için dump yoksa: mevcut dolu DB’den `pg_dump` alın veya `000_master_schema.sql` + numaralı migration’ları uygulayın.

---

## 1) Veritabanını oluştur

```bash
# Docker (VPS)
docker exec -i saas_postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE yeni_kiraci_db;"
```

```powershell
# Windows psql — uzak sunucu
$env:PGPASSWORD = '<PAROLA>'
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h <HOST> -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -c "CREATE DATABASE yeni_kiraci_db;"
```

`<HOST>`: örn. sunucu IP veya `postgres` (Docker ağı içinden).

---

## 2) Dump import

```bash
# Docker — dump dosyası sunucuda
docker exec -i saas_postgres psql -U postgres -d yeni_kiraci_db -v ON_ERROR_STOP=1 \
  < /path/to/kiraci_dump.sql
```

```powershell
# Windows — repo kökünden
$env:PGPASSWORD = '<PAROLA>'
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h <HOST> -U postgres -d yeni_kiraci_db `
  -v ON_ERROR_STOP=1 -f "d:\RetailEX\aqua.sql"
```

**Not:** Dump içinde `\restrict` / `\unrestrict` satırları varsa ve eski `psql` hata verirse, bu satırları kaldırın veya PostgreSQL 15+ `psql` kullanın.

Import süresi dump boyutuna bağlı (ör. 4–5 MB birkaç dakika).

---

## 3) PostgREST: anon + verify_login

Dump **bittikten sonra**, hedef DB’ye bağlıyken:

```bash
docker exec -i saas_postgres psql -U postgres -d yeni_kiraci_db -v ON_ERROR_STOP=1 \
  < database/scripts/aqua_beauty_postgrest.sql
```

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h <HOST> -U postgres -d yeni_kiraci_db `
  -v ON_ERROR_STOP=1 -f "d:\RetailEX\database\scripts\aqua_beauty_postgrest.sql"
```

Script şunları yapar:

- `anon` rolü (yoksa oluşturur)
- `public`, `logic`, `wms`, `rest`, `beauty`, `pos` şemalarında tablo/sequence/fonksiyon yetkileri
- `logic.verify_login(username, password, firm_nr)` — web giriş RPC (frontend ile uyumlu)
- `NOTIFY pgrst, 'reload schema'`

**Sıra hatası:** Dump olmadan bu scripti çalıştırırsanız `relation "public.users" does not exist` alırsınız. Önce **§2**, sonra **§3**.

`aqua_beauty_postgrest.sql` içindeki `GRANT CONNECT` bağlı olduğunuz veritabanı adını kullanır (`current_database()`).

---

## 4) PostgREST konteynerini yenile

```bash
# Dokploy → Terminal veya SSH
docker restart saas_postgrest_aqua_beauty
```

Compose servis adı `postgrest_<kiracı>`; konteyner adı genelde `saas_postgrest_<kiracı>`.

Yeni kiracı için önce `docker-compose.dokploy.yml` / PostgREST per-DB compose’da servis tanımlı olmalı (`PGRST_DB_URI` → `.../yeni_kiraci_db`).

---

## 5) Merkez kiracı kaydı (`merkez_db`)

Web’in doğru API yoluna gitmesi için:

```sql
-- \c merkez_db
UPDATE tenant_registry
SET connection_provider = 'rest_api',
    rest_base_url       = 'https://api.retailex.app/aqua',   -- kiracı prefix
    database_name       = 'yeni_kiraci_db',
    updated_at          = now()
WHERE code = 'aqua_beauty';   -- tenant_registry.code

SELECT code, module, connection_provider, rest_base_url, database_name
FROM tenant_registry
WHERE code = 'aqua_beauty';
```

Beklenen: `module` (ör. `clinic`), `rest_base_url` dolu, `database_name` yeni DB adı.

---

## 6) Doğrulama

### PostgreSQL

```sql
\c yeni_kiraci_db
SELECT COUNT(*) FROM public.firms;
SELECT username FROM public.users LIMIT 5;
\df logic.verify_login
```

### API (PostgREST)

```bash
curl -sS "https://api.retailex.app/aqua/firms?select=firm_nr&limit=1"

curl -sS -X POST "https://api.retailex.app/aqua/rpc/verify_login" \
  -H "Content-Type: application/json" \
  -H "Accept-Profile: logic" \
  -H "Content-Profile: logic" \
  -d '{"username":"admin","password":"<SIFRE>","firm_nr":""}'
```

### Tarayıcı

Giriş öncesi (isteğe bağlı):

```js
localStorage.removeItem('retailex_web_config');
localStorage.removeItem('exretail_pg_config');
localStorage.removeItem('exretail_selected_tenant');
```

`Ctrl+F5` → doğru kiracıyı seçin (ör. Aqua Beauty, berzin değil).

---

## Hata özeti

| Belirti | Olası neden | Çözüm |
|---------|-------------|--------|
| `42P01` — `public.firms` does not exist | Boş DB veya dump import edilmedi | §2 dump import |
| `schema "wms" does not exist` | Grant, dump’tan önce çalıştırıldı | Önce dump; postgrest script şemaları `IF NOT EXISTS` ile de oluşturur |
| `PGRST202` — `verify_login` bulunamadı | RPC yok veya cache eski | §3 + `docker restart saas_postgrest_*` |
| `42501` / 401 | `anon` yetkisi yok | §3 tekrar |
| `{"ok":false,"error":"not_found"}` (düz JSON) | Caddy yolu; istek PostgREST’e gitmiyor | `database/API_PATH_404_CADDY_NOT_FOUND.md` |
| `pg_query` timeout | SQL fallback; köprü DB’ye ulaşamıyor | PostgREST’i düzeltin; `rest_api` modunda asıl yol API |

İlgili runbook’lar:

- `database/POST_BACKUP_RESTORE_AQUA_BEAUTY_RUNBOOK.md` — yedekten Aqua geri yükleme
- `database/BERQENAS_CLOUD_DEPLOY.md` — PostgREST port / compose
- `database/migrations/007_postgrest_anon_role.sql` — tam anon migration (dump + postgrest script alternatifi)

---

## Yeni kiracı kontrol listesi

- [ ] `CREATE DATABASE <ad>`
- [ ] Dolu `pg_dump` import (`aqua.sql` veya kiracıya özel dump)
- [ ] `database/scripts/aqua_beauty_postgrest.sql` (DB adı farklı olsa da script bağlı DB’de çalışır)
- [ ] `docker restart saas_postgrest_<kiracı>`
- [ ] `merkez_db.tenant_registry` — `rest_base_url`, `database_name`
- [ ] Caddy/API prefix (`/aqua/` vb.) PostgREST upstream ile eşleşiyor
- [ ] `curl` ile `/firms` ve `/rpc/verify_login` testi
- [ ] Parola ve `5432` erişimi güvenli (parolayı repoya yazmayın)

---

## Güvenlik

- Postgres parolasını repoya, sohbete veya commit’e **koymayın**; Dokploy Secrets / `.env.signing` kullanın.
- Uzak `5432` mümkünse yalnızca VPN veya allowlist IP.
- Test için `admin` parolası değiştirildiyse canlıda güçlü parola kullanın.

---

## Örnek: `aqua_beauty` (2026-05)

1. `CREATE DATABASE aqua_beauty` — uzak sunucu PostgreSQL 17.9  
2. `aqua.sql` → `aqua_beauty` import (başarılı)  
3. `aqua_beauty_postgrest.sql` uygulandı  
4. Kontrol: `firms` = 1, `users.username` = `admin`  
5. Kullanıcı: PostgREST restart + web kiracı seçimi

Dump kaynağı dosya: repo kökü `aqua.sql`. Boş `aqua_beauty.sql` kullanılmadı.
