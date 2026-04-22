# Berqenas Cloud — RetailEX Master Şema ve Bağlantı

Bu rehber, **Berqenas Cloud** (Ubuntu VPS + Docker: PostgreSQL, pgAdmin, WireGuard) üzerinde `000_master_schema.sql` çalıştırmanızı ve RetailEX’i uzak veritabanına bağlamanızı anlatır.

---

## Ön koşul

- Sunucuya SSH erişiminiz olmalı (`ssh kullanici@berqenas.cloud` veya VPS IP).
- **DNS:** WireGuard kullanıyorsanız `berqenas.cloud` (veya `SERVERURL`) **A kaydı** VPS IPv4’e işaret etmeli. RetailEX web için **`retailex.app` A kaydı** aynı VPS IPv4’e yönlendirilmeli (Let’s Encrypt / Caddy TLS için zorunlu). İsteğe bağlı: `www` alt alan adı için ayrı kayıt.
- **WireGuard isteğe bağlıdır:** `database/scripts/berqenas-cloud-install.sh` ile `ENABLE_VPN=0` vererek VPN’siz stack kurulabilir. VPN açıksa peer config: `docker exec -it saas_vpn cat /config/peer_admin/peer_admin.conf` (konteyner yoksa VPN kapalıdır).

---

## 0.1. Sıfırdan SaaS (müşteri DB + Web + PostgREST + pgAdmin + Postgres internete açık)

**Hedef mimari**

| Katman | Ne |
|--------|-----|
| Kiracı | Müşteri başına ayrı PostgreSQL veritabanı; yeni müşteri → `CREATE DATABASE tenant_xxx` + `merkez_db.tenant_registry` satırı (veya kendi kayıt süreciniz). |
| Web / mobil | **PostgREST** üzerinden HTTPS benzeri kullanım: `http(s)://VPS_IP:PORT/` (aşağı §2 port eşlemesi). CORS varsayılanı compose’ta geniş; üretimde sıkılaştırın. |
| RetailEX Web | `RETAILEX_GIT_URL` verildiğinde `berqenas-deploy-web.sh` → **https://retailex.app** (Caddy) **ve** aynı anda **http://VPS_GENEL_IP:8080** (`RETAILEX_WEB_PORT`). Sadece IP/port istenirse `export RETAILEX_PUBLIC_DOMAIN=` → yalnız **http://VPS_IP:8080**. |
| pgAdmin | `EXPOSE_PUBLIC=1` → `http://VPS_IP:PGADMIN_HOST_PORT` (varsayılan **5050**). |
| Tauri (doğrudan PG) | `postgres://KULLANICI:PAROLA@VPS_IP:5432/VERITABANI_ADI` — mümkün; **süper kullanıcıyı istemciye gömme**. Üretimde kısıtlı rol + TLS (`sslmode=require`) tercih edilir. İnternete açık **5432** brute-force riski taşır; isterseniz `EXPOSE_POSTGRES_PUBLIC=0` ile yalnızca PostgREST + uygulama sunucusu kullanın. |

**Tek betik (VPN kapalı; PostgREST açık; pgAdmin + Postgres dışarıda):**

```bash
cd /path/to/RetailEX/database/scripts
chmod +x berqenas-saas-from-zero.sh berqenas-vps-full-paste.sh
sudo RETAILEX_GIT_URL=https://github.com/KULLANICI/RetailEX.git bash berqenas-saas-from-zero.sh
```

Parolaları çevre değişkeniyle vermek için: `export POSTGRES_PASSWORD=... PGADMIN_DEFAULT_EMAIL=... PGADMIN_DEFAULT_PASSWORD=... AUTHENTICATOR_PASSWORD=...` ardından `sudo -E bash berqenas-saas-from-zero.sh`.

---

## 0. Sıfır kurulum (tek betik, VPN isteğe bağlı)

Repoyu sunucuya klonlayın (`database/scripts` ve `database/docker` yolları erişilebilir olsun):

```bash
cd /path/to/RetailEX/database/scripts
chmod +x berqenas-cloud-install.sh create_berqenas_tenant_databases.sh
sudo bash berqenas-cloud-install.sh
```

**Tek parça “tam kurulum” (eski `sudo bash -c` stiline denk):** `database/scripts/berqenas-vps-full-paste.sh` — Docker + Postgres + pgAdmin + isteğe bağlı WireGuard (`SERVERURL=berqenas.cloud`) + tüm DB’ler + `authenticator` + `merkez_db.tenant_registry`. **Etkileşimli sorular:** terminal açıksa önce “VPN kurulsun mu?” (E/h), sonra “RetailEX Web GitHub URL?” (boş = atla). Otomasyon: `ENABLE_VPN=0 RETAILEX_GIT_URL=https://github.com/kullanici/RetailEX.git sudo -E bash berqenas-vps-full-paste.sh`

Web dağıtımı `database/scripts/berqenas-deploy-web.sh` ile: repoyu `INSTALL_DIR/projects/retailex` altına klonlar, `Dockerfile.frontend` ile imaj üretir. Varsayılan olarak **Caddy** **80/443** ile **https://retailex.app** sunar; aynı frontend konteyneri **8080** (veya `RETAILEX_WEB_PORT`) üzerinden **http://VPS’nin genel IPv4 adresi:8080** ile de erişilebilir. `RETAILEX_PUBLIC_DOMAIN` bilinçli olarak boş bırakılırsa yalnızca **http://VPS_IP:8080** kalır.

```bash
cd /path/to/RetailEX/database/scripts
sudo bash berqenas-vps-full-paste.sh
```

| Ortam değişkeni | Varsayılan | Açıklama |
|-----------------|------------|----------|
| `ENABLE_VPN` | `1` | `0` → WireGuard servisi yazılmaz / kalkırılmaz; UFW’de 51820 açılmaz. |
| `ENABLE_POSTGREST` | `0` | `1` → `docker-compose.postgrest-per-db.yml` ile birlikte `docker compose up` (3002–3009, UFW). `berqenas-vps-full-paste.sh` içinde de desteklenir. |
| `EXPOSE_PUBLIC` | `0` | `1` → pgAdmin’i host’ta `PGADMIN_HOST_PORT` (varsayılan 5050) üzerinden internete açar; isteğe bağlı Postgres `5432` (UFW). Güçlü parola şart; `5432`’yi kapatmak için `EXPOSE_POSTGRES_PUBLIC=0`. |
| `PGADMIN_HOST_PORT` | `5050` | `EXPOSE_PUBLIC=1` iken tarayıcı: `http://VPS_IP:5050`. |
| `EXPOSE_POSTGRES_PUBLIC` | `1` | `EXPOSE_PUBLIC=1` iken `0` → yalnızca pgAdmin dışarıda, Postgres yayını kapalı. |
| `INSTALL_DIR` | `/opt/berqenas-cloud` | Veri ve compose dosyaları. |
| `SERVERURL` | `berqenas.cloud` | `ENABLE_VPN=1` iken WireGuard istemci endpoint’i (linuxserver/wireguard). DNS A → VPS IP. |
| `RETAILEX_GIT_URL` | — | RetailEX Git HTTPS; doluysa web kurulur. |
| `RETAILEX_PUBLIC_DOMAIN` | `retailex.app` (deploy’da değişken **hiç tanımlı değilse**) | Caddy + Let’s Encrypt; ayrıca **http://GENEL_IP:8080** açılır. Yalnız port: `sudo env RETAILEX_PUBLIC_DOMAIN= RETAILEX_GIT_URL=... bash berqenas-deploy-web.sh`. Başka alan: `RETAILEX_PUBLIC_DOMAIN=app.ornek.com`. |
| `RETAILEX_WEB_PORT` | `8080` | Yalnızca `RETAILEX_PUBLIC_DOMAIN` boşken anlam taşır. |

**VPN kapalı örnek:**

```bash
cd /path/to/RetailEX/database/scripts
ENABLE_VPN=0 sudo -E bash berqenas-cloud-install.sh
```

**Tam internete açık örnek (pgAdmin + Postgres; WireGuard isteğe bağlı):**

```bash
EXPOSE_PUBLIC=1 ENABLE_VPN=0 sudo -E bash database/scripts/berqenas-vps-full-paste.sh
# Sadece pgAdmin dışarıda, Postgres kapalı:
# EXPOSE_PUBLIC=1 EXPOSE_POSTGRES_PUBLIC=0 ENABLE_VPN=0 sudo -E bash database/scripts/berqenas-vps-full-paste.sh
```

---

## 1. Master şemayı sunucuda çalıştırma

### Yöntem A: Dosyayı SCP ile atıp Docker içinde çalıştırma (önerilen)

**Bilgisayarınızda** (PowerShell veya WSL; proje kökü `D:\RetailEX`):

```powershell
# 1) Migration dosyasını sunucuya kopyala
scp D:\RetailEX\database\migrations\000_master_schema.sql kullanici@berqenas.cloud:/opt/berqenas-cloud/

# 2) SSH ile bağlanıp konteyner içinde çalıştır (örnek hedef DB: bestcom_db)
ssh kullanici@berqenas.cloud "docker cp /opt/berqenas-cloud/000_master_schema.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d bestcom_db -f /tmp/000_master_schema.sql"
```

`kullanici` yerine Ubuntu’daki SSH kullanıcı adınızı yazın (örn. `root` veya `ubuntu`).

İsterseniz **isteğe bağlı** PostgREST anon rolünü de uygulayın:

```powershell
scp D:\RetailEX\database\migrations\007_postgrest_anon_role.sql kullanici@berqenas.cloud:/opt/berqenas-cloud/
ssh kullanici@berqenas.cloud "docker cp /opt/berqenas-cloud/007_postgrest_anon_role.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d bestcom_db -f /tmp/007_postgrest_anon_role.sql"
```

### Yöntem B: Tek SSH oturumunda (dosya sunucuda zaten varsa)

Sunucuda `/opt/berqenas-cloud/000_master_schema.sql` dosyası varsa:

```bash
cd /opt/berqenas-cloud
docker cp 000_master_schema.sql saas_postgres:/tmp/
docker exec saas_postgres psql -U postgres -d bestcom_db -f /tmp/000_master_schema.sql
```

### Yöntem C: pgAdmin ile (VPN açıkken)

1. Tarayıcıda **http://172.20.0.20** → Giriş: ferhatdeveloper@gmail.com / Yq7xwQpt6c*
2. **Add New Server** → Host: `postgres` (veya `172.20.0.10`), Maintenance DB: `postgres`, User: `postgres`, Password: `root_password_2026`
3. Sol ağaçta hedef veritabanını (ör. **bestcom_db**) seçin → sağ tık **Query Tool**
4. **Open File** ile `000_master_schema.sql` dosyasını seçip **Execute (F5)** ile çalıştırın.

---

## 2. Bağlantı bilgileri (RetailEX / pg_bridge / PostgREST)

VPN **açıkken** kullanacağınız değerler:

| Ayar        | Değer |
|------------|--------|
| Host       | `172.20.0.10` (veya sunucu hostname’i) |
| Port       | `5432` |
| Database   | Kiracı adınıza göre (ör. `bestcom_db`, `aqua_beauty`) |
| Username   | `postgres` |
| Password   | `root_password_2026` |

**Connection string örneği:**

```
postgres://postgres:root_password_2026@172.20.0.10:5432/bestcom_db
```

**Not:** RetailEX varsayılanında veritabanı adı `retailex_local` geçer. Bulutta kiracı DB adınızı (ör. `bestcom_db`, `aqua_beauty`) uygulama ayarlarındaki **database** alanına yazın.

### PostgREST — her veritabanı ayrı port

`Rest API (PostgREST)` için **her PostgreSQL veritabanına ayrı PostgREST konteyneri** ve **farklı host portu** kullanılır (varsayılan kiracı seti: `merkez_db`, `dismarco_pdks`, `aqua_beauty`, `m10_pdks`, `bestcom_db`, `siti_pdks`, `pdks_demo`, `retailex_demo`).

**Ön koşul:** PostgREST’in `anon` rolünü kullanması için `007_postgrest_anon_role.sql` dosyasını **ilgili her veritabanında** ayrı çalıştırın (örnek: `-d aqua_beauty`).

1. Repodaki hazır parça dosyasını sunucuya kopyalayın (örnek hedef: `/opt/berqenas-cloud/docker-compose.postgrest-per-db.yml`):

   - Kaynak: `database/docker/docker-compose.postgrest-per-db.yml`

2. Ana compose ile birlikte kaldırın (çalışma dizini `/opt/berqenas-cloud`):

```bash
cd /opt/berqenas-cloud
docker compose -f docker-compose.yml -f docker-compose.postgrest-per-db.yml up -d --remove-orphans
```

İsteğe bağlı: `/opt/berqenas-cloud/.env` içinde `POSTGRES_PASSWORD=...` tanımlayın; tanımlı değilse dosyadaki varsayılan kullanılır.

3. Güvenlik duvarı — tüm PostgREST portları:

```bash
ufw allow 3002:3009/tcp
ufw reload
```

**Port — veritabanı eşlemesi**

| Host portu | Veritabanı      | Konteyner adı (örnek)   |
|-----------|-----------------|-------------------------|
| 3002      | `merkez_db`     | `saas_postgrest_merkez` |
| 3003      | `dismarco_pdks` | `saas_postgrest_dismarco_pdks` |
| 3004      | `aqua_beauty`   | `saas_postgrest_aqua_beauty` |
| 3005      | `m10_pdks`      | `saas_postgrest_m10_pdks` |
| 3006      | `bestcom_db`    | `saas_postgrest_bestcom` |
| 3007      | `siti_pdks`     | `saas_postgrest_siti_pdks` |
| 3008      | `pdks_demo`     | `saas_postgrest_pdks_demo` |
| 3009      | `retailex_demo` | `saas_postgrest_retailex_demo` |

Uygulama tarafında örnek taban URL (public IP; alan adını kendi VPS’inizle değiştirin):

- Merkez: `http://berqenas.cloud:3002`
- DISMARCO PDKS: `http://berqenas.cloud:3003`
- Aqua Beauty: `http://berqenas.cloud:3004`
- … (üstteki port tablosuna göre)

VPN açıksa aynı portlar üzerinden `172.20.0.10` yerine **sunucunun erişilebilir IP’si** kullanılır; PostgREST konteynerleri `postgres` servis adıyla aynı Docker ağında konuşur.

**Yeni firma DB’si eklemek:** `docker-compose.postgrest-per-db.yml` içinde yeni bir servis kopyalayıp `PGRST_DB_URI` içindeki veritabanı adını ve `ports` altındaki host portunu (ör. `3010:3000`) değiştirin; `ufw allow 3010/tcp` ve istemci `remote_rest_url` ayarını buna göre güncelleyin.

---

## 3. pgAdmin erişimi (özet)

1. WireGuard’da **peer_admin** config’i ekleyip etkinleştir:  
   `cat /opt/berqenas-cloud/wireguard_config/peer_admin/peer_admin.conf` (sunucuda) → çıktıyı WireGuard’a yapıştır.
2. Tarayıcı: **http://172.20.0.20**
3. E-posta: **ferhatdeveloper@gmail.com**  
   Şifre: **Yq7xwQpt6c***
4. Server: Host **postgres** (veya **172.20.0.10**), Maintenance DB **postgres**, User **postgres**, Password **root_password_2026**.

---

## 4. Hızlı şifre / bilgi özeti

| Ne              | Değer |
|-----------------|--------|
| PostgreSQL      | postgres / root_password_2026 |
| pgAdmin         | ferhatdeveloper@gmail.com / Yq7xwQpt6c* |
| pgAdmin URL     | http://172.20.0.20 (sadece VPN ile) |
| DB’ler          | `merkez_db`, `dismarco_pdks`, `aqua_beauty`, `m10_pdks`, `bestcom_db`, `siti_pdks`, `pdks_demo`, `retailex_demo` |
| PostgREST portları | 3002–3009 (kiracı DB başına bir port; ayrıntı: §2 PostgREST) |
| RetailEX DB     | Kiracıya göre seçilen veritabanı adı (ör. `bestcom_db`) |

---

## 5. Sonraki adım

Master şema uygulandıktan sonra:

- **Demo veri** isterseniz: `001_demo_data.sql` dosyasını aynı yöntemle hedef kiracı DB’sinde (ör. `bestcom_db`) çalıştırabilirsiniz.
- **RetailEX uygulamasını** buluta bağlamak için: Web’de “remote”/“online” modda **remote host** = `172.20.0.10`, **database** = kiracı adınız (ör. `bestcom_db`), **user** = `postgres`, **password** = `root_password_2026` olacak şekilde ayarlayın (VPN açıkken erişim gerekir).

Bu dosyayı güvenli bir yerde saklayarak sunucuyu sıfırladığınızda veya yeni makineye taşındığınızda aynı adımları tekrarlayabilirsiniz.

---

## 6. GitHub → VPS otomatik web güncelleme

`main` dalına push (belirtilen yollar değiştiyse) **GitHub Actions** ile VPS’te `berqenas-deploy-web.sh` çalışır: `git pull`, imaj derleme, `retailex_frontend` / Caddy yenileme.

1. Repo → **Settings → Secrets and variables → Actions** → `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (private key) ekleyin. İsteğe bağlı: `VPS_INSTALL_DIR` (varsayılan `/opt/berqenas-cloud`).
2. VPS’te SSH public key, Actions’ın kullandığı private key ile eşleşmeli (`authorized_keys`).
3. İş akışı: `.github/workflows/deploy-vps-web.yml`. Manuel tetik: **Actions → Deploy web to VPS → Run workflow**.

Sadece veritabanı migration’ı otomatikleştirmek için ayrı bir iş akışı eklemedik; DB için `berqenas-repo-pull-and-migrate.sh` veya cron kullanılabilir.
