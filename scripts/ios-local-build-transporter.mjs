#!/usr/bin/env node
/**
 * RetailEX iOS — yerel Mac IPA + Transporter.
 *
 *   npm run mobile:ios:local
 *   node scripts/ios-local-build-transporter.mjs
 *   node scripts/ios-local-build-transporter.mjs --skip-sync
 *   node scripts/ios-local-build-transporter.mjs --no-upload
 *
 * Expo bulut EAS Build kullanmaz (--local). Kural: retailex-ios-local-transporter.mdc
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mobileDir = join(root, 'mobile');
const outDir = join(root, 'build', 'ios', 'transporter');
const args = process.argv.slice(2);
const skipSync = args.includes('--skip-sync');
const noUpload = args.includes('--no-upload');
const dryRun = args.includes('--dry-run');

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: opts.cwd ?? root,
    stdio: 'inherit',
    shell: opts.shell ?? false,
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

if (!skipSync) {
  console.log('[ios-local] Sürüm sync…');
  run('node', [join(__dirname, 'sync-mobile-version.mjs')]);
}

const appJson = JSON.parse(readFileSync(join(mobileDir, 'app.json'), 'utf8'));
const version = appJson?.expo?.version ?? '0.0.0';
const buildNumber = appJson?.expo?.ios?.buildNumber ?? '0';
const projectId = appJson?.expo?.extra?.eas?.projectId;
if (!projectId) {
  console.error('[ios-local] extra.eas.projectId yok — npm run mobile:eas:init');
  process.exit(1);
}

const gemBin = join(process.env.HOME || '', '.gem', 'ruby', '4.0.0', 'bin');
const pathWithFastlane = [gemBin, '/opt/homebrew/bin', process.env.PATH || '']
  .filter(Boolean)
  .join(':');

const env = {
  PATH: pathWithFastlane,
  EXPO_ASC_API_KEY_PATH:
    process.env.EXPO_ASC_API_KEY_PATH ||
    join(mobileDir, 'secrets', 'AuthKey_99R4ZNAY3L.p8'),
  EXPO_ASC_KEY_ID: process.env.EXPO_ASC_KEY_ID || '99R4ZNAY3L',
  EXPO_ASC_ISSUER_ID:
    process.env.EXPO_ASC_ISSUER_ID || '17205ca6-06e5-4420-80d8-47e38df03cee',
  EXPO_APPLE_TEAM_ID: process.env.EXPO_APPLE_TEAM_ID || '7747ZF29A8',
  EXPO_APPLE_TEAM_TYPE: process.env.EXPO_APPLE_TEAM_TYPE || 'INDIVIDUAL',
  EAS_BUILD_NO_EXPO_GO_WARNING: 'true',
  EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: '1',
};

const easArgs = [
  'eas-cli@latest',
  'build',
  '--platform',
  'ios',
  '--profile',
  'production',
  '--local',
  '--non-interactive',
];

console.log(`[ios-local] Yerel EAS build — iOS production v${version} (${buildNumber})`);
console.log('[ios-local] Bulut EAS kullanılmıyor (--local).\n');

if (dryRun) {
  console.log(`[ios-local] dry-run: cd mobile && npx ${easArgs.join(' ')}`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

run('npx', easArgs, { cwd: mobileDir, shell: true, env });

// Find newest .ipa under mobile/ or outDir
function findIpas(dir, depth = 0) {
  if (depth > 4 || !existsSync(dir)) return [];
  const hits = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) hits.push(...findIpas(p, depth + 1));
    else if (name.endsWith('.ipa')) hits.push(p);
  }
  return hits;
}

const candidates = [...findIpas(mobileDir), ...findIpas(outDir)].sort(
  (a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs,
);

if (candidates.length === 0) {
  console.error('[ios-local] IPA bulunamadı. eas build --local çıktısını kontrol edin.');
  process.exit(2);
}

const srcIpa = candidates[0];
const destName = `RetailEX-iOS-${version}-${buildNumber}.ipa`;
const destIpa = join(outDir, destName);
copyFileSync(srcIpa, destIpa);
console.log(`[ios-local] IPA → ${destIpa}`);

spawnSync('open', ['-R', destIpa], { stdio: 'ignore' });
spawnSync('open', ['-a', 'Transporter', destIpa], { stdio: 'ignore' });

if (!noUpload && existsSync(env.EXPO_ASC_API_KEY_PATH)) {
  console.log('[ios-local] altool ile App Store Connect yükleme…');
  const p8Dir = join(process.env.HOME || '', '.appstoreconnect', 'private_keys');
  mkdirSync(p8Dir, { recursive: true });
  const keyFile = join(p8Dir, `AuthKey_${env.EXPO_ASC_KEY_ID}.p8`);
  if (!existsSync(keyFile)) {
    copyFileSync(env.EXPO_ASC_API_KEY_PATH, keyFile);
  }
  const up = spawnSync(
    'xcrun',
    [
      'altool',
      '--upload-app',
      '-f',
      destIpa,
      '-t',
      'ios',
      '--api-key',
      env.EXPO_ASC_KEY_ID,
      '--api-issuer',
      env.EXPO_ASC_ISSUER_ID,
    ],
    { stdio: 'inherit' },
  );
  if (up.status !== 0) {
    console.warn(
      '[ios-local] altool bitti (hata olabilir). Transporter’dan Deliver deneyin:',
      destIpa,
    );
    process.exit(up.status ?? 1);
  }
  console.log('[ios-local] Yükleme tamam.');
} else if (!noUpload) {
  console.log('[ios-local] ASC .p8 yok — Transporter’dan Deliver edin:', destIpa);
}

console.log(`[ios-local] TestFlight: https://appstoreconnect.apple.com/apps/6800660986/testflight/ios`);
