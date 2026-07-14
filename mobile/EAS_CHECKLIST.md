# RetailEX Mobile — EAS Production Hazırlık

> Store / dahili imzalı dağıtım için Expo Application Services.  
> Günlük debug APK: GitHub Actions (`npm run android:ci:build`) — EAS zorunlu değil.

## Durum özeti

| Sembol | Anlam |
|--------|--------|
| `[x]` | Repo içinde hazır (dosya / script / doküman) |
| `[ ]` | İnsan + Expo hesabı adımı (henüz yapılmadı) |

**Son güncelleme:** 2026-07-14

---

## Yapılandırma (repo) — `[x]`

- [x] `mobile/eas.json` — `debug` | `preview` | `production` profilleri
- [x] `cli.appVersionSource: "local"` — semver kök `package.json`
- [x] `mobile/app.json` — `slug`, `package`, `bundleIdentifier`, izinler, native plugin'ler
- [x] `extra.retailexEasNotes` — `projectId` uydurulmaz; `eas init` notları
- [x] `scripts/sync-mobile-version.mjs` — `version` + `versionCode` / `buildNumber`
- [x] `scripts/eas-mobile-check.mjs` — hazırlık doğrulama
- [x] `scripts/eas-mobile-init.mjs` — `eas init` sarmalayıcı
- [x] `scripts/eas-mobile-build.mjs` — sync + `eas build`
- [x] Kök npm scriptleri (`mobile:eas:*`)
- [x] `mobile/README.md` → [EAS Build](./README.md#eas-build)

---

## Expo hesabı (bir kez) — `[ ]`

- [ ] [expo.dev](https://expo.dev) hesabı
- [ ] `npx eas-cli@latest login` (veya `EXPO_TOKEN` — CI/headless)
- [ ] `npm run mobile:eas:init` → `app.json` → `extra.eas.projectId` yazılır
- [ ] `npm run mobile:eas:check` → `extra.eas.projectId` satırı `[x]`

`projectId` **elle / rastgele UUID ile eklenmez**; yalnızca `eas init` yazar.

---

## İlk bulut derlemeler — `[ ]`

| Profil | Komut | Çıktı | Ne zaman |
|--------|--------|-------|----------|
| `debug` | `npm run mobile:eas:debug` | Debug APK | CI benzeri; credentials yok |
| `preview` | `npm run mobile:eas:preview` | İmzalı dahili APK | Paylaşılabilir test |
| `production` | `npm run mobile:eas:production` | Play **AAB** | Store yükleme |

iOS: `--platform ios` (Mac gerekmez — EAS bulutta); Apple Developer + credentials.

---

## Store submit (production sonrası) — `[ ]`

- [ ] Google Play Console uygulama kaydı (`app.retailex.mobile`)
- [ ] EAS Android credentials (keystore — ilk `preview`/`production` build'de oluşturulur)
- [ ] `eas submit -p android --profile production` (veya Play Console manuel AAB)
- [ ] iOS: App Store Connect + `eas submit -p ios` (ileride)

`eas.json` → `submit.production.android.track: internal` (ilk yükleme internal test).

---

## CI notu

`android-release.yml` **EAS kullanmaz** (yerel `expo prebuild` + `assembleDebug`).  
EAS'i Actions'tan tetiklemek için ayrı workflow + `EXPO_TOKEN` secret gerekir — bu checklist kapsamı dışı.

---

## Hızlı komutlar

```bash
npm run mobile:sync-version      # sürüm hizala (build öncesi)
npm run mobile:eas:check         # hazırlık tablosu
npm run mobile:eas:init          # Expo projesi bağla (interaktif)
npm run mobile:eas:preview       # ilk imzalı APK
npm run mobile:eas:production    # Play AAB
```

Doğrulama çıktısı örneği: `npm run mobile:eas:check`
