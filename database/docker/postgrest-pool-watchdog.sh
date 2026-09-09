#!/bin/sh
# PostgREST hasql havuzu sıkışınca (PGRST003) ilgili konteyneri yeniden başlatır.
# Compose servisi: postgrest_pool_watchdog (docker.sock + berqenas_net).
#
# Hedefler: "container_name|dns:port"
# dns = compose service adı (aynı Docker network).

set -eu

INTERVAL_SEC="${WATCHDOG_INTERVAL_SEC:-45}"
HTTP_TIMEOUT_SEC="${WATCHDOG_HTTP_TIMEOUT_SEC:-12}"
COOLDOWN_SEC="${WATCHDOG_COOLDOWN_SEC:-120}"

TARGETS="${WATCHDOG_TARGETS:-saas_postgrest_aqua_beauty|postgrest_aqua_beauty:3000}"

echo "[postgrest-pool-watchdog] start interval=${INTERVAL_SEC}s targets=${TARGETS}"

last_restart_epoch=0

http_body() {
  url="$1"
  # docker:cli alpine — wget var
  wget -qO- -T "${HTTP_TIMEOUT_SEC}" "http://${url}/" 2>/dev/null || echo "__FETCH_FAIL__"
}

while true; do
  OLD_IFS=$IFS
  IFS=' '
  # shellcheck disable=SC2086
  set -- $TARGETS
  IFS=$OLD_IFS

  for entry in "$@"; do
    name="${entry%%|*}"
    hostport="${entry#*|}"
    if [ "$name" = "$entry" ] || [ -z "$hostport" ]; then
      echo "[postgrest-pool-watchdog] skip bad target: $entry"
      continue
    fi

    body="$(http_body "$hostport")"
    now="$(date -u +%s 2>/dev/null || echo 0)"

    if echo "$body" | grep -q 'PGRST003'; then
      delta=$((now - last_restart_epoch))
      if [ "$delta" -lt "$COOLDOWN_SEC" ]; then
        echo "[postgrest-pool-watchdog] $(date -u +%Y-%m-%dT%H:%M:%SZ) PGRST003 ${name} — cooldown (${delta}s < ${COOLDOWN_SEC}s)"
      else
        echo "[postgrest-pool-watchdog] $(date -u +%Y-%m-%dT%H:%M:%SZ) PGRST003 ${name} — docker restart"
        if docker restart "$name"; then
          last_restart_epoch="$now"
          echo "[postgrest-pool-watchdog] restarted ${name}"
        else
          echo "[postgrest-pool-watchdog] restart FAILED ${name}"
        fi
      fi
    elif echo "$body" | grep -q '__FETCH_FAIL__'; then
      echo "[postgrest-pool-watchdog] $(date -u +%Y-%m-%dT%H:%M:%SZ) unreachable ${hostport} (container ${name})"
    fi
  done

  sleep "${INTERVAL_SEC}"
done
