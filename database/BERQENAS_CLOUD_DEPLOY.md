# Berqenas Cloud — RetailEX Master Şema ve Bağlantı

Bu rehber, **Berqenas Cloud** (Ubuntu VPS + Docker: PostgreSQL, pgAdmin, WireGuard) üzerinde `000_master_schema.sql` çalıştırmanızı ve RetailEX’i uzak veritabanına bağlamanızı anlatır.

---

## Ön koşul

- Sunucuya SSH erişiminiz olmalı (`ssh kullanici@berqenas.cloud` veya VPS IP).
- **DNS:** Üretimde `berqenas.cloud` alan adının **A kaydı** VPS genel IP’sine işaret etmeli; WireGuard `SERVERURL` varsayılanı bu alan adıdır (istemciler VPN’e alan adıyla bağlanır).
- **WireGuard isteğe bağlıdır:** `database/scripts/berqenas-cloud-install.sh` ile `ENABLE_VPN=0` vererek VPN’siz stack kurulabilir. VPN açıksa peer config: `docker exec -it saas_vpn cat /config/peer_admin/peer_admin.conf` (konteyner yoksa VPN kapalıdır).

---

## 0. Sıfır kurulum (tek betik, VPN isteğe bağlı)

Repoyu sunucuya klonlayın (`database/scripts` ve `database/docker` yolları erişilebilir olsun):

```bash
cd /path/to/RetailEX/database/scripts
chmod +x berqenas-cloud-install.sh create_berqenas_tenant_databases.sh
sudo bash berqenas-cloud-install.sh
```

**Tek parça “tam kurulum” (eski `sudo bash -c` stiline denk):** `database/scripts/berqenas-vps-full-paste.sh` — Docker + Postgres + pgAdmin + isteğe bağlı WireGuard (`SERVERURL=berqenas.cloud`) + tüm DB’ler + `authenticator` + `merkez_db.tenant_registry`. **Etkileşimli sorular:** terminal açıksa önce “VPN kurulsun mu?” (E/h), sonra “RetailEX Web GitHub URL?” (boş = atla). Otomasyon: `ENABLE_VPN=0 RETAILEX_GIT_URL=https://github.com/kullanici/RetailEX.git sudo -E bash berqenas-vps-full-paste.sh`

Web dağıtımı `database/scripts/berqenas-deploy-web.sh` ile: repoyu `INSTALL_DIR/projects/retailex` altına klonlar, `Dockerfile.frontend` ile imaj üretir, `berqenas_net` üzerinde `:8080` yayınlar.

```bash
cd /path/to/RetailEX/database/scripts
sudo bash berqenas-vps-full-paste.sh
```

| Ortam değişkeni | Varsayılan | Açıklama |
|-----------------|------------|----------|
| `ENABLE_VPN` | `1` | `0` → WireGuard servisi yazılmaz / kalkırılmaz; UFW’de 51820 açılmaz. |
| `ENABLE_POSTGREST` | `0` | `1` → `docker-compose.postgrest-per-db.yml` ile birlikte `docker compose up` (3002–3006, UFW). |
| `INSTALL_DIR` | `/opt/berqenas-cloud` | Veri ve compose dosyaları. |
| `SERVERURL` | `berqenas.cloud` | `ENABLE_VPN=1` iken WireGuard istemci endpoint’i (linuxserver/wireguard). DNS A → VPS IP. |

**VPN kapalı örnek:**

```bash
cd /path/to/RetailEX/database/scripts
ENABLE_VPN=0 sudo -E bash berqenas-cloud-install.sh
```

---

## 1. Master şemayı sunucuda çalıştırma

### Yöntem A: Dosyayı SCP ile atıp Docker içinde çalıştırma (önerilen)

**Bilgisayarınızda** (PowerShell veya WSL; proje kökü `D:\RetailEX`):

```powershell
# 1) Migration dosyasını sunucuya kopyala
scp D:\RetailEX\database\migrations\000_master_schema.sql kullanici@berqenas.cloud:/opt/berqenas-cloud/

# 2) SSH ile bağlanıp konteyner içinde çalıştır (veritabanı: retailex_db)
ssh kullanici@berqenas.cloud "docker cp /opt/berqenas-cloud/000_master_schema.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d retailex_db -f /tmp/000_master_schema.sql"
```

`kullanici` yerine Ubuntu’daki SSH kullanıcı adınızı yazın (örn. `root` veya `ubuntu`).

İsterseniz **isteğe bağlı** PostgREST anon rolünü de uygulayın:

```powershell
scp D:\RetailEX\database\migrations\007_postgrest_anon_role.sql kullanici@berqenas.cloud:/opt/berqenas-cloud/
ssh kullanici@berqenas.cloud "docker cp /opt/berqenas-cloud/007_postgrest_anon_role.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d retailex_db -f /tmp/007_postgrest_anon_role.sql"
```

### Yöntem B: Tek SSH oturumunda (dosya sunucuda zaten varsa)

Sunucuda `/opt/berqenas-cloud/000_master_schema.sql` dosyası varsa:

```bash
cd /opt/berqenas-cloud
docker cp 000_master_schema.sql saas_postgres:/tmp/
docker exec saas_postgres psql -U postgres -d retailex_db -f /tmp/000_master_schema.sql
```

### Yöntem C: pgAdmin ile (VPN açıkken)

1. Tarayıcıda **http://172.20.0.20** → Giriş: ferhatdeveloper@gmail.com / Yq7xwQpt6c*
2. **Add New Server** → Host: `postgres` (veya `172.20.0.10`), Maintenance DB: `postgres`, User: `postgres`, Password: `root_password_2026`
3. Sol ağaçta **retailex_db** → sağ tık **Query Tool**
4. **Open File** ile `000_master_schema.sql` dosyasını seçip **Execute (F5)** ile çalıştırın.

---

## 2. Bağlantı bilgileri (RetailEX / pg_bridge / PostgREST)

VPN **açıkken** kullanacağınız değerler:

| Ayar        | Değer |
|------------|--------|
| Host       | `172.20.0.10` (veya sunucu hostname’i) |
| Port       | `5432` |
| Database   | `retailex_db` |
| Username   | `postgres` |
| Password   | `root_password_2026` |

**Connection string örneği:**

```
postgres://postgres:root_password_2026@172.20.0.10:5432/retailex_db
```

**Not:** RetailEX varsayılanında veritabanı adı `retailex_local` geçer. Bulutta **retailex_db** kullandığınız için uygulama/ortam ayarlarında **database** alanını `retailex_db` yapın (veya sunucuda `retailex_local` adında bir DB oluşturup şemayı oraya atabilirsiniz).

### PostgREST — her veritabanı ayrı port

`Rest API (PostgREST)` için **her PostgreSQL veritabanına ayrı PostgREST konteyneri** ve **farklı host portu** kullanılır (RetailEX’te kiracı DB’leri: `merkez_db`, `aqua_beauty_db`, …).

**Ön koşul:** PostgREST’in `anon` rolünü kullanması için `007_postgrest_anon_role.sql` dosyasını **ilgili her veritabanında** ayrı çalıştırın (örnek: `-d aqua_beauty_db`).

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
ufw allow 3002:3006/tcp
ufw reload
```

**Port — veritabanı eşlemesi**

| Host portu | Veritabanı      | Konteyner adı (örnek)   |
|-----------|-----------------|-------------------------|
| 3002      | `merkez_db`     | `saas_postgrest_merkez` |
| 3003      | `aqua_beauty_db`| `saas_postgrest_aqua_beauty` |
| 3004      | `qubocoffe_db`  | `saas_postgrest_qubocoffe` |
| 3005      | `dismarco_db`   | `saas_postgrest_dismarco` |
| 3006      | `bestcom_db`    | `saas_postgrest_bestcom` |

Uygulama tarafında örnek taban URL (public IP):

- Merkez: `http://berqenas.cloud:3002`
- Aqua Beauty: `http://berqenas.cloud:3003`
- … (port tablosuna göre)

VPN açıksa aynı portlar üzerinden `172.20.0.10` yerine **sunucunun erişilebilir IP’si** kullanılır; PostgREST konteynerleri `postgres` servis adıyla aynı Docker ağında konuşur.

**Yeni firma DB’si eklemek:** `docker-compose.postgrest-per-db.yml` içinde yeni bir servis kopyalayıp `PGRST_DB_URI` içindeki veritabanı adını ve `ports` altındaki host portunu (ör. `3007:3000`) değiştirin; `ufw` ve RetailEX `remote_rest_url` ayarını buna göre güncelleyin.

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
| DB’ler          | Kiracı: `merkez_db`, `aqua_beauty_db`, `qubocoffe_db`, `dismarco_db`, `bestcom_db`; isteğe bağlı: `pdks_db`, `retailex_db`, `beauty_db`, `rest_db` |
| PostgREST portları | 3002–3006 (kiracı DB başına bir port; ayrıntı: §2 PostgREST) |
| RetailEX DB     | Kullanım senaryosuna göre (ör. `retailex_db` veya firma DB’si) |

---

## 5. Sonraki adım

Master şema uygulandıktan sonra:

- **Demo veri** isterseniz: `001_demo_data.sql` dosyasını aynı yöntemle `retailex_db` üzerinde çalıştırabilirsiniz.
- **RetailEX uygulamasını** buluta bağlamak için: Web’de “remote”/“online” modda **remote host** = `172.20.0.10`, **database** = `retailex_db`, **user** = `postgres`, **password** = `root_password_2026` olacak şekilde ayarlayın (VPN açıkken erişim gerekir).

Bu dosyayı güvenli bir yerde saklayarak sunucuyu sıfırladığınızda veya yeni makineye taşındığınızda aynı adımları tekrarlayabilirsiniz.
