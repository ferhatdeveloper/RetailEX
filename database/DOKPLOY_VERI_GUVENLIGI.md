# Dokploy — veri güvenliği (PostgreSQL)

Tüm kiracı veritabanları (`merkez_db`, `lovan`, `kasap`, …) **Docker named volume** içinde tutulur:

```
saas_postgres_data  →  /var/lib/postgresql/data
```

## Güvenli işlemler (veriye dokunmaz)

| İşlem | Etki |
|--------|------|
| `dokploy-redeploy-frontend.sh` | Sadece React/Nginx imajı; **DB yok** |
| `docker compose up -d retailex_frontend` | UI konteyneri yenilenir |
| `docker compose up -d postgres` | Aynı volume’a bağlanır; **veri kalır** |
| Konteyner restart / recreate | Volume ayrıdır; **veri kalır** |
| `git pull` + frontend build | Kod değişir; **DB yok** |

## ASLA yapmayın (veri silinir)

| İşlem | Sonuç |
|--------|--------|
| `docker compose down -v` | Volume’lar silinir |
| `docker volume rm saas_postgres_data` | **Tüm DB’ler gider** |
| Dokploy’da **“Delete volumes”** / Clean volumes | **Veri gider** |
| Postgres’i **farklı volume adıyla** yeniden tanımlamak | Boş yeni disk; eski volume orphan kalır |
| `POSTGRES_PASSWORD` değiştirip yeni postgres konteyneri | Eski volume var ama şifre uyuşmaz; karışıklık |

## Önerilen güvenli kurtarma sırası

```bash
# 1) Volume var mı?
docker volume inspect saas_postgres_data

# 2) Sadece arayüz (en güvenli)
POSTGRES_PASSWORD='MEVCUT_SIFRE' bash database/scripts/dokploy-redeploy-frontend.sh

# 3) Site + API ayağa kalksın, DB’ye dokunmadan
POSTGRES_PASSWORD='MEVCUT_SIFRE' bash database/scripts/dokploy-up-minimal.sh
```

## Yedek (isteğe bağlı, panik öncesi)

```bash
docker exec saas_postgres pg_dumpall -U postgres | gzip > ~/backup-$(date +%F).sql.gz
```

**Not:** `dokploy-up-minimal.sh` postgres’i `up -d` ile başlatır; mevcut `saas_postgres_data` volume’unu kullanır, yeni cluster oluşturmaz.
