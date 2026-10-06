#!/bin/bash
# RetailEX local stack starter — vite dev + cloudflared tunnel
# Her servis kendi sürecinde çalışır, terminal kapansa bile yaşar.

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOG="$ROOT/logs"
mkdir -p "$LOG"

pkill -f "vite" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# Vite (background, detached — setsid yok macOS'ta, nohup+&+disown yeterli)
nohup npx vite --host 0.0.0.0 --port 6173 > "$LOG/vite.log" 2>&1 < /dev/null &
VITE_PID=$!
disown $VITE_PID 2>/dev/null || true
echo "[start] vite PID=$VITE_PID"

# Cloudflared quick tunnel (background, detached)
nohup cloudflared tunnel --no-autoupdate --url http://localhost:6173 > "$LOG/tunnel.log" 2>&1 < /dev/null &
TUNNEL_PID=$!
disown $TUNNEL_PID 2>/dev/null || true
echo "[start] cloudflared PID=$TUNNEL_PID"

# 6 sn bekle, sonra durum yazdır
sleep 6
echo "---- vite.log (son 10) ----"
tail -10 "$LOG/vite.log"
echo "---- tunnel.log (URL) ----"
grep -E "trycloudflare.com" "$LOG/tunnel.log" | head -3
echo "---- port dinleme ----"
lsof -nP -iTCP:6173 -sTCP:LISTEN 2>/dev/null | tail -1 || echo "6173 dinlenmiyor"
echo "[start] tamamlandı. Public URL'i yukarıdaki tunnel.log'tan al."
