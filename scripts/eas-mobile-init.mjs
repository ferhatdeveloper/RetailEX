#!/usr/bin/env node
/**
 * Expo projesini EAS'e bağlar → app.json extra.eas.projectId yazar.
 *
 * Önkoşul (kullanıcı): Expo girişi
 *   npx eas-cli@latest login
 *   veya EXPO_TOKEN=... (CI / headless)
 *
 *   npm run mobile:eas:init
 *   npm run mobile:eas:init -- --non-interactive
 *   npm run mobile:eas:init -- --non-interactive --force
 *   npm run mobile:eas:init -- --id <EXISTING_PROJECT_UUID> --non-interactive
 *
 * Non-interactive (docs):
 *   eas init [--id <uuid>] [--force] [--non-interactive]
 *   Login yoksa / EXPO_TOKEN yoksa komut başarısız olur — önce login.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile');
const passthrough = process.argv.slice(2);
const nonInteractive =
  passthrough.includes('--non-interactive') || Boolean(process.env.CI) || Boolean(process.env.EXPO_TOKEN);

const easNpx = ['eas-cli@latest'];

function runEas(args, opts = {}) {
  return spawnSync('npx', [...easNpx, ...args], {
    cwd: mobileDir,
    stdio: opts.stdio ?? 'inherit',
    shell: true,
    encoding: 'utf8',
    env: process.env,
  });
}

console.log('[eas-init] RetailEX mobile → Expo Application Services');

const who = runEas(['whoami'], { stdio: 'pipe' });
const whoOut = `${who.stdout || ''}${who.stderr || ''}`.trim();
const loggedIn = who.status === 0 && whoOut && !/not logged in/i.test(whoOut);

if (!loggedIn) {
  console.error('\n[eas-init] Expo hesabı YOK — kullanıcı adımı gerekli.\n');
  console.error('  1) npx eas-cli@latest login');
  console.error('     (veya CI: EXPO_TOKEN — expo.dev → Access Tokens)');
  console.error('  2) npx eas-cli@latest whoami   # kullanıcı adını görmeli');
  console.error('  3) npm run mobile:eas:init');
  console.error('     headless: npm run mobile:eas:init -- --non-interactive [--force]\n');
  console.error('Detay: mobile/EAS_CHECKLIST.md → «Kullanıcı: Expo login»\n');
  process.exit(1);
}

console.log(`[eas-init] Oturum: ${whoOut.split('\n').pop()}`);
if (nonInteractive && !passthrough.includes('--non-interactive')) {
  passthrough.push('--non-interactive');
}
if (passthrough.length) {
  console.log(`[eas-init] bayraklar: ${passthrough.join(' ')}\n`);
} else {
  console.log('[eas-init] interaktif eas init (sorular için TTY)\n');
}

const r = runEas(['init', ...passthrough]);

if (r.status === 0) {
  console.log('\n[eas-init] Tamam. Doğrulama: npm run mobile:eas:check');
  console.log('[eas-init] İlk preview: npm run mobile:eas:preview');
}

process.exit(r.status ?? 1);
