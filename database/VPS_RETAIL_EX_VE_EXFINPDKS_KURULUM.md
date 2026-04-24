# VPS: RetailEX ve EXFIN PDKS kurulum özeti

Bu dosya **RetailEX** (`retailex.app`), **HTTPS API alt alanı** (`api.retailex.app` veya `api.<alan_adı>`), **PostgREST** ve **EXFIN PDKS** (`exfinpdks.com`) için sunucu kurulum / sıfırdan yeniden kurulum adımlarını özetler. Ayrıntılı mimari ve güvenlik için `database/BERQENAS_CLOUD_DEPLOY.md` dosyasına bakın.

---

## 1. Mimari kısa özet

| Bileşen | Açıklama |
|--------|----------|
| **Berqenas stack** | Docker: PostgreSQL, pgAdmin, PostgREST (kiracı DB başına portlar 3002–3009), UFW. |
| **RetailEX web** | `Dockerfile.frontend` ile imaj; konteyner `retailex_frontend`. TLS: **Caddy** (`retailex_caddy`). Varsayılan: **https://retailex.app** + **http://SUNUCU_IP:8080**. |
| **Merkez API (HTTPS)** | Caddy’de **`api.<RETAILEX_PUBLIC_DOMAIN>`** (ör. `api.retailex.app`): kökte JSON sağlık cevabı; **`/merkez/*`** → `saas_postgrest_merkez`, **`/aqua/*`** → `saas_postgrest_aqua_beauty`. Web imajı build sırasında **`VITE_MERKEZ_REST_URL=https://api.../merkez`** ile üretilir (Mixed Content önlenir). |
| **merkez_db** | `tenant_registry` tablosu; PostgREST için **`anon`** rolüne yalnızca `tenant_registry` **SELECT** (`merkez_db_anon_minimal.sql`). |
| **EXFIN PDKS web** | `database/docker/Dockerfile.exfinpdks-web`; kaynak `EXFINPDKS` GitHub klonu; konteyner `exfinpdks_frontend`. Varsayılan: **https://exfinpdks.com**, **http://SUNUCU_IP:8091**. |
| **Caddy** | `INSTALL_DIR/caddy/Caddyfile` (varsayılan `/opt/berqenas-cloud/caddy/Caddyfile`). Site blokları **üst üste yazılmaz**; `retailex.app`, `exfinpdks.com`, `api.*` ayrı bloklar. |

---

## 2. Sıfır Ubuntu VPS — tek komut (önerilen)

**SSH ile root (veya sudo)**, TTY açıkken (`curl | bash` ile şifre soruları için):

```bash
curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/berqenas-one-liner-bootstrap.sh | bash
```

Bu akış sırasıyla:

1. Sistem paketleri, **RetailEX** reposunu `/opt/RetailEX` altına klonlar (private repo ise GitHub PAT sorar).
2. **`berqenas-vps-fresh-install-all.sh`** → **`berqenas-saas-from-zero.sh`** → **`berqenas-vps-full-paste.sh`**: Docker stack, veritabanları, PostgREST, `merkez_db` + `tenant_registry` + `anon` SQL.
3. **`berqenas-deploy-web.sh`**: `INSTALL_DIR/projects/retailex` klonu, frontend imajı (**`VITE_MERKEZ_REST_URL`** ile), Caddy, **`berqenas-caddy-merge-merkez-api.sh`** ile API alt alanı, `aqua_beauty` için `rest_base_url` güncellemesi.
4. Varsayılan olarak **`DEPLOY_EXFINPDKS=1`**: **`berqenas-deploy-exfinpdks-web.sh`** (EXFIN web + Caddy’de `exfinpdks.com`).

EXFIN’i kurmadan sadece RetailEX yığını için:

```bash
curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/berqenas-one-liner-bootstrap.sh | env DEPLOY_EXFINPDKS=0 bash
```

**DNS (Let’s Encrypt için zorunlu):**

| Kayıt | Tip | Değer |
|-------|-----|--------|
| `retailex.app` | A | VPS IPv4 |
| `api` (veya tam `api.retailex.app` paneline göre) | A | Aynı IPv4 |
| `exfinpdks.com` | A | Aynı IPv4 (EXFIN kullanılacaksa) |

**Not:** `api` için **A** kaydı kullanın; **AAAA** ile IPv4 yazmayın.

---

## 3. Repo zaten sunucudaysa (tek betik)

```bash
cd /opt/RetailEX   # veya klon yolunuz
git fetch origin main && git reset --hard origin/main
sudo env RETAILEX_GIT_URL="https://github.com/ferhatdeveloper/RetailEX.git" \
  bash database/scripts/berqenas-vps-fresh-install-all.sh
```

Şifreleri sorulmadan vermek için önce `export POSTGRES_PASSWORD=...` vb. kullanın; ayrıntı `berqenas-saas-from-zero.sh` başlığında.

---

## 4. Ortam değişkenleri (sık kullanılanlar)

| Değişken | Varsayılan / anlam |
|----------|---------------------|
| `DEPLOY_EXFINPDKS` | `1` (`berqenas-vps-fresh-install-all.sh`); `berqenas-saas-from-zero` doğrudan çağrılırsa `0`. |
| `SKIP_MERKEZ_API` | `1` değilse: `api.<RETAILEX_PUBLIC_DOMAIN>` Caddy + `VITE_MERKEZ_REST_URL` build. |
| `MERKEZ_API_PUBLIC_DOMAIN` | Boşsa `api.${RETAILEX_PUBLIC_DOMAIN}`. |
| `VITE_MERKEZ_REST_URL` | Doluysa build’te doğrudan bu URL kullanılır (MERKEZ_API_PUBLIC_DOMAIN türetmesini geçersiz kılar). |
| `RETAILEX_PUBLIC_DOMAIN` | `berqenas-saas-from-zero` ile genelde `retailex.app`. Boş string: sadece `:8080`, Caddy + API birleştirme yok. |
| `INSTALL_DIR` | `/opt/berqenas-cloud` |

---

## 5. RetailEX web — sadece güncelleme

DNS: `retailex.app` A → VPS IPv4.

```bash
cd /opt/berqenas-cloud/projects/retailex   # veya /opt/RetailEX
git fetch origin main && git reset --hard origin/main
sudo env RETAILEX_GIT_URL="https://github.com/ferhatdeveloper/RetailEX.git" \
  RETAILEX_PUBLIC_DOMAIN="retailex.app" \
  bash database/scripts/berqenas-deploy-web.sh
```

GitHub Actions: `.github/workflows/deploy-vps-web.yml`; secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.

---

## 6. EXFIN PDKS — sadece güncelleme

DNS: `exfinpdks.com` A → VPS IPv4.

```bash
cd /opt/berqenas-cloud/projects/retailex   # RetailEX klonu (Dockerfile yolu için)
sudo bash database/scripts/berqenas-deploy-exfinpdks-web.sh
```

`curl … | bash` ile bu betiği çalıştırmayın; Dockerfile yolu RetailEX kopyasına bağlıdır.

---

## 7. Sağlık ve DNS kontrolü

```bash
dig +short api.retailex.app A @1.1.1.1
curl -sS https://api.retailex.app/
```

Beklenen: `{"ok":true,"service":"retailex-api"}`.

Merkez PostgREST (örnek): `https://api.retailex.app/merkez/tenant_registry?select=code`.

---

## 8. Servisler ve loglar

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
curl -sI --max-time 5 http://127.0.0.1:8080/
curl -sI --max-time 5 http://127.0.0.1:8091/
docker logs --tail 80 retailex_caddy
```

---

## 9. PostgREST portları (doğrudan HTTP)

Kiracı başına host portları (örnek): **3002** merkez_db … **3009** retailex_demo. Tablo: `BERQENAS_CLOUD_DEPLOY.md`. Tarayıcıdan üretimde **`https://api.../merkez`** tercih edilir (TLS + aynı site politikası).

---

## 10. İlgili dosyalar (RetailEX reposu)

| Dosya | Rol |
|-------|-----|
| `database/scripts/berqenas-one-liner-bootstrap.sh` | Apt + TTY şifreleri + klon + `berqenas-vps-fresh-install-all.sh` |
| `database/scripts/berqenas-vps-fresh-install-all.sh` | Tam yığın girişi; `DEPLOY_EXFINPDKS` varsayılan `1` |
| `database/scripts/berqenas-saas-from-zero.sh` | SaaS varsayılanları → `berqenas-vps-full-paste.sh`; isteğe bağlı EXFIN |
| `database/scripts/berqenas-vps-full-paste.sh` | Docker Compose, DB’ler, `tenant_registry`, `merkez_db_anon_minimal.sql`, UFW, web deploy çağrısı |
| `database/scripts/berqenas-deploy-web.sh` | RetailEX klon + `VITE_MERKEZ_REST_URL` ile build + Caddy + API birleştirme |
| `database/scripts/berqenas-caddy-merge-merkez-api.sh` | `api.*` Caddy bloğu + reload |
| `database/scripts/merkez_db_anon_minimal.sql` | merkez_db `anon` + `tenant_registry` SELECT |
| `database/scripts/caddy-api-retailex.app.example.caddy` | Elle inceleme / yedek örnek (betik otomatik ekler) |
| `database/scripts/berqenas-deploy-exfinpdks-web.sh` | EXFIN web + Caddy |
| `Dockerfile.frontend` | `ARG VITE_MERKEZ_REST_URL` |
| `.github/workflows/deploy-vps-web.yml` | `main` push → SSH ile web deploy |
| `database/BERQENAS_CLOUD_DEPLOY.md` | Uzun rehber |

---

*Betikler güncellenince önce bu dosya ve ilgili `.sh` dosyalarındaki yorum başlıklarına bakın.*
