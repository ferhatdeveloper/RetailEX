# Dokploy — sarıda kalma (deploy takılması)

## Belirti

- Dokploy deploy **sarı** (Running) kalır, 10–30+ dk biter gibi olmaz
- Log son satır: `rendering chunks...` (Vite frontend build)
- Veya log kesilir, sonunda `Killed` / `OOM` / exit 137

## Kök neden

Dokploy varsayılan komutu:

```bash
docker compose -p app-retailex-hfdrtt -f docker-compose.dokploy.yml up -d --build --remove-orphans
```

Bu komut **16 sync + bridge + whatsapp + frontend** imajını aynı deploy’da build etmeye çalışır. Frontend Vite build’i (`rendering chunks`) **2–4 GB RAM** ister; küçük VPS’te OOM veya saatlerce bekleme olur. Dokploy işlem bitene kadar **sarı** gösterir.

**Veritabanı verisi bu süreçte silinmez** — sorun build, volume değil.

---

## Kalıcı çözüm (Dokploy UI)

1. Dokploy → **app-retailex-hfdrtt** → Compose ayarları
2. **Command** / **Custom Deploy Command** alanını değiştirin:

```bash
bash database/scripts/dokploy-deploy.sh
```

3. **Environment / Secrets** (değişmeden):
   - `POSTGRES_PASSWORD` = mevcut şifre (volume ile aynı)
   - İsteğe: `COMPOSE_PROJECT_NAME=app-retailex-hfdrtt` (Dokploy zaten verebilir)

4. **Redeploy** — artık:
   - 16 sync rebuild **atlanır** (mevcut `retailex-sync-service:latest`)
   - Sadece **frontend + bridge + whatsapp** build edilir (sırayla, `COMPOSE_PARALLEL_LIMIT=1`)
   - Stack `up -d --no-build` ile ayağa kalkar
   - Düşük RAM’de sync konteynerleri build öncesi geçici durdurulur (`DOKPLOY_PAUSE_SYNC=1`, varsayılan)

---

## Takılı deploy varken (VM terminal)

```bash
cd /etc/dokploy/compose/app-retailex-hfdrtt/code
git pull origin main

# Teşhis
bash database/scripts/dokploy-diagnose.sh

# Güvenli deploy (veri korunur)
POSTGRES_PASSWORD='MEVCUT_SIFRE' bash database/scripts/dokploy-deploy.sh
```

Sadece arayüz güncellemesi:

```bash
POSTGRES_PASSWORD='MEVCUT_SIFRE' bash database/scripts/dokploy-redeploy-frontend.sh
```

---

## Log kontrol listesi

| Log | Anlam |
|-----|--------|
| `rendering chunks...` + uzun sessizlik | Normal ama ağır; 5–10 dk bekleyin veya `dokploy-deploy.sh` kullanın |
| `Killed` / `signal 9` / exit **137** | OOM — `dokploy-deploy.sh` + swap veya daha büyük RAM |
| `npm ERR!` / Vite hata | Build hatası; tam log satırını inceleyin |
| Deploy bitti ama `https://retailex.app` **404** | Traefik domain eşlemesi — Dokploy Domains → `retailex_frontend:80` |
| `127.0.0.1:8080` **200**, dış **404** | Domain routing sorunu (uygulama ayakta) |

OOM sonrası kernel log:

```bash
dmesg -T | tail -30 | grep -iE 'oom|kill|memory' || journalctl -k --since '1 hour ago' | grep -i oom
```

---

## Sync imajını yeniden build (nadiren)

Rust sync kodu değiştiyse:

```bash
POSTGRES_PASSWORD='...' bash database/scripts/dokploy-redeploy-sync.sh
```

---

## ASLA

- `docker compose down -v` — **tüm DB verisi gider**
- Dokploy **Delete volumes**
- Her UI fix için tam stack `--build` redeploy

Ayrıntı: `database/DOKPLOY_VERI_GUVENLIGI.md`
