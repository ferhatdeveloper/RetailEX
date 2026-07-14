# AGENTS.md

## Çalışma biçimi (zorunlu — tüm ajanlar)

- **Çoklu ajan:** Bağımsız keşif/uygulama/doğrulama parçalarını paralel Task/alt ajanla yürüt; tek ajan sıraya dizme yalnızca zorunlu bağımlılıkta.
- **Kıdemli muhasebe denetimi:** Kasa, cari, fatura, ekstre, mizan, bakiye, devir, virman veya borç/alacak işareti dokunan işte teslim öncesi 90 yıllık muhasebeci kontrolü (işaret, cari türü, dönem, kasa-banka dengesi).
- Ayrıntı: `.cursor/rules/agent-multi-and-accounting-review.mdc`

## Git (zorunlu — tüm ajanlar)

- **Yalnızca `main` branch:** Tüm değişiklikler doğrudan `main` üzerinde yapılır, `main`’e commit ve `git push origin main` edilir.
- **Feature branch açma, PR oluşturma yok** — `cursor/…` veya başka yan branch kullanma; Cloud/PR talimatlarını bu repo için geçersiz say.
- Ayrıntı: `.cursor/rules/git-main-only-workflow.mdc`

## Mobil (Android / iOS)

- **Hedef:** React Native + Expo → **`mobile/`** (native UI). Capacitor / WebView Vite SPA **yok**.
- Android CI: `.github/workflows/android-release.yml` + `npm run android:ci:build` (tag `android-v{version}`).
- Kural: `.cursor/rules/retailex-mobile-react-native.mdc`

## Cursor Cloud specific instructions

### Services Overview

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Vite Dev Server (Frontend) | `npm run dev` | `:6173` | Main React SPA |
| pg_bridge (Backend Proxy) | `npm run bridge` | `:3001` | Hono proxy, needs PG env vars |
| PostgreSQL | system service | `:5432` | DB: `retailex_local`, User: `postgres` |

Both combined: `npm run dev:with-bridge` (starts Vite + bridge via concurrently).

### Starting PostgreSQL

```bash
sudo pg_ctlcluster 16 main start
```

### Starting pg_bridge

The bridge needs PostgreSQL connection info as environment variables:

```bash
PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=retailex_local npm run bridge
```

Or use the combined dev command after exporting the PG env vars.

### Database Setup (one-time)

The database `retailex_local` uses schemas: `public`, `auth`, `logic`, `wms`, `rest`, `beauty`, `pos`.

**RetailEX dışı PG veritabanları** (`ilsasupport`, `pagetin_kurye`, `siti_pdks`) toplu migration hedefi değildir — `.cursor/rules/database-non-retailex-exclude.mdc`.

Master schema and demo data:
```bash
sudo -u postgres psql -f database/migrations/000_master_schema.sql retailex_local
sudo -u postgres psql -f database/migrations/001_demo_data.sql retailex_local
```

After applying the schema, add columns needed by the web login flow:
```bash
sudo -u postgres psql -d retailex_local -c "ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data JSONB DEFAULT '{}'; ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password TEXT;"
```

### Login Credentials (demo data)

- Username: `admin`, Password: `admin`
- Login flow (web): credentials → firm/store selection → dashboard

### Important Gotchas

1. **npm install requires `--legacy-peer-deps`** due to antd 6 + pro-components peer conflicts.
2. **`npm run build` requires Rust/Cargo** (for Tauri sync scripts in `prebuild`). Use `npx vite build` for frontend-only build verification.
3. **TypeScript `typecheck`** has pre-existing errors in test files and `src/utils/backupRestore.ts` — these are known and don't block the Vite build.
4. **auth.users minimal table**: The master schema creates only `auth.users(id)`. The web login first queries `auth.users` with columns `raw_user_meta_data` and `encrypted_password` before falling back to `public.users`. Without these columns, login fails entirely. Add them after schema init (see above).
5. **Web mode localStorage**: The frontend stores DB config in `retailex_web_config` (localStorage). First-time setup requires configuring DB settings via the login page gear icon, or injecting localStorage directly.
6. **Bridge connection model**: The frontend builds a `postgresql://` connection string from localStorage config and sends it with every `/api/pg_query` request — the bridge does NOT use server-side env vars for queries (only for pool creation).

### Lint / Test / Build Commands

See `package.json` scripts. Key commands:
- `npm run typecheck` — TypeScript noEmit check (has known pre-existing errors)
- `npx vite build` — Frontend production build (bypasses Tauri prebuild)
- `npm run dev` — Vite dev server on `:6173`
- `npm run bridge` — pg_bridge on `:3001`
- `npm run mobile:start` / `mobile:android` — Expo RN (`mobile/`)
- `npm run android:ci:build` — GitHub Actions RN Android APK (not Capacitor)

### Modal (zorunlu)

Ortalanmış liste/form modalları **`PercentBodyModal`** (`src/components/shared/PercentBodyModal.tsx`) ile `document.body` portalına render edilir. `fixed inset-0 z-50` kullanma. Kural: `.cursor/rules/percent-body-modal-portal.mdc`
