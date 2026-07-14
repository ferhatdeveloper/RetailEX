#!/usr/bin/env node
/**
 * EAS Submit — Google Play (varsayılan: internal track, production profili).
 *
 *   npm run mobile:eas:submit
 *   node scripts/eas-mobile-submit.mjs --latest
 *   node scripts/eas-mobile-submit.mjs --id <buildUuid>
 *   node scripts/eas-mobile-submit.mjs --path path/to/app.aab
 *   node scripts/eas-mobile-submit.mjs --dry-run
 *
 * Service account:
 *   Tercih — Expo Credentials (dashboard / eas credentials). CI için yeterlidir.
 *   Yerel — mobile/secrets/google-play-service-account.json (gitignore)
 *   CI — GOOGLE_SERVICE_ACCOUNT_JSON (veya alias KEY_JSON) → geçici dosya;
 *        eas.json'a path yazılır, bitince geri alınır (commit yok)
 *
 * Ayrıntı: mobile/PLAY_SUBMIT.md · mobile/EAS_CHECKLIST.md
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mobileDir = join(root, 'mobile');
const easJsonPath = join(mobileDir, 'eas.json');
const defaultSecretPath = join(mobileDir, 'secrets', 'google-play-service-account.json');

const args = process.argv.slice(2);

function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const profile = arg('--profile', 'production');
const platform = arg('--platform', 'android');
const buildId = arg('--id', null);
const artifactPath = arg('--path', null);
const dryRun = args.includes('--dry-run');
const useLatest = args.includes('--latest') || (!buildId && !artifactPath);

if (platform !== 'android') {
  console.error('[eas-submit] Şimdilik yalnızca android desteklenir.');
  process.exit(1);
}

if (!dryRun && !process.env.EXPO_TOKEN && !process.stdin.isTTY) {
  console.error('[eas-submit] Headless ortamda EXPO_TOKEN gerekir. Bkz. mobile/PLAY_SUBMIT.md');
  process.exit(1);
}

/** @type {string | null} */
let serviceAccountPath = null;
/** @type {string | null} */
let tempKeyPath = null;
/** @type {string | null} */
let easJsonBackupPath = null;

const saJson =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || '';
if (saJson) {
  const dir = join(tmpdir(), 'retailex-play-submit');
  mkdirSync(dir, { recursive: true });
  tempKeyPath = join(dir, `sa-${randomBytes(8).toString('hex')}.json`);
  writeFileSync(tempKeyPath, saJson, {
    encoding: 'utf8',
    mode: 0o600,
  });
  serviceAccountPath = tempKeyPath;
  const src = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? 'GOOGLE_SERVICE_ACCOUNT_JSON'
    : 'GOOGLE_SERVICE_ACCOUNT_KEY_JSON';
  console.log(`[eas-submit] ${src} → geçici dosya (repo dışı)`);
} else {
  const fromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const candidate = fromEnv
    ? isAbsolute(fromEnv)
      ? fromEnv
      : resolve(root, fromEnv)
    : defaultSecretPath;
  if (existsSync(candidate)) {
    serviceAccountPath = candidate;
  } else if (fromEnv) {
    console.warn(
      `[eas-submit] GOOGLE_SERVICE_ACCOUNT_KEY_PATH yok (${candidate}) — EAS Credentials denenecek.`,
    );
  }
}

if (!serviceAccountPath) {
  console.log(
    '[eas-submit] Yerel service account JSON yok — EAS dashboard Credentials kullanılacak (tercih).',
  );
}

/**
 * CLI'da service-account flag yok; path yalnızca eas.json → serviceAccountKeyPath.
 * Yerel key varsa geçici patch (orijinal dosya yedekten geri yüklenir).
 */
function applyServiceAccountKeyPath(absKeyPath) {
  const eas = JSON.parse(readFileSync(easJsonPath, 'utf8'));
  eas.submit = eas.submit ?? {};
  eas.submit[profile] = eas.submit[profile] ?? {};
  eas.submit[profile].android = eas.submit[profile].android ?? {};
  // mobile/ cwd göreli path (eas submit mobileDir'de çalışır)
  const rel = relative(mobileDir, absKeyPath).replace(/\\/g, '/');
  eas.submit[profile].android.serviceAccountKeyPath = rel.startsWith('.') ? rel : `./${rel}`;
  easJsonBackupPath = join(tmpdir(), `eas-json-backup-${randomBytes(6).toString('hex')}.json`);
  copyFileSync(easJsonPath, easJsonBackupPath);
  writeFileSync(easJsonPath, `${JSON.stringify(eas, null, 2)}\n`, 'utf8');
  console.log(
    `[eas-submit] eas.json geçici serviceAccountKeyPath=${eas.submit[profile].android.serviceAccountKeyPath}`,
  );
}

function restoreEasJson() {
  if (easJsonBackupPath && existsSync(easJsonBackupPath)) {
    try {
      copyFileSync(easJsonBackupPath, easJsonPath);
      unlinkSync(easJsonBackupPath);
    } catch {
      /* ignore */
    }
    easJsonBackupPath = null;
  }
}

function cleanupTemp() {
  restoreEasJson();
  if (tempKeyPath && existsSync(tempKeyPath)) {
    try {
      unlinkSync(tempKeyPath);
    } catch {
      /* ignore */
    }
  }
}

const easArgs = [
  'submit',
  '--platform',
  platform,
  '--profile',
  profile,
  '--non-interactive',
];

if (artifactPath) {
  const abs = isAbsolute(artifactPath) ? artifactPath : resolve(root, artifactPath);
  easArgs.push('--path', abs);
} else if (buildId) {
  easArgs.push('--id', buildId);
} else if (useLatest) {
  easArgs.push('--latest');
}

if (serviceAccountPath) {
  applyServiceAccountKeyPath(serviceAccountPath);
}

if (dryRun) {
  console.log(`[eas-submit] dry-run: cd mobile && npx eas-cli@latest ${easArgs.join(' ')}`);
  cleanupTemp();
  process.exit(0);
}

console.log(`[eas-submit] eas submit — ${platform} / ${profile} (track: eas.json submit.${profile})\n`);

let status = 1;
try {
  const result = spawnSync('npx', ['eas-cli@latest', ...easArgs], {
    cwd: mobileDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  status = result.status ?? 1;
} finally {
  cleanupTemp();
}

process.exit(status);
