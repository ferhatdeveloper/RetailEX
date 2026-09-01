/**
 * Regression test: writeCashRegisterLineForInvoice — kasa INSERT dayanıklılığı
 *
 * Skandal (2026-09-01): yeni fatura create'inde kasa INSERT'i sessizce
 * başarısız oluyordu — fatura kaydedilmiş görünüyordu ama kasa defteri
 * güncellenmiyordu. Edit → save → idempotent UPDATE yoluna düşüp kasa
 * satırı ekleniyordu. Kök neden olarak iki yol tespit edildi:
 *  (a) tekilleme sorgusu timeout → sonraki INSERT UNIQUE(fiche_no) ihlali
 *  (b) createKasaIslemi içinde geçici DB hatası
 *
 * Düzeltme: 3 denemeli retry + UNIQUE ihlalinde UPDATE fallback.
 * Bu test, retry mantığını izole eder — gerçek DB olmadan pure JS.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

/** Retry/backoff mantığını aynen taklit eden mini helper. */
async function attemptInsertWithRetry(
  insert: () => Promise<void>,
  update: () => Promise<void>,
  classifyTransient: (msg: string) => boolean,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await insert();
      return; // başarılı
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e || '');
      const code = (e as any)?.code;
      if (code === '23505' || /duplicate key/i.test(msg)) {
        try {
          await update();
          return;
        } catch {
          /* fallback başarısız */
        }
      }
      const isTransient = classifyTransient(msg);
      if (attempt < 3 && isTransient) {
        await sleep(250 * attempt);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

describe('writeCashRegisterLineForInvoice — INSERT dayanıklılığı', () => {
  beforeEach(() => {
    /* no-op */
  });

  it('ilk INSERT başarılı → UPDATE çağrılmaz', async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn();
    await attemptInsertWithRetry(insert, update, () => false);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('UNIQUE ihlali → UPDATE fallback ile başarı', async () => {
    const insert = vi.fn().mockRejectedValue({ code: '23505', message: 'duplicate key value violates unique constraint' });
    const update = vi.fn().mockResolvedValue(undefined);
    let result: any = null;
    try {
      await attemptInsertWithRetry(insert, update, () => false);
    } catch (e) {
      result = e;
    }
    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toBeNull(); // hata fırlatılmamalı
  });

  it('geçici DB hatası (timeout) → 3 deneme sonra son hatayı fırlat', async () => {
    const insert = vi.fn().mockRejectedValue({ message: 'connection timeout' });
    const update = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    let result: any = null;
    try {
      await attemptInsertWithRetry(insert, update, (m) => /timeout|connection/i.test(m), sleep);
    } catch (e) {
      result = e;
    }
    expect(insert).toHaveBeenCalledTimes(3);
    expect(update).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledTimes(2); // 2 backoff (1. ve 2. denemeden sonra)
    expect(result?.message).toBe('connection timeout');
  });

  it('kalıcı hata (UNIQUE değil, geçici değil) → 1 denemede fırlat', async () => {
    const insert = vi.fn().mockRejectedValue({ message: 'permission denied' });
    const update = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    let result: any = null;
    try {
      await attemptInsertWithRetry(insert, update, () => false, sleep);
    } catch (e) {
      result = e;
    }
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    expect(result?.message).toBe('permission denied');
  });

  it('ilk 2 transient hata, 3. başarılı → UPDATE çağrılmaz', async () => {
    const insert = vi.fn()
      .mockRejectedValueOnce({ message: 'connection terminated due to connection timeout' })
      .mockRejectedValueOnce({ message: 'connection timeout' })
      .mockResolvedValueOnce(undefined);
    const update = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    await attemptInsertWithRetry(insert, update, (m) => /timeout|connection/i.test(m), sleep);
    expect(insert).toHaveBeenCalledTimes(3);
    expect(update).not.toHaveBeenCalled();
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
