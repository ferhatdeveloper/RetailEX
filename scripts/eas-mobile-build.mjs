#!/usr/bin/env node
/**
 * EAS Build — sürüm sync + eas build.
 *
 *   npm run mobile:eas:preview
 *   npm run mobile:eas:production
 *   node scripts/eas-mobile-build.mjs --profile debug --platform android
 *   node scripts/eas-mobile-build.mjs --profile production --platform ios
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mobileDir = join(root, 'mobile');

const args = process.argv.slice(2);

function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const profile = arg('--profile', 'preview');
const platform = arg('--platform', 'android');
const dryRun = args.includes('--dry-run');
const skipSync = args.includes('--skip-sync');
const local = args.includes('--local');

const VALID = ['debug', 'preview', 'production'];
if (!VALID.includes(profile)) {
  console.error(`[eas-mobile] Geçersiz profil: ${profile}. İzin: ${VALID.join(', ')}`);
  process.exit(1);
}

if (!['android', 'ios', 'all'].includes(platform)) {
  console.error(`[eas-mobile] Geçersiz platform: ${platform}. İzin: android | ios | all`);
  process.exit(1);
}

// RetailEX iOS store IPA: bulut EAS yasak — retailex-ios-local-transporter.mdc
if ((platform === 'ios' || platform === 'all') && profile === 'production' && !local) {
  console.error(
    '[eas-mobile] iOS production bulut EAS Build yasak. Kullanın: npm run mobile:ios:local',
  );
  console.error('[eas-mobile] (veya: node scripts/eas-mobile-build.mjs --profile production --platform ios --local)');
  process.exit(1);
}

if (!skipSync) {
  console.log('[eas-mobile] Sürüm sync…');
  const sync = spawnSync('node', [join(__dirname, 'sync-mobile-version.mjs')], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (sync.status !== 0) process.exit(sync.status ?? 1);
}

const appJson = JSON.parse(readFileSync(join(mobileDir, 'app.json'), 'utf8'));
const projectId = appJson?.expo?.extra?.eas?.projectId;

if (!projectId) {
  console.warn('[eas-mobile] extra.eas.projectId yok.');
  console.warn('[eas-mobile] Önce: npm run mobile:eas:init');
  if (profile !== 'debug') {
    console.error('[eas-mobile] preview/production için eas init zorunlu.');
    process.exit(1);
  }
}

if (!process.env.EXPO_TOKEN && !process.stdin.isTTY) {
  console.warn('[eas-mobile] EXPO_TOKEN yok — headless ortamda login/token gerekir.');
}

const easArgs = ['build', '--platform', platform, '--profile', profile, '--non-interactive'];
if (local) easArgs.push('--local');

if (dryRun) {
  console.log(`[eas-mobile] dry-run: cd mobile && npx eas-cli@latest ${easArgs.join(' ')}`);
  process.exit(0);
}

console.log(`[eas-mobile] eas build — ${platform} / ${profile}\n`);

const build = spawnSync('npx', ['eas-cli@latest', ...easArgs], {
  cwd: mobileDir,
  stdio: 'inherit',
  shell: true,
});

process.exit(build.status ?? 1);
