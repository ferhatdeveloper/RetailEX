# RetailEX Production Deployment & Domain Guide (Berqenas Cloud)

Bu dosya, RetailEX Web uygulamasını **Berqenas Cloud** (Ubuntu VPS) altyapısına kurmak ve `retailex.app` alan adına bağlamak için gerekli tüm teknik adımları içerir. Bu işlemi daha sonra yapabilmeniz için proje kök dizinine kaydedilmiştir.

---

## 1. Mimari Genel Bakış
Uygulama, mevcut Berqenas Cloud Docker ağına (`berqenas_net`) entegre olur.
- **Frontend**: Nginx (Docker: 172.20.0.50)
- **Bridge Service**: Node.js executable (Docker: 172.20.0.51)
- **Database**: Mevcut Postgres 17 (172.20.0.10 / `retailex_db`)

### GitHub → VPS (önerilen akış)

Kodu USB ile taşımak yerine repoyu GitHub’da tutup sunucuda **clone + build** yapabilirsiniz.

1. Projeyi GitHub’a push edin (mümkünse **private** repo; `.env`, `config.db`, şifre commit etmeyin).
2. VPS’te (Docker kurulu; örn. `/opt/berqenas-cloud/projects`):

```bash
sudo apt update && sudo apt install -y git
sudo mkdir -p /opt/berqenas-cloud/projects
cd /opt/berqenas-cloud/projects
git clone https://github.com/KULLANICI/RetailEX.git retailex
cd retailex
git checkout main   # veya kullandığınız dal

docker build -f Dockerfile.frontend -t retailex-web .
docker rm -f retailex_frontend 2>/dev/null || true
docker run -d --name retailex_frontend -p 8080:80 --restart always retailex-web
```

- **Private repo:** SSH ile `git clone git@github.com:KULLANICI/RetailEX.git` (sunucuda `~/.ssh` anahtarı) veya HTTPS + Personal Access Token.
- **Güncelleme:** `cd /opt/berqenas-cloud/projects/retailex && git pull && docker build -f Dockerfile.frontend -t retailex-web .` ardından konteyneri yeniden oluşturun (`docker rm -f retailex_frontend` + `docker run ...` yukarıdaki gibi).

`pg_bridge` için aynı klasörde `Dockerfile.bridge` ile benzer şekilde imaj üretip compose’a ekleyebilirsiniz (aşağıdaki §3).

---

## 2. Docker Dosyaları (Proje Kök Dizini)

### 📦 `Dockerfile.frontend` (proje kökünde)

Vite çıktı klasörü **`build/`** (Vite `outDir`). Statik dosyalar için Nginx SPA yönlendirmesi `docker/nginx.frontend.conf` içindedir.

```bash
docker build -f Dockerfile.frontend -t retailex-web .
```

İçerik özeti: `npm ci` → `npm run build` → `build/` → Nginx `80`.

### 🌉 `Dockerfile.bridge`
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npx", "tsx", "src/services/pg_bridge.ts"]
```

---

## 3. `docker-compose.yml` Entegrasyonu
Mevcut `/opt/berqenas-cloud/docker-compose.yml` dosyanızın `services` bölümüne şunları ekleyin:

```yaml
  retailex_web:
    build:
      context: /opt/berqenas-cloud/projects/retailex # Proje klasörü
      dockerfile: Dockerfile.frontend
    container_name: retailex_frontend
    restart: always
    ports:
      - "8080:80"
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.50

  retailex_bridge:
    build:
      context: /opt/berqenas-cloud/projects/retailex
      dockerfile: Dockerfile.bridge
    container_name: retailex_bridge
    restart: always
    ports:
      - "3001:3001"
    networks:
      berqenas_net:
        ipv4_address: 172.20.0.51
    depends_on:
      - postgres
```

---

## 4. `retailex.app` SSL & Reverse Proxy

Sunucudaki ana Nginx üzerinde şu ayarları yapın:

### 🌐 `/etc/nginx/sites-available/retailex.app`
```nginx
server {
    server_name retailex.app;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    listen 80;
}
```

### 🔐 SSL Sertifikası
```bash
sudo certbot --nginx -d retailex.app
```

---

## 5. Veritabanı Bilgileri (Prod)
- **Host**: `172.20.0.10`
- **Database**: `retailex_db`
- **Username**: `postgres`
- **Password**: `root_password_2026`

---

> [!NOTE]
> Bu rehberdeki IP adresleri ve yapılandırmalar sizin paylaştığınız "Master" kurulum scripti ile birebir uyumludur. Docker imajlarını build ettikten sonra sisteminiz her yerden güvenli bir şekilde erişilebilir hale gelecektir.
