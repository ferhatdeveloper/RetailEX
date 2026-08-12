#!/usr/bin/env bash
# Dokploy VM teşhis — terminalde çalıştırın:
#   bash database/scripts/dokploy-diagnose.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FULL="${REPO_ROOT}/docker-compose.dokploy.yml"
COMPOSE_FE="${REPO_ROOT}/docker-compose.dokploy.frontend.yml"

section() { echo ""; echo "======== $1 ========"; }

section "Sistem"
uname -a
free -h 2>/dev/null | head -3 || true
df -h / /var/lib/docker 2>/dev/null | tail -5 || true

section "Docker"
docker info 2>/dev/null | grep -E 'Server Version|Operating System|Total Memory| CPUs' || docker version

section "Veri volume'ları (silinmemeli)"
docker volume ls | grep -E 'saas_postgres|pgadmin|wa_bridge|VOLUME' || true
if docker volume inspect saas_postgres_data >/dev/null 2>&1; then
  echo "OK: saas_postgres_data mevcut — tüm kiracı DB'leri bu volume içinde."
else
  echo "UYARI: saas_postgres_data YOK — veri başka yerde veya henüz kurulmamış."
fi

section "RetailEX konteynerleri"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'retailex|saas_|postgrest|NAMES' || echo "(retailex/saas yok)"

section "Compose durumu (tam stack)"
if [[ -f "${COMPOSE_FULL}" ]]; then
  docker compose -f "${COMPOSE_FULL}" ps 2>/dev/null || echo "compose ps başarısız — POSTGRES_PASSWORD veya dizin?"
else
  echo "Yok: ${COMPOSE_FULL}"
fi

section "Ağ berqenas_net"
docker network inspect berqenas_net --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null || echo "berqenas_net yok — tam stack hiç ayağa kalkmamış olabilir"

section "Yerel HTTP"
for url in \
  "http://127.0.0.1:8080/" \
  "http://127.0.0.1:8080/index.html" \
  "http://127.0.0.1:3001/api/status" \
  "http://127.0.0.1/health"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || echo "ERR")
  echo "$code  $url"
done

section "Son retailex_frontend log (40 satır)"
docker logs retailex_frontend --tail 40 2>&1 || echo "retailex_frontend yok"

section "Son deploy/build hatası ipucu"
docker events --since 30m --until 0s 2>/dev/null | grep -iE 'die|kill|oom|error|retailex' | tail -15 || echo "(events yok)"

section "Öneri"
echo "0) Sarı deploy → Dokploy Command: bash database/scripts/dokploy-deploy.sh (bkz. database/DOKPLOY_SARIDA_KALMA.md)"
echo "1) Frontend yok/Exited → POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-frontend.sh"
echo "2) Tam stack → POSTGRES_PASSWORD='...' bash database/scripts/dokploy-deploy.sh"
echo "3) Dokploy UI: Domain retailex.app → servis retailex_frontend, container port 80"
echo "4) Dış 404 + iç 200 → Dokploy Traefik domain eşlemesi bozuk"
section "Son OOM ipucu (kernel)"
dmesg -T 2>/dev/null | grep -iE 'oom|killed process' | tail -5 || journalctl -k --since '24 hours ago' 2>/dev/null | grep -i oom | tail -5 || echo "(oom kaydı yok veya yetki yok)"
