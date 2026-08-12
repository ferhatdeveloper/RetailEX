# Dokploy — PDKS API (uzak PostgreSQL)

RetailEX SaaS (`docker-compose.dokploy.yml`) dışında, **Dokploy → PDKS** projesinde uzak PG kiracılarına PostgREST API.

## Ne sağlar?

| Path | Kaynak | Kaynak firma |
|------|--------|--------------|
| `GET /` | JSON sağlık | — |
| `/naw_pdks/*` | PostgREST → `NAW_PDKS` | FRM001 / demo |
| `/exfin_pdks/*` | PostgREST → `EXFIN_PDKS` | DISMARCO |
| `/dismarco_pdks/*` | alias → EXFIN | DISMARCO |
| `/xnawcomrest/*` | TCP proxy → `:8000` | xNAWCOMREST |

## Dokploy kurulum (SSH yok)

1. Dokploy → proje **PDKS** → **Create Service** → **Docker Compose**
2. Repo: `ferhatdeveloper/RetailEX` / branch `main`
3. Compose path: `docker-compose.dokploy.pdks.yml`
4. **Environment** alanına `docker/dokploy.pdks.env.example` değerlerini (şifreyle) girin
5. Deploy / Redeploy
6. **Domains**: `pdks_api_gateway` için domain ekleyin  
   örn. `pdks-api.berqenas.cloud` (HTTPS Traefik)
7. Test:
   ```bash
   curl -sS https://pdks-api.berqenas.cloud/
   curl -sS https://pdks-api.berqenas.cloud/naw_pdks/ | head
   curl -sS https://pdks-api.berqenas.cloud/exfin_pdks/ | head
   ```

## Önemli

- Şifreler yalnız Dokploy Environment / Secrets — git’e yazılmaz.
- Uzak PG (`PDKS_PG_HOST`) VPS’ten erişilebilir olmalı (firewall’da Dokploy sunucu IP’si açık).
- PDKS tabloları genelde `public`; `anon` rolü yoksa `PDKS_PGRST_ANON_ROLE=postgres`.
- Bu yığın `siti_pdks` / `api.retailex.app` RetailEX gateway’ini değiştirmez.

## Dosyalar

- `docker-compose.dokploy.pdks.yml`
- `database/docker/Caddyfile.pdks-api-gateway`
- `docker/dokploy.pdks.env.example`
