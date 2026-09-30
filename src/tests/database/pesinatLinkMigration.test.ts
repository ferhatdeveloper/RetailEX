/**
 * Peşinat Sale Link Migration Script — birim testleri
 * ----------------------------------------------------------------------------
 * Plan: beauty-pesinat-sales-fatura-plani.md §2.1 / Adım 1
 *
 * Bu test `apply-pesinat-sale-link.mjs`'i `--mock` modunda çalıştırır:
 *   • PG bağlantısı kurmaz; mock DB listesi (bestcom_db, aqua_db, lovan_db +
 *     RetailEX dışı: ilsasupport, pagetin_kurye, siti_pdks, aram) kullanır.
 *   • Beklenen:
 *       - 7 DB taranır, 4 RetailEX dışı atlanır (ilsasupport, pagetin_kurye,
 *         siti_pdks, aram)
 *       - 3 RetailEX DB işlenir (bestcom_db, aqua_db, lovan_db)
 *       - 10 sales tablosu bulunur (6 + 2 + 2)
 *       - 90 planlanan ALTER (10 × 9 ifade: 5 kolon + 4 indeks)
 *       - 5 kolon adı: linked_appointment_id, deposit_sale_id,
 *         parent_sale_id, sale_group_id, is_deposit
 *       - 4 indeks adı kökü: *_appointment_idx, *_group_idx, *_parent_idx,
 *         *_isdeposit_idx
 *       - Tüm ifadeler `IF NOT EXISTS` korumalı (idempotent)
 *       - Hiçbir `DO $$ ... END $$` bloğu yok (Tauri uyumu)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

// Vitest, jsdom ortamında modern `path` modülünü polyfill etmediği için
// `path.resolve` çağrısı `util.isString` hatası veriyor. process.cwd() +
// manuel birleştirme kullanıyoruz.
const REPO_ROOT = process.cwd();
const SCRIPT_PATH = `${REPO_ROOT}/database/scripts/apply-pesinat-sale-link.mjs`;

const EXPECTED_NEW_COLUMNS = [
  'linked_appointment_id',
  'deposit_sale_id',
  'parent_sale_id',
  'sale_group_id',
  'is_deposit',
];

const EXPECTED_INDEX_SUFFIXES = [
  '_appointment_idx',
  '_group_idx',
  '_parent_idx',
  '_isdeposit_idx',
];

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

let lastRun: RunResult;

function runMockDryRun(): RunResult {
  if (!existsSync(SCRIPT_PATH)) {
    throw new Error(`Migration script bulunamadı: ${SCRIPT_PATH}`);
  }
  const start = Date.now();
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--mock'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PESINAT_ENV_ONLY: '1' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    durationMs: Date.now() - start,
  };
}

describe('apply-pesinat-sale-link.mjs — mock dry-run', () => {
  beforeAll(() => {
    lastRun = runMockDryRun();
  }, 60_000);

  it('script çalışır ve exit code 0 döner', () => {
    expect(lastRun.status).toBe(0);
    expect(lastRun.stdout).toContain('[pesinat] === Peşinat Sale Link Migration ===');
    expect(lastRun.stdout).toContain('Mod: DRY-RUN (güvenli)');
  });

  it('MOCK modu PG bağlantısı kurmadan çalışır', () => {
    expect(lastRun.stdout).toContain('MOCK modu — PG bağlantısı kurulmadı');
  });

  it('RetailEX dışı veritabanları atlanır (non-retailex-databases.mjs ile uyumlu)', () => {
    expect(lastRun.stdout).toMatch(/ilsasupport/);
    expect(lastRun.stdout).toMatch(/pagetin_kurye/);
    expect(lastRun.stdout).toMatch(/siti_pdks/);
    expect(lastRun.stdout).toMatch(/aram/);
    // Atlanan DB satırı
    expect(lastRun.stdout).toMatch(/RetailEX dışı atlanan DB'ler:.*ilsasupport.*pagetin_kurye.*siti_pdks.*aram/);
    // Özet raporda 4 atlanan
    expect(lastRun.stdout).toMatch(/Atlanan \(non-RX\)\s*: 4/);
  });

  it('RetailEX tenant DB\'leri işlenir (bestcom_db, aqua_db, lovan_db)', () => {
    expect(lastRun.stdout).toMatch(/-> DB: bestcom_db/);
    expect(lastRun.stdout).toMatch(/-> DB: aqua_db/);
    expect(lastRun.stdout).toMatch(/-> DB: lovan_db/);
    expect(lastRun.stdout).toMatch(/İşlenen DB\s*: 3/);
  });

  it('10 sales tablosu bulunur (bestcom: 6, aqua: 2, lovan: 2)', () => {
    expect(lastRun.stdout).toMatch(/bestcom_db: 6 sales tablosu bulundu/);
    expect(lastRun.stdout).toMatch(/aqua_db: 2 sales tablosu bulundu/);
    expect(lastRun.stdout).toMatch(/lovan_db: 2 sales tablosu bulundu/);
    expect(lastRun.stdout).toMatch(/Bulunan sales tab\.\s*: 10/);
  });

  it('5 yeni kolonun her biri her tablo için planlanır', () => {
    // Her kolon adı 10 tabloda (bestcom:6 + aqua:2 + lovan:2) bir kez bulunmalı.
    // Toplam ALTER sayısı 10 × 5 = 50 — bu zaten aşağıdaki "tüm ifadeler"
    // testinde ayrıca doğrulanır.
    for (const col of EXPECTED_NEW_COLUMNS) {
      const occurrences = (
        lastRun.stdout.match(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`, 'g')) || []
      ).length;
      expect(occurrences).toBe(10);
    }
  });

  it('4 indeks soneki her tablo için planlanır', () => {
    // Her indeks soneki 10 tabloda bir kez bulunmalı. Toplam 10 × 4 = 40.
    for (const suffix of EXPECTED_INDEX_SUFFIXES) {
      const occurrences = (
        lastRun.stdout.match(new RegExp(`CREATE INDEX IF NOT EXISTS rex_\\d{3}_\\d{2}_sales${suffix}\\b`, 'g')) || []
      ).length;
      expect(occurrences).toBe(10);
    }
  });

  it('tüm ifadeler IF NOT EXISTS korumalıdır (idempotent)', () => {
    const statements = lastRun.stdout.match(/\[DRY-RUN\] Would execute: .*/g) || [];
    expect(statements.length).toBeGreaterThanOrEqual(90); // 5 kolon + 4 indeks × 10 tablo
    for (const stmt of statements) {
      expect(stmt).toMatch(/IF NOT EXISTS/);
    }
  });

  it('Tauri uyumu: DO $$ ... END $$ bloğu yok', () => {
    expect(lastRun.stdout).not.toMatch(/DO \$\$/);
    expect(lastRun.stdout).not.toMatch(/END \$\$/);
    expect(lastRun.stdout).not.toMatch(/DECLARE\s+\w+\s+RECORD/);
  });

  it('Toplam 90 planlanan ALTER (10 tablo × 9 ifade), 0 hata', () => {
    expect(lastRun.stdout).toMatch(/Uygulanan\/planlanan: 90 başarılı, 0 hatalı \(toplam 90\)/);
  });

  it('Özet rapor doğru bölümleri içerir', () => {
    expect(lastRun.stdout).toContain('ÖZET RAPOR');
    expect(lastRun.stdout).toContain('Mod                  : DRY-RUN');
    expect(lastRun.stdout).toContain('Taranan DB         : 7');
  });

  it('Script dosyası proje standartlarına uygun (syntax-check)', () => {
    // node --check sentaksı geçerli mi?
    const result = spawnSync(process.execPath, ['--check', SCRIPT_PATH], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('--apply olmadan dry-run güvenliği: hiçbir ALTER gerçek DB\'ye yazılmadı', () => {
    // Bu test sadece mantıksal güvence sağlar; gerçek bir PG bağlantısı kurmadığımız için
    // yan etki zaten yok. Script default mod = dry-run; --apply bayrağı olmadan
    // applyStatements 'dry' modunda çalışır.
    expect(lastRun.stdout).toContain('Mod: DRY-RUN');
    expect(lastRun.stdout).not.toContain('[OK]');
    expect(lastRun.stdout).not.toContain('[FAIL]');
  });
});
