# VPS: RetailEX ve EXFIN PDKS kurulum özeti

Bu dosya, sohbet kapsamında netleştirilen **RetailEX (retailex.app)** ve **EXFIN PDKS (exfinpdks.com)** sunucu kurulum / güncelleme adımlarının özetidir. Ayrıntılı mimari ve güvenlik notları için `database/BERQENAS_CLOUD_DEPLOY.md` dosyasına bakın.

---

## 1. Mimari kısa özet

| Bileşen | Açıklama |
|--------|----------|
| **Berqenas stack** | Docker: PostgreSQL, pgAdmin, isteğe bağlı PostgREST (kiracı DB başına portlar), UFW. |
| **RetailEX web** | Ayrı Docker imajı (`Dockerfile.frontend`, Node/Vite). Konteyner: `retailex_frontend`. TLS: **Caddy** (`retailex_caddy`). Varsayılan alan adı: **retailex.app**; doğrudan: **http://SUNUCU_IP:8080**. |
| **EXFIN PDKS web** | Ayrı Docker imajı (`database/docker/Dockerfile.exfinpdks-web`, Flutter web + Nginx). Kaynak **yalnızca** GitHub: `https://github.com/ferhatdeveloper/EXFINPDKS.git`. Konteyner: `exfinpdks_frontend`. Varsayılan: **https://exfinpdks.com**, **http://SUNUCU_IP:8091**. |
| **Caddy** | Aynı VPS’te 80/443; `Caddyfile` içinde site blokları **birleştirilir** (üzerine yazılmaz): `retailex.app` ve `exfinpdks.com` ayrı `reverse_proxy` hedefleri. |

---

## 2. Sıfır Ubuntu VPS — RetailEX + SaaS (tek satır)

**SSH ile root (veya sudo) oturumunda**, TTY açıkken ( `curl | bash` stdin çakışmasını önlemek için betik `/dev/tty` kullanır):

```bash
curl -fsSL https://raw.githubusercontent.com/ferhatdeveloper/RetailEX/main/database/scripts/berqenas-one-liner-bootstrap.sh | bash
```

Sorulanlar: Postgres şifresi, pgAdmin e-posta/şifre, PostgREST `authenticator` şifresi, repo **private** ise GitHub PAT.

**Ön koşullar:** `retailex.app` için DNS **A** kaydı → VPS IPv4 (HTTPS istiyorsanız). Tam “üretim şeması” için migration / master şema betikleri ayrı çalıştırılır (`BERQENAS_CLOUD_DEPLOY.md`).

---

## 3. RetailEX web — `retailex.app` güncelleme

### DNS

- `retailex.app` **A** → sunucunun genel IPv4.

### Sunucuda manuel (RetailEX klonu `/opt/RetailEX` ise)

```bash
cd /opt/RetailEX && git fetch origin main && git reset --hard origin/main && sudo env RETAILEX_GIT_URL="https://github.com/ferhatdeveloper/RetailEX.git" RETAILEX_PUBLIC_DOMAIN="retailex.app" bash database/scripts/berqenas-deploy-web.sh
```

### GitHub Actions

- `main` push → `.github/workflows/deploy-vps-web.yml` çalışır.
- Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; isteğe bağlı `VPS_INSTALL_DIR` (varsayılan `/opt/berqenas-cloud`).
- İş akışı `RETAILEX_PUBLIC_DOMAIN=retailex.app` export eder; deploy betiği `INSTALL_DIR/projects/retailex` altındaki klon + `Dockerfile.frontend` ile derler.

### `git pull` “local changes would be overwritten” hatası

VPS’teki `/opt/RetailEX` yerel değişiklikleri atıp uzak `main` ile eşitlemek:

```bash
cd /opt/RetailEX && git fetch origin main && git reset --hard origin/main
```

---

## 4. EXFIN PDKS web — kurulum / güncelleme

Kaynak **sadece** `https://github.com/ferhatdeveloper/EXFINPDKS.git` (klon: genelde `/opt/berqenas-cloud/projects/exfinpdks`). Dockerfile RetailEX reposunda: `database/docker/Dockerfile.exfinpdks-web`.

### DNS

- `exfinpdks.com` **A** → aynı VPS IPv4 (RetailEX ile aynı IP olabilir).

### Sunucuda (RetailEX betikleri `/opt/RetailEX` ise)

```bash
cd /opt/RetailEX && git pull origin main && sudo bash database/scripts/berqenas-deploy-exfinpdks-web.sh
```

**Not:** Bu betiği `curl … | bash` ile çalıştırmayın; `Dockerfile` yolu betiğin bulunduğu RetailEX kopyasına göre çözülür.

### Ortam özeti (varsayılanlar)

| Değişken | Varsayılan |
|----------|-------------|
| `EXFINPDKS_GIT_URL` | `https://github.com/ferhatdeveloper/EXFINPDKS.git` |
| `EXFINPDKS_PUBLIC_DOMAIN` | `exfinpdks.com` |
| `EXFINPDKS_WEB_PORT` | `8091` |

### Tarayıcıdan giriş

- `https://exfinpdks.com` veya `http://SUNUCU_IP:8091`

### Docker imajında karşılaşılan sorunlar (özet)

1. **`local_auth`** Dart **≥3.9** ister → Flutter imajı **3.41.x** (ör. `3.41.7`) kullanılmalı; çok eski 3.32 imajı Dart 3.8 ile `pub get` düşer.
2. **`google_fonts` 6.3.0** + Flutter 3.41’de **FontWeight const map** derleme hatası → Dockerfile’da `dart pub upgrade google_fonts` ile **6.3.2+**; web build’de `--no-wasm-dry-run` gürültüyü azaltır.

Güncel satırlar RetailEX içinde `database/docker/Dockerfile.exfinpdks-web` dosyasında tutulur.

---

## 5. Servislerin ayakta olduğunu kontrol etme

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Beklenen örnekler: `saas_postgres`, `saas_pgadmin`, `saas_postgrest_*`, `retailex_frontend`, `exfinpdks_frontend`, `retailex_caddy`.

RetailEX statik web (sunucudan):

```bash
curl -sI --max-time 5 http://127.0.0.1:8080/
```

EXFIN:

```bash
curl -sI --max-time 5 http://127.0.0.1:8091/
```

Loglar: `docker logs --tail 80 retailex_caddy`, `docker logs --tail 80 retailex_frontend`, `docker logs --tail 80 exfinpdks_frontend`.

---

## 6. PostgREST / “PDKS” API (kiracı veritabanları)

Sunucu IP ve UFW’de açık PostgREST portları (örnek aralık **3002–3009**) ile HTTP erişilir; hangi portun hangi DB’ye denk geldiği kurulum çıktısında ve `BERQENAS_CLOUD_DEPLOY.md` içindeki tabloda yer alır (ör. **pdks_demo** için ilgili port).

---

## 7. İlgili dosyalar (RetailEX reposu)

| Dosya | Rol |
|-------|-----|
| `database/scripts/berqenas-one-liner-bootstrap.sh` | Apt + sorular + klon + `berqenas-saas-from-zero.sh` |
| `database/scripts/berqenas-saas-from-zero.sh` | SaaS varsayılanları → `berqenas-vps-full-paste.sh` |
| `database/scripts/berqenas-vps-full-paste.sh` | Docker Compose, DB’ler, UFW, web URL çağrısı |
| `database/scripts/berqenas-deploy-web.sh` | RetailEX klon + `Dockerfile.frontend` + Caddy / port |
| `database/scripts/berqenas-deploy-exfinpdks-web.sh` | EXFIN klon + Flutter Dockerfile + Caddy birleştirme |
| `Dockerfile.frontend` | RetailEX web imajı (Node 22, `npm ci --legacy-peer-deps`, `SKIP_POSTGRES_REMOTE_ENABLE`) |
| `database/docker/Dockerfile.exfinpdks-web` | EXFIN Flutter web imajı |
| `.github/workflows/deploy-vps-web.yml` | `main` push → SSH ile RetailEX web deploy |
| `database/BERQENAS_CLOUD_DEPLOY.md` | Uzun rehber: DNS, güvenlik, migration, port tablosu |

---

*Bu özet, belirli bir sohbet bağlamında yazılmıştır; repodaki betikler güncellenirse önce `BERQENAS_CLOUD_DEPLOY.md` ve ilgili `.sh` dosyalarına bakın.*
