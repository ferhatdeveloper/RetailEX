# RetailEX Mobile — EAS Production Hazırlık

> Store / dahili imzalı dağıtım için Expo Application Services.  
> Günlük debug APK: GitHub Actions (`npm run android:ci:build`) — EAS zorunlu değil.

## Durum özeti

| Sembol | Anlam |
|--------|--------|
| `[x]` | Repo içinde hazır (dosya / script / doküman) — ajan/otomasyon |
| `[ ]` | **Kullanıcı** adımı (hesap, login, Play Console, secret) |

**Son güncelleme:** 2026-07-14  
**`eas whoami` (bu ortam):** Not logged in → aşağıdaki **Kullanıcı: Expo login** zorunlu.

---

## Otomatik / repo hazırlığı — `[x]`

- [x] `mobile/eas.json` — `debug` \| `preview` \| `production` + `submit.production.android.track: internal`
- [x] `cli.appVersionSource: "local"` — semver kök `package.json`
- [x] `mobile/app.json` — `slug`, `package` (`app.retailex.mobile`), `bundleIdentifier`, izinler, native plugin'ler
- [x] `extra.retailexEasNotes` — `projectId` uydurulmaz; bağlanana kadar `extra.eas` yok
- [x] `scripts/sync-mobile-version.mjs` — `version` + `versionCode` / `buildNumber`
- [x] `scripts/eas-mobile-check.mjs` — hazırlık + `whoami` kontrolü
- [x] `scripts/eas-mobile-init.mjs` — login kapısı + `eas init` (`--non-interactive` destekli)
- [x] `scripts/eas-mobile-build.mjs` — sync + `eas build --non-interactive`
- [x] Kök npm scriptleri (`mobile:eas:*`)
- [x] `mobile/README.md` → [EAS Build](./README.md#eas-build)
- [x] `.gitignore` — Google Play service account JSON / `mobile/secrets/` (commit yasak)
- [x] `scripts/eas-mobile-submit.mjs` + `npm run mobile:eas:submit`
- [x] İsteğe bağlı Actions: `.github/workflows/android-play-submit.yml` (manuel tetik; secret gerekir)
- [x] `mobile/PLAY_SUBMIT.md` — Play submit ayrıntı

---

## Kullanıcı: Expo login — `[ ]` (otomatik edilemez)

Bu adım **hesap bilgisi / tarayıcı** istediği için ajan ortamında yapılamaz.

| # | Komut / işlem | Not |
|---|----------------|-----|
| 1 | [expo.dev](https://expo.dev) hesabı | Ücretsiz kayıt |
| 2 | `npx eas-cli@latest login` | Yerel oturum |
| 2b | veya `EXPO_TOKEN` | CI/headless — Account → Access Tokens |
| 3 | `npx eas-cli@latest whoami` | Kullanıcı adını yazmalı (şu an: Not logged in) |
| 4 | `npm run mobile:eas:init` | `app.json` → `extra.eas.projectId` yazar |
| 4b | Headless: `npm run mobile:eas:init -- --non-interactive` | İsteğe `--force` veya `--id <uuid>` |
| 5 | `npm run mobile:eas:check` | `extra.eas.projectId` + whoami `[x]` olmalı |

`projectId` **elle / rastgele UUID ile eklenmez**; yalnızca `eas init` yazar.

### `eas init` non-interactive (resmi)

```bash
# Login veya EXPO_TOKEN zorunlu
npx eas-cli@latest init --non-interactive
npx eas-cli@latest init --id <EXISTING_PROJECT_UUID> --non-interactive
npx eas-cli@latest init --non-interactive --force   # yeni proje / prompt atlama

# Kök sarmalayıcı (önce whoami; login yoksa durur)
npm run mobile:eas:init -- --non-interactive
npm run mobile:eas:init -- --non-interactive --force
```

Referans: [EAS CLI — eas init](https://docs.expo.dev/eas/cli/#eas-init), [Programmatic access](https://docs.expo.dev/accounts/programmatic-access/).

---

## İlk bulut derlemeler — `[ ]` (login + projectId sonrası)

| Profil | Komut | Çıktı | Ne zaman |
|--------|--------|-------|----------|
| `debug` | `npm run mobile:eas:debug` | Debug APK | CI benzeri; credentials yok |
| `preview` | `npm run mobile:eas:preview` | İmzalı dahili APK | Paylaşılabilir test |
| `production` | `npm run mobile:eas:production` | Play **AAB** | Store yükleme |

iOS: `--platform ios` (Mac gerekmez — EAS bulutta); Apple Developer + credentials.

---

## Store submit (production sonrası) — `[ ]`

- [ ] Google Play Console uygulama kaydı (`app.retailex.mobile`)
- [ ] İlk AAB'yi Play'e **manuel** bir kez yükle (Play API kısıtı)
- [ ] EAS Android credentials (keystore — ilk `preview`/`production` build'de)
- [ ] Google Service Account JSON → EAS Credentials'a yükle **veya** yerel yol (aşağıdaki secret; **asla commit etme**)
- [ ] `eas submit -p android --profile production` (veya Play Console manuel AAB)
- [ ] iOS: App Store Connect + `eas submit -p ios` (ileride)

`eas.json` → `submit.production.android.track: internal` (ilk yükleme internal test).

---

## GitHub Actions (opsiyonel) — secrets; JSON commit yok

`android-release.yml` **EAS kullanmaz** (debug APK). Play submit:

**Dosya:** `.github/workflows/android-play-submit.yml` → Actions → **Android Play Submit** (`workflow_dispatch`)

### Repo secrets (Settings → Secrets and variables → Actions)

| Secret adı | İçerik | Commit? |
|------------|--------|---------|
| `EXPO_TOKEN` | Expo access token | **Hayır** — yalnızca GitHub secret |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Play service account **JSON metni** (tercih) | **Hayır** — dosyayı asla git'e ekleme |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Aynı JSON (eski/alias ad) | **Hayır** |

Workflow JSON'u `mobile/secrets/google-play-service-account.json` geçici yazar (gitignore), submit sonrası siler — **artifact yok**.

Tercih: JSON'u Expo **Credentials**'a yükle → CI'de yalnızca `EXPO_TOKEN` yeter. Yerel: `mobile/secrets/` + `npm run mobile:eas:submit`. Ayrıntı: [`PLAY_SUBMIT.md`](./PLAY_SUBMIT.md).

---

## Hızlı komutlar

```bash
npm run mobile:sync-version      # sürüm hizala (build öncesi)
npm run mobile:eas:check         # hazırlık tablosu (+ whoami)
npx eas-cli@latest login         # KULLANICI
npm run mobile:eas:init          # Expo projesi bağla
npm run mobile:eas:preview       # ilk imzalı APK
npm run mobile:eas:production    # Play AAB
```

Doğrulama: `npm run mobile:eas:check`
