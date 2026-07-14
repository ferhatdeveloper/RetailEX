#!/usr/bin/env node
/**
 * EAS production hazırlık doğrulaması (build tetiklemez).
 *
 *   npm run mobile:eas:check
 *   node scripts/eas-mobile-check.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mobileDir = join(root, 'mobile');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const checks = [];

function add(id, label, ok, detail = '') {
  checks.push({ id, label, ok, detail });
}

// eas.json
const easPath = join(mobileDir, 'eas.json');
if (existsSync(easPath)) {
  const eas = readJson(easPath);
  for (const profile of ['debug', 'preview', 'production']) {
    add(
      `eas-profile-${profile}`,
      `eas.json → build.${profile}`,
      Boolean(eas.build?.[profile]),
    );
  }
  add(
    'eas-app-version-source',
    'eas.json → cli.appVersionSource = local',
    eas.cli?.appVersionSource === 'local',
  );
  add(
    'eas-submit-production',
    'eas.json → submit.production.android.track',
    eas.submit?.production?.android?.track === 'internal',
    eas.submit?.production?.android?.track ?? 'yok',
  );
} else {
  add('eas-json', 'mobile/eas.json', false, 'dosya yok');
}

// app.json
const appJson = readJson(join(mobileDir, 'app.json'));
const expo = appJson.expo ?? {};
const projectId = expo.extra?.eas?.projectId;
const notes = expo.extra?.retailexEasNotes;

add('app-slug', 'app.json → expo.slug', Boolean(expo.slug), expo.slug ?? '');
add('app-android-package', 'app.json → android.package', Boolean(expo.android?.package), expo.android?.package ?? '');
add('app-ios-bundle', 'app.json → ios.bundleIdentifier', Boolean(expo.ios?.bundleIdentifier), expo.ios?.bundleIdentifier ?? '');
add(
  'eas-project-id',
  'extra.eas.projectId (eas init sonrası)',
  Boolean(projectId && String(projectId).length > 10),
  projectId ? 'bağlı' : (notes?.projectId ?? 'henüz yok — npm run mobile:eas:init'),
);
add(
  'eas-notes',
  'extra.retailexEasNotes (placeholder dokümantasyon)',
  Boolean(notes?.status),
  notes?.status ?? '',
);

// sürüm hizası
const rootPkg = readJson(join(root, 'package.json'));
const mobilePkg = readJson(join(mobileDir, 'package.json'));
const versionAligned =
  rootPkg.version === mobilePkg.version && mobilePkg.version === expo.version;
add(
  'version-align',
  'kök package.json ≡ mobile/package.json ≡ app.json version',
  versionAligned,
  versionAligned ? rootPkg.version : `kök=${rootPkg.version} mobile=${mobilePkg.version} app=${expo.version}`,
);

const versionCode = expo.android?.versionCode;
const expectedCode = (() => {
  const parts = String(rootPkg.version).split('.').map((n) => parseInt(n, 10) || 0);
  return parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2];
})();
add(
  'version-code',
  'android.versionCode / ios.buildNumber',
  versionCode === expectedCode,
  `code=${versionCode} beklenen=${expectedCode}`,
);

// Expo oturumu (whoami) — login kullanıcı adımı
let whoamiOk = false;
let whoamiDetail = 'Not logged in — kullanıcı: npx eas-cli@latest login';
try {
  const who = spawnSync('npx', ['eas-cli@latest', 'whoami'], {
    cwd: mobileDir,
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });
  const out = `${who.stdout || ''}${who.stderr || ''}`.trim();
  whoamiOk = who.status === 0 && Boolean(out) && !/not logged in/i.test(out);
  if (whoamiOk) {
    whoamiDetail = out.split('\n').filter(Boolean).pop() || 'oturum açık';
  } else if (process.env.EXPO_TOKEN) {
    whoamiDetail = 'EXPO_TOKEN var ama whoami başarısız — token/geçerlilik kontrol et';
  }
} catch {
  whoamiDetail = 'eas-cli whoami çalıştırılamadı';
}
add('expo-whoami', 'Expo login (eas whoami)', whoamiOk, whoamiDetail);

// EXPO_TOKEN (isteğe bağlı — CI/headless)
add(
  'expo-token',
  'EXPO_TOKEN (CI/headless; yerel login yeterli)',
  Boolean(process.env.EXPO_TOKEN) || whoamiOk || process.stdin.isTTY,
  process.env.EXPO_TOKEN ? 'tanımlı' : whoamiOk ? 'yerel login OK' : 'gerekli: login veya token',
);

const prepIds = checks.filter(
  (c) => !['eas-project-id', 'expo-token', 'expo-whoami'].includes(c.id),
);
const prepOk = prepIds.every((c) => c.ok);
const linked = checks.find((c) => c.id === 'eas-project-id')?.ok;

console.log('\n[eas-mobile:check] RetailEX EAS hazırlık\n');
for (const c of checks) {
  const mark = c.ok ? '[x]' : '[ ]';
  const extra = c.detail ? ` — ${c.detail}` : '';
  console.log(`${mark} ${c.label}${extra}`);
}

console.log('\nÖzet:');
console.log(`  Yapılandırma hazırlığı: ${prepOk ? 'TAMAM' : 'EKSİK'}`);
console.log(`  Expo login:             ${whoamiOk ? 'EVET' : 'HAYIR → npx eas-cli@latest login'}`);
console.log(`  Expo projesi bağlı:     ${linked ? 'EVET' : 'HAYIR (önce login, sonra npm run mobile:eas:init)'}`);
if (!whoamiOk) {
  console.log('\n  >>> Kullanıcı adımı: Expo hesabına giriş (otomatik edilemez)');
  console.log('      npx eas-cli@latest login');
  console.log('      npx eas-cli@latest whoami');
  console.log('      npm run mobile:eas:init');
}
console.log('\nDetay: mobile/EAS_CHECKLIST.md · mobile/README.md#eas-build\n');

process.exit(prepOk ? 0 : 1);
