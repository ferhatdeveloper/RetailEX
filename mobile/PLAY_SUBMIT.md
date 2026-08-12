# RetailEX Mobile — Google Play Submit (EAS)

> Production **AAB** sonrası Play Console **internal** track’e yükleme.  
> Debug APK CI (`android-release.yml`) bu akışın parçası değildir.

**Paket:** `app.retailex.mobile` · **Track:** `internal` (`mobile/eas.json` → `submit.production`)

---

## Özet akış

```text
1) Play Console uygulama + ilk AAB manuel yükleme (Google API zorunluluğu)
2) Google Cloud service account + Play API erişimi
3) JSON anahtarı → EAS Credentials (tercih) veya yerel secrets/ (gitignore)
4) npm run mobile:eas:production   → AAB
5) npm run mobile:eas:submit       → eas submit --profile production
   veya Actions: "Android Play Submit"
```

---

## Secrets — asla commit etme

| Secret / dosya | Nerede | Amaç |
|----------------|--------|------|
| **Google Service Account JSON** | Yerel: `mobile/secrets/google-play-service-account.json` (**gitignore**) · veya Expo dashboard → Credentials · veya GitHub Actions secret | Play Developer API auth |
| `EXPO_TOKEN` | GitHub Actions / CI ortamı · isteğe bağlı `mobile/.env` | Headless `eas submit` / `eas build` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Yalnızca GitHub Actions secret (dosyanın **içeriği**; tercih) | CI’de geçici dosya; commit/artifact yok |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Aynı içerik (alias / eski ad) | CI’de geçici dosya; commit/artifact yok |

### Yasak

- Service account **`.json` dosyasını** veya içeriğini repo’ya ekleme
- `eas.json` içine gerçek anahtar metni veya kalıcı `serviceAccountKeyPath` ile gizlilikli path commit etme (script gerekirse **geçici** path yazar, sonra geri alır)
- PR / commit / chat’e JSON içeriği kopyalama

### İzin verilen yollar

1. **Tercih — EAS uzaktan credentials (CI için önerilen)**  
   Expo proje → **Credentials** → Android → **Google Service Account Key** yükle  
   veya: `cd mobile && npx eas-cli@latest credentials -p android`  
   Non-interactive `eas submit` bu anahtarı kullanır; yerelde JSON gerekmez.  
   (`--non-interactive` iken key yoksa submit başarısız olur — önce dashboard’a yükleyin.)

2. **Yerel dosya (gitignore)**  
   Anahtarı şuraya koy: `mobile/secrets/google-play-service-account.json`  
   `npm run mobile:eas:submit` → script geçici olarak `eas.json` → `serviceAccountKeyPath` ayarlar, submit bitince dosyayı eski haline getirir.

3. **GitHub Actions**  
   Repo → **Settings → Secrets and variables → Actions**:

   | Secret adı | Değer |
   |------------|--------|
   | `EXPO_TOKEN` | [expo.dev → Access tokens](https://expo.dev/settings/access-tokens) |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON **tam metni** (tercih; isteğe bağlı — EAS Credentials varsa atlayın) |
   | `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Aynı JSON (alias) |

   Workflow key’i diske yazar, submit eder, dosyayı siler; artifact olarak **yüklemez**.

Örnek JSON yolu kalıbı: [`secrets/README.md`](./secrets/README.md).

---

## Play Console önkoşulları

1. [Google Play Developer](https://play.google.com/console) hesabı  
2. Uygulama oluştur: package = `app.retailex.mobile`  
3. Google Cloud’da service account + JSON key; Play Console’da **Users and permissions** ile API erişimi (en az Release / app editing)  
4. Rehber: [Uploading a Google Service Account Key](https://docs.expo.dev/submit/android/#eas-cli)  
5. **İlk AAB’yi en az bir kez manuel yükle** (Play API sınırlaması) — sonra `eas submit` kullanılabilir  
6. EAS production build: `npm run mobile:eas:production` (önce `mobile:eas:init` + credentials)

---

## Yerel komutlar

```bash
# Hazırlık
npm run mobile:eas:check
npm run mobile:sync-version

# AAB
npm run mobile:eas:production

# Son başarılı Android production build → internal track
npm run mobile:eas:submit

# Belirli build / yerel AAB / dry-run
node scripts/eas-mobile-submit.mjs --latest
node scripts/eas-mobile-submit.mjs --id <EAS_BUILD_UUID>
node scripts/eas-mobile-submit.mjs --path path/to/app.aab
node scripts/eas-mobile-submit.mjs --dry-run
```

Eşdeğer CLI:

```bash
cd mobile
npx eas-cli@latest submit -p android --profile production --latest --non-interactive
```

`eas.json`:

```json
"submit": {
  "production": {
    "android": {
      "track": "internal"
    }
  }
}
```

Track değiştirmek (alpha/beta/production) için profili güncelle veya ayrı submit profili ekle; ilk yüklemelerde **internal** bırakın.

---

## GitHub Actions — Android Play Submit

| | |
|--|--|
| Workflow | [`.github/workflows/android-play-submit.yml`](../.github/workflows/android-play-submit.yml) |
| Tetikleme | Actions → **Android Play Submit** → Run workflow (`workflow_dispatch`) |
| Girdiler | `build_id` (boş = `--latest`), `profile` (varsayılan `production`), `dry_run` |
| Zorunlu secret | `EXPO_TOKEN` |
| İsteğe bağlı | `GOOGLE_SERVICE_ACCOUNT_JSON` (veya alias `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`; EAS’te key yoksa) |

`android-release.yml` (debug APK) Play submit yapmaz. Store AAB + submit = EAS.

---

## Checklist

- [ ] Play Console app + package `app.retailex.mobile`
- [ ] Service account + Play API yetkisi
- [ ] JSON **commit edilmedi**; EAS Credentials veya `mobile/secrets/` + gitignore
- [ ] İlk AAB manuel yüklendi
- [ ] `extra.eas.projectId` var (`npm run mobile:eas:init`)
- [ ] `npm run mobile:eas:production` başarılı
- [ ] `EXPO_TOKEN` (CI) veya `eas login` (yerel)
- [ ] `npm run mobile:eas:submit` veya **Android Play Submit** workflow
- [ ] Play Console → Testing → Internal testing’de sürüm görünüyor

---

## İlgili

- [`EAS_CHECKLIST.md`](./EAS_CHECKLIST.md) — EAS build hazırlık  
- [`README.md`](./README.md#eas-build) — CI vs EAS  
- [Expo — Submit Android](https://docs.expo.dev/submit/android/)  
- [Expo — eas.json submit](https://docs.expo.dev/submit/eas-json/)
