# Berqenas Cloud — RetailEX Master Şema ve Bağlantı

Bu rehber, **Berqenas Cloud** (Ubuntu VPS + Docker: PostgreSQL, pgAdmin, WireGuard) üzerinde `000_master_schema.sql` çalıştırmanızı ve RetailEX’i uzak veritabanına bağlamanızı anlatır.

---

## Ön koşul

- VPN’e bağlı olmalısınız (WireGuard peer_admin config ile).
- Sunucuya SSH erişiminiz olmalı (`ssh kullanici@72.60.182.107` veya kullandığınız IP).

---

## 1. Master şemayı sunucuda çalıştırma

### Yöntem A: Dosyayı SCP ile atıp Docker içinde çalıştırma (önerilen)

**Bilgisayarınızda** (PowerShell veya WSL; proje kökü `D:\RetailEX`):

```powershell
# 1) Migration dosyasını sunucuya kopyala
scp D:\RetailEX\database\migrations\000_master_schema.sql kullanici@72.60.182.107:/opt/berqenas-cloud/

# 2) SSH ile bağlanıp konteyner içinde çalıştır (veritabanı: retailex_db)
ssh kullanici@72.60.182.107 "docker cp /opt/berqenas-cloud/000_master_schema.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d retailex_db -f /tmp/000_master_schema.sql"
```

`kullanici` yerine Ubuntu’daki SSH kullanıcı adınızı yazın (örn. `root` veya `ubuntu`).

İsterseniz **isteğe bağlı** PostgREST anon rolünü de uygulayın:

```powershell
scp D:\RetailEX\database\migrations\007_postgrest_anon_role.sql kullanici@72.60.182.107:/opt/berqenas-cloud/
ssh kullanici@72.60.182.107 "docker cp /opt/berqenas-cloud/007_postgrest_anon_role.sql saas_postgres:/tmp/ && docker exec saas_postgres psql -U postgres -d retailex_db -f /tmp/007_postgrest_anon_role.sql"
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

### PostgREST (VPN olmadan)

`Rest API (PostgREST)` seçeneği için sunucuda **postgrest container'ı** ve dışarıdan erişim açık olmalı:

1. Sunucuda portu açın:
```bash
ufw allow 3002/tcp
```

2. Docker compose içine `postgrest` servisi eklenmeli (örnek):
```yaml
  postgrest:
    image: postgrest/postgrest:latest
    container_name: saas_postgrest
    restart: always
    environment:
      PGRST_DB_URI: "postgres://postgres:root_password_2026@172.20.0.10:5432/retailex_db"
      PGRST_DB_ANON_ROLE: "anon"
      PGRST_DB_SCHEMAS: "public,logic,wms,rest,beauty,pos"
      PGRST_SERVER_HOST: "0.0.0.0"
      PGRST_SERVER_PORT: "3000"
      PGRST_SERVER_CORS_ALLOWED_ORIGINS: "*"
    ports:
      - "3002:3000"
    networks:
      berqenas_net:
```

Bu ayağı yaptıktan sonra, uygulama tarafında URL’yi şöyle girin:
- `http://72.60.182.107:3002` (VPN’siz public IP)
- veya VPN açıkken `http://172.20.0.10:3002`

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
| DB’ler          | pdks_db, retailex_db, beauty_db, rest_db |
| RetailEX DB     | retailex_db |

---

## 5. Sonraki adım

Master şema uygulandıktan sonra:

- **Demo veri** isterseniz: `001_demo_data.sql` dosyasını aynı yöntemle `retailex_db` üzerinde çalıştırabilirsiniz.
- **RetailEX uygulamasını** buluta bağlamak için: Web’de “remote”/“online” modda **remote host** = `172.20.0.10`, **database** = `retailex_db`, **user** = `postgres`, **password** = `root_password_2026` olacak şekilde ayarlayın (VPN açıkken erişim gerekir).

Bu dosyayı güvenli bir yerde saklayarak sunucuyu sıfırladığınızda veya yeni makineye taşındığınızda aynı adımları tekrarlayabilirsiniz.
