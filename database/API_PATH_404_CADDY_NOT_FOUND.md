# `api.*` altında `404` ve `{"ok":false,"error":"not_found"}` — Caddy / PostgREST ayrımı

Tarayıcı veya `curl` ile şuna benzer bir yanıt alıyorsanız:

```http
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8

{"ok":false,"error":"not_found"}
```

Bu gövde **PostgREST’ten gelmez**; `database/scripts/berqenas-caddy-merge-merkez-api.sh` betiğinin `api.<domain>` bloğunun sonundaki **varsayılan `handle { respond ... 404 }`** cevabıdır. İstek, ilgili kiracı için tanımlı **`reverse_proxy` satırına hiç düşmemiştir** (Caddyfile güncel değil, yanlış domain, upstream konteyneri yok / yanlış isim, veya path eşleşmiyor).

**Özet:** Önce **Caddy yönlendirmesini** düzeltin; ardından gerekirse DB/PostgREST tarafına bakın.

---

## PostgREST kaynaklı 404 ile karıştırmayın

| Belirti | Muhtemel kaynak |
|--------|------------------|
| Gövde tam olarak `{"ok":false,"error":"not_found"}` (kısa JSON) | **Caddy** — kiracı yolu veya merge/reload eksik |
| Gövde `PGRST…`, `code`, `details` (PostgREST hata JSON’u) veya boş / farklı | **PostgREST / şema** — tablo/RPC yok, `anon` yetkisi, şema önbelleği |

Kiracı DB’de `verify_login` veya `firms` eksikliği için (Aqua örneği, `NOTIFY pgrst`, SQL):  
**`database/POST_BACKUP_RESTORE_AQUA_BEAUTY_RUNBOOK.md`** — özellikle §4 (anon), §5 (`verify_login` / PGRST202), §6 (CORS + merge betiği).

---

## Caddy `not_found` için kontrol listesi (VPS)

1. **Konteyner:** Kiracı PostgREST ayakta mı? Örnek (`berzin_com`):
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "postgrest|saas_postgres|retailex_caddy"
   ```
   `saas_postgrest_berzin_com` (veya compose’taki gerçek isim) **Up** olmalı.

2. **Caddyfile’da yol:** Sunucuda kullanılan `Caddyfile` içinde kiracı kodu geçiyor mu?
   ```bash
   grep -E 'berzin_com|reverse_proxy' "${INSTALL_DIR:-/opt/berqenas-cloud}/caddy/Caddyfile" | head -80
   ```
   `api.retailex.app {` bloğu içinde `handle … berzin_com` ve `reverse_proxy saas_postgrest_berzin_com:3000` (veya eşdeğeri) görünmeli.

3. **Merge betiğini tekrar çalıştırın** (repo kökünden veya klon yolundan; ortam değişkenleri örnek):
   ```bash
   cd /opt/berqenas-cloud/projects/retailex
   git pull   # veya fetch + reset — güncel script’te kiracı satırları olsun

   export INSTALL_DIR=/opt/berqenas-cloud
   export MERKEZ_API_PUBLIC_DOMAIN=api.retailex.app
   export MERKEZ_API_ALLOWED_ORIGINS="https://retailex.app,https://ilsa.berqenas.cloud"
   # Gerekirse upstream’i compose ağındaki gerçek konteyner adına eşitleyin:
   # export POSTGREST_UPSTREAM_BERZIN_COM=saas_postgrest_berzin_com:3000

   bash database/scripts/berqenas-caddy-merge-merkez-api.sh
   ```
   Betik `retailex_caddy` içinde `caddy validate` + `reload` dener.

4. **Doğrudan PostgREST (iç ağ):** Caddy’yi bypass ederek upstream sağlığı:
   ```bash
   docker exec retailex_caddy wget -qO- "http://saas_postgrest_berzin_com:3000/" 2>/dev/null | head -c 200
   ```
   veya VPS’ten host portu açıksa: `curl -sS http://127.0.0.1:3010/` (compose’taki host portuna göre değişir).

5. **`merkez_db.tenant_registry`:** Web istemcisi `rest_base_url` olarak `https://api.retailex.app/berzin_com` (sonunda `/` olmadan da olur) kullanmalı; kod Caddy’deki path ile birebir uyumlu olmalı. Doldurma örneği: `database/scripts/tenant_registry_fill_rest_base_urls.sql` ve retail seed betikleri.

---

## İlgili dosyalar

| Dosya | Amaç |
|--------|------|
| `database/scripts/berqenas-caddy-merge-merkez-api.sh` | `api.*` bloğunu tekilleştirir; kiracı başına `reverse_proxy` |
| `database/docker/docker-compose.postgrest-per-db.yml` | Retail kiracıları için ayrı PostgREST servisleri (ör. 3010–3012) |
| `database/POST_BACKUP_RESTORE_AQUA_BEAUTY_RUNBOOK.md` | Yedek sonrası Aqua: anon, `verify_login`, CORS, merge |
| `database/BERQENAS_CLOUD_DEPLOY.md` | Genel port / mimari |
| `database/VPS_RETAIL_EX_VE_EXFINPDKS_KURULUM.md` | Retail + API VPS özeti |

---

## Hızlı doğrulama (dışarıdan)

Caddy düzelince kiracı kökü ve tablo uçları PostgREST’ten cevap verir (yetki yoksa **401**, kayıt yoksa **200 + `[]`** — tipik olarak Caddy `not_found` değil):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "https://api.retailex.app/berzin_com/firms?select=*&limit=1"
```

Hâlâ `404` ve gövde `not_found` ise sorun hâlâ **Caddy eşlemesi veya upstream erişimi**dir; önce §“Caddy `not_found` için kontrol listesi”ni tamamlayın.
