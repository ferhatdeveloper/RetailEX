#!/usr/bin/env bash
# Dokploy ana deploy — sarıda takılmayı önler (16 sync + frontend paralel --build YAPMAZ).
#
# Sorun: Dokploy varsayılanı
#   docker compose ... up -d --build
# → 16 sync + bridge + frontend aynı anda build; Vite "rendering chunks" aşamasında OOM / saatlerce sarı.
#
# Çözüm: yalnız gerekli imajları sırayla build, tam stack'i --no-build ile ayağa kaldır.
# Veri: saas_postgres_data volume'a dokunmaz; down -v kullanılmaz.
#
# Dokploy UI → Compose → Command (veya Custom Deploy Command):
#   bash database/scripts/dokploy-deploy.sh
#
# Ortam (Dokploy Secrets): POSTGRES_PASSWORD zorunlu
#   COMPOSE_PROJECT_NAME (Dokploy genelde verir, yoksa app-retailex-hfdrtt)
#   DOKPLOY_PAUSE_SYNC=1  — build öncesi sync konteynerlerini geçici durdur (düşük RAM VPS, varsayılan 1)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="${REPO_ROOT}/docker-compose.dokploy.yml"
FE_COMPOSE="${REPO_ROOT}/docker-compose.dokploy.frontend.yml"

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD gerekli (Dokploy secret)}"
export POSTGRES_PASSWORD

if [[ -z "${COMPOSE_PROJECT_NAME:-}" ]] && [[ "$REPO_ROOT" =~ /compose/([^/]+)/code ]]; then
  COMPOSE_PROJECT_NAME="${BASH_REMATCH[1]}"
fi
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-app-retailex-hfdrtt}"
export COMPOSE_PROJECT_NAME

export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-1}"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
export BUILDKIT_PROGRESS="${BUILDKIT_PROGRESS:-plain}"

DOKPLOY_PAUSE_SYNC="${DOKPLOY_PAUSE_SYNC:-1}"

compose() {
  docker compose -p "${COMPOSE_PROJECT_NAME}" "$@"
}

cd "${REPO_ROOT}"

section() { echo ""; echo "======== $1 ========"; }

section "RetailEX Dokploy deploy (proje: ${COMPOSE_PROJECT_NAME})"
echo "RAM: $(free -h 2>/dev/null | awk '/Mem:/{print $3"/"$2}' || echo '?')"
echo "Disk: $(df -h /var/lib/docker 2>/dev/null | awk 'NR==2{print $3"/"$2" ("$5")"}' || df -h / | awk 'NR==2{print $3"/"$2}')"

if docker volume inspect saas_postgres_data >/dev/null 2>&1; then
  echo "Veri volume: saas_postgres_data (korunuyor)"
else
  echo "UYARI: saas_postgres_data yok — ilk kurulum olabilir"
fi

# Sync imajı yoksa bir kez üret (tüm sync_* servisleri aynı image tag)
if ! docker image inspect retailex-sync-service:latest >/dev/null 2>&1; then
  section "Sync imajı yok — tek seferlik build (sync_lovan)"
  compose -f "${COMPOSE}" build sync_lovan
else
  echo "Sync imajı mevcut: retailex-sync-service:latest (16 servis rebuild atlandı)"
fi

SYNC_STOPPED=()
if [[ "${DOKPLOY_PAUSE_SYNC}" == "1" ]]; then
  section "RAM: sync konteynerleri geçici durduruluyor (build sonrası up -d ile döner)"
  while IFS= read -r id; do
    [[ -n "$id" ]] && SYNC_STOPPED+=("$id")
  done < <(docker ps -q --filter 'name=sync_' 2>/dev/null || true)
  if ((${#SYNC_STOPPED[@]} > 0)); then
    docker stop "${SYNC_STOPPED[@]}" >/dev/null 2>&1 || true
    echo "Durduruldu: ${#SYNC_STOPPED[@]} sync konteyneri"
  else
    echo "Çalışan sync konteyneri yok"
  fi
fi

section "Build: frontend (+ köprüler, sync HARİÇ)"
compose -f "${COMPOSE}" build retailex_frontend retailex_bridge retailex_whatsapp_bridge

section "Stack: up -d --no-build (veri volume aynı)"
compose -f "${COMPOSE}" up -d --remove-orphans --no-build

section "Postgres hazır mı?"
for i in $(seq 1 24); do
  if compose -f "${COMPOSE}" exec -T postgres pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    echo "Postgres OK"
    break
  fi
  sleep 5
  if [[ "$i" -eq 24 ]]; then
    echo "UYARI: Postgres pg_isready zaman aşımı — log: docker logs saas_postgres --tail 30"
  fi
done

section "Frontend HTTP"
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${RETAILEX_WEB_PORT:-8080}/" 2>/dev/null || echo "ERR")
echo "127.0.0.1:${RETAILEX_WEB_PORT:-8080} → HTTP ${code}"

section "Konteyner özeti"
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'retailex|saas_postgres|postgrest|NAMES' || true

echo ""
echo "=== Deploy tamamlandı ==="
echo "Dış 404 ise Dokploy → Domains → retailex.app → retailex_frontend:80"
echo "Yalnız UI: POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-frontend.sh"
