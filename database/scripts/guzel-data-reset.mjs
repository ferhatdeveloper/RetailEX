#!/usr/bin/env node
/**
 * guzel data sıfırlama + migration orchestrator
 *
 * Akış:
 *   1. Default (⭐) geri dönüşüm noktasına RESTORE (database/scripts/guzel-restore-point.mjs)
 *   2. Bekleyen migration'ları çalıştır (database/scripts/run-pending-migrations.mjs --env-only)
 *
 * Davranış:
 *   - Varsayılan: dry-run (raporlar; restore/apply yok)
 *   - --apply ile: gerçek restore + apply
 *
 * ENV zorunlu:
 *   PGPASSWORD             — PG şifresi
 *   GUZEL_RESET_CONFIRM=YES (sadece --apply için)
 *
 * Kullanım:
 *   PGPASSWORD='...' node database/scripts/guzel-data-reset.mjs
 *   PGPASSWORD='...' node database/scripts/guzel-data-reset.mjs --apply
 *
 *   # veya
 *   npm run db:guzel:reset
 *   npm run db:guzel:reset -- --apply
 */

import { spawnSync } from 'child_process';

const APPLY = process.argv.slice(2).includes('--apply');
const PASSWORD = process.env.PGPASSWORD || '';

if (!PASSWORD) {
  console.error('PGPASSWORD gerekli (env).');
  process.exit(2);
}

const COLORS = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', reset: '\x1b[0m',
};
const log = (m, c = '') => console.log(`${c}${m}${c ? COLORS.reset : ''}`);

const ENV = { ...process.env, PGPASSWORD: PASSWORD };

log(`\n[guzel data reset] mod: ${APPLY ? 'APPLY (GERİ DÖNÜŞÜMSÜZ!)' : 'DRY-RUN'}`, APPLY ? COLORS.red : COLORS.yellow);

if (APPLY && process.env.GUZEL_RESET_CONFIRM !== 'YES') {
  log('\n⚠️  --apply gerçekten çalışsın istiyorsanız GUZEL_RESET_CONFIRM=YES env gerekli.', COLORS.red);
  log('   GUZEL_RESET_CONFIRM=YES PGPASSWORD=\'...\' npm run db:guzel:reset -- --apply', COLORS.gray);
  process.exit(3);
}

// ─── ADIM 1: default restore ─────────────────────────────────────────────────
log(`\n[1/2] Restore: default (⭐) geri dönüşüm noktasına`, COLORS.cyan);
if (!APPLY) log('   (--apply olmadığı için sadece rapor)', COLORS.gray);

const restoreEnv = APPLY ? { ...ENV, GUZEL_RESTORE_CONFIRM: 'YES' } : ENV;
const restoreCmd = 'node';
const restoreArgs = [
  'database/scripts/guzel-restore-point.mjs',
  'restore',
  '--default',
];
const restoreRes = spawnSync(restoreCmd, restoreArgs, {
  env: restoreEnv,
  stdio: 'inherit',
});

if (restoreRes.status !== 0) {
  if (!APPLY && restoreRes.status === 3) {
    log('\n   (dry-run onay bekliyor — restore gerçekten çalışmadı, OK)', COLORS.gray);
  } else {
    log(`\n❌ Restore başarısız (exit ${restoreRes.status}). Migration adımına geçilmiyor.`, COLORS.red);
    process.exit(restoreRes.status || 1);
  }
}

// ─── ADIM 2: bekleyen migration'ları uygula ──────────────────────────────────
log(`\n[2/2] Bekleyen migration'ları uygula`, COLORS.cyan);
if (!APPLY) log('   (--apply olmadığı için sadece dry-run listesi)', COLORS.gray);

const migArgs = ['database/scripts/run-pending-migrations.mjs', '--env-only'];
if (!APPLY) migArgs.push('--dry-run');

const migRes = spawnSync('node', migArgs, { env: ENV, stdio: 'inherit' });
if (migRes.status !== 0) {
  log(`\n❌ Migration adımı başarısız (exit ${migRes.status}).`, COLORS.red);
  process.exit(migRes.status || 1);
}

log(`\n${APPLY ? '✅' : '🟡'} guzel data reset ${APPLY ? 'tamamlandı' : 'dry-run bitti'}.`, APPLY ? COLORS.green : COLORS.yellow);
if (!APPLY) {
  log('   Gerçekten çalıştırmak için: GUZEL_RESET_CONFIRM=YES npm run db:guzel:reset -- --apply', COLORS.gray);
}
process.exit(0);