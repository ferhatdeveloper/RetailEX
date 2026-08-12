# Aqua Beauty — Yedek Yükleme Sonrası Operasyon Runbook

**API 404 ve gövde `{"ok":false,"error":"not_found"}`** (ör. `/berzin_com/firms`, `/aqua/rpc/verify_login`): Bu metin **Caddy** varsayılan yanıtıdır; PostgREST’e istek gitmemiştir. Önce **`database/API_PATH_404_CADDY_NOT_FOUND.md`** kontrol listesine bakın. Gövde PostgREST JSON hata kodu (`PGRST…`) ise bu runbook’taki §4–§5 devreye girer.

Bu doküman, `pg_dumpall` yedeği yüklendikten sonra RetailEX web + PostgREST akışını tekrar ayağa kaldırmak için uygulanacak adımları içerir.

Hedef senaryo:
- `tenant_registry.code = aqua_beauty`
- `module = clinic`
- API tabanı: `https://api.retailex.app/aqua`
- Web: `https://retailex.app`

---

## 1) Repo güncelle

```bash
cd /opt/berqenas-cloud/projects/retailex
git fetch origin main && git reset --hard origin/main
```

---

## 2) Yedeği DB'ye import et

Not: `pg_dumpall` dosyası cluster dump ise doğrudan hatalara açık olabilir. Bu projede pratikte `retailex_local` bölümünü `aqua_beauty` DB'ye aktarma kullanıldı.

```bash
cd /opt/berqenas-cloud/projects/retailex

awk '
  /^\\connect retailex_local$/ {in_db=1; print; next}
  /^\\connect / && in_db==1 {exit}
  in_db==1 {print}
' pg_all_20260427_181508.sql > retailex_local_only.sql

sed -i 's/^\\connect retailex_local$/\\connect aqua_beauty/' retailex_local_only.sql

docker exec -i saas_postgres psql -U postgres -d postgres -c "CREATE DATABASE aqua_beauty;" 2>/dev/null || true
docker exec -i saas_postgres psql -U postgres -d postgres -f /dev/stdin < retailex_local_only.sql
```

Kontrol:
```bash
docker exec -i saas_postgres psql -U postgres -d aqua_beauty -c "\dt"
```

---

## 3) Tenant kaydını doğrula

```bash
docker exec -i saas_postgres psql -U postgres -d merkez_db -c "
UPDATE tenant_registry
SET connection_provider='rest_api',
    rest_base_url='https://api.retailex.app/aqua',
    database_name='aqua_beauty',
    updated_at=now()
WHERE code='aqua_beauty';

SELECT code, module, connection_provider, rest_base_url, database_name
FROM tenant_registry
WHERE code='aqua_beauty';
"
```

Beklenen:
- `module = clinic`
- `connection_provider = rest_api`
- `rest_base_url = https://api.retailex.app/aqua`
- `database_name = aqua_beauty`

---

## 4) PostgREST anon yetkilerini tekrar uygula (401/42501 fix)

```bash
docker exec -i saas_postgres psql -U postgres -d aqua_beauty <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
SQL
```

---

## 5) verify_login RPC fonksiyonlarını tekrar kur (404 PGRST202 fix)

Önemli: Bu DB'de kullanıcı parolası `public.users.password_hash` alanında tutuluyor.

```bash
docker exec -i saas_postgres psql -U postgres -d aqua_beauty <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS logic;

-- Test login gerekiyorsa admin parolasını geçici olarak "admin" yapar:
UPDATE public.users
SET password_hash = crypt('admin', gen_salt('bf')),
    updated_at = now()
WHERE LOWER(username) = 'admin';

DROP FUNCTION IF EXISTS public.verify_login(text,text,text);
CREATE OR REPLACE FUNCTION public.verify_login(
  firm_nr text,
  password text,
  username text
)
RETURNS TABLE(
  out_username text,
  out_full_name text,
  out_role text,
  out_user_id uuid,
  out_firm_nr text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    u.username::text,
    COALESCE(u.full_name, u.username)::text,
    COALESCE(r.name, u.role)::text,
    u.id::uuid,
    COALESCE(u.firm_nr, verify_login.firm_nr)::text
  FROM public.users u
  LEFT JOIN public.roles r ON r.id = u.role_id
  WHERE COALESCE(u.is_active, true) = true
    AND LOWER(u.username) = LOWER(verify_login.username)
    AND u.password_hash = crypt(verify_login.password, u.password_hash)
    AND (
      verify_login.firm_nr IS NULL OR verify_login.firm_nr = '' OR
      COALESCE(u.firm_nr,'') = verify_login.firm_nr
    )
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS logic.verify_login(text,text,text);
CREATE OR REPLACE FUNCTION logic.verify_login(
  firm_nr text,
  password text,
  username text
)
RETURNS TABLE(
  out_username text,
  out_full_name text,
  out_role text,
  out_user_id uuid,
  out_firm_nr text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.verify_login(firm_nr, password, username);
$$;

GRANT USAGE ON SCHEMA logic TO anon;
GRANT EXECUTE ON FUNCTION public.verify_login(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION logic.verify_login(text,text,text) TO anon;
SQL
```

PostgREST cache yenile:
```bash
docker exec -i saas_postgres psql -U postgres -d aqua_beauty -c "NOTIFY pgrst, 'reload schema';"
docker restart saas_postgrest_aqua_beauty
```

RPC test:
```bash
curl -i -X POST "https://api.retailex.app/aqua/rpc/verify_login" \
  -H "Content-Type: application/json" \
  -H "Accept-Profile: logic" \
  -H "Content-Profile: logic" \
  -d '{"firm_nr":"001","username":"admin","password":"admin"}'
```

Beklenen: HTTP `200` ve en az 1 satır JSON.

---

## 6) CORS preflight doğrula (content-profile fix)

```bash
curl -i -X OPTIONS "https://api.retailex.app/aqua/firms?select=*" \
  -H "Origin: https://retailex.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: content-profile,accept-profile,authorization,content-type" | sed -n '1,40p'
```

`access-control-allow-headers` içinde şunlar görünmeli:
- `Content-Profile`
- `Accept-Profile`

Eksikse:
```bash
export INSTALL_DIR=/opt/berqenas-cloud
export MERKEZ_API_PUBLIC_DOMAIN=api.retailex.app
export MERKEZ_API_ALLOWED_ORIGINS="https://retailex.app,https://ilsa.berqenas.cloud"
bash database/scripts/berqenas-caddy-merge-merkez-api.sh
```

---

## 7) Web deploy

```bash
cd /opt/berqenas-cloud/projects/retailex
env RETAILEX_GIT_URL="https://github.com/ferhatdeveloper/RetailEX.git" \
    RETAILEX_PUBLIC_DOMAIN="retailex.app" \
    SKIP_MERKEZ_API=0 \
    bash database/scripts/berqenas-deploy-web.sh
```

Eğer `retailex_caddy` isim çakışması olursa:
```bash
docker ps -aq -f name=^/retailex_caddy$ | xargs -r docker rm -f
docker ps -aq -f name=^/retailex_frontend$ | xargs -r docker rm -f
docker ps -aq -f name=^/retailex_bridge$ | xargs -r docker rm -f
```
ve deploy komutunu tekrar çalıştır.

---

## 8) Tarayıcı tarafı cache temizliği

Browser console:
```js
localStorage.removeItem('retailex_web_config');
localStorage.removeItem('exretail_firma_donem_configured');
localStorage.removeItem('exretail_selected_tenant');
localStorage.removeItem('exretail_selected_firma_id');
localStorage.removeItem('retailex_active_module');
```

Sonra `Ctrl+F5`.

---

## 9) Modül yönlendirme doğrulama (clinic -> beauty)

`aqua_beauty` satırında `module=clinic` ise:
- Tenant apply sonrası web config `system_type=beauty`, `tenant_module=clinic` alır.
- Başlangıç modülü `beauty` olmalıdır (market POS değil).

---

## 10) Güvenlik sonrası adım (zorunlu)

Test için admin parolası `admin` yapıldıysa canlıya geçmeden değiştir:

```bash
docker exec -i saas_postgres psql -U postgres -d aqua_beauty -c "
UPDATE public.users
SET password_hash = crypt('YeniGucluSifre123!', gen_salt('bf')),
    updated_at = now()
WHERE LOWER(username)='admin';
"
```

---

## Hızlı sağlık kontrol komutları

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "retailex_(caddy|frontend|bridge)|saas_postgrest_aqua_beauty|saas_postgres"
curl -sS https://api.retailex.app/
curl -sS "https://api.retailex.app/aqua/firms?select=*&order=firm_nr.asc"
```
