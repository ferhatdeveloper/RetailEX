/**
 * Günlük rapor gider satırı detay açar; fatura silmez.
 * Erken kapanan rezervasyon, işin yapıldığı güne yazılır.
 * Yapılmamış peşinat hizmet gününe taşınmaz.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDailyExpenseRowClick } from '../../utils/dailyExpenseRowClick';
import {
  prePaymentListedYmd,
  prePaymentReceived,
  prePaymentRemaining,
  prePaymentServiceTotal,
} from '../../utils/depositPrePaymentAllocation';

const COLLECTED = '2026-10-31';
const VISIT = '2026-11-02';

describe('günlük rapor gider satırı', () => {
  it('maaş ve gider pusulası satırı detay döner, fatura silme açmaz', () => {
    const salary = resolveDailyExpenseRowClick({
      ficheNo: 'KL-MAVWQU1X-DTEAQS',
      timeLabel: '23:29',
      typeLabel: 'Gider pusulası',
      category: 'salary',
      description: 'MAAS',
      amount: 30_000,
      currencyCode: 'IQD',
      baseAmount: 30_000,
      payLabel: 'Nakit',
    });
    const named = resolveDailyExpenseRowClick({
      ficheNo: 'KL-MAVWGW9NN-TWRMD4',
      timeLabel: '23:31',
      typeLabel: 'Gider pusulası',
      category: 'salary',
      description: 'ZAHRA',
      amount: 5_000,
      currencyCode: 'IQD',
      baseAmount: 5_000,
      payLabel: 'Nakit',
    });

    expect(salary.action).toBe('detail');
    expect(named.action).toBe('detail');
    expect(salary).not.toMatchObject({ action: 'invoice-delete' });
    expect(named).not.toMatchObject({ action: 'invoice-delete' });
    if (salary.action !== 'detail' || named.action !== 'detail') return;

    expect(salary.detail).toMatchObject({
      ficheNo: 'KL-MAVWQU1X-DTEAQS',
      timeLabel: '23:29',
      typeLabel: 'Gider pusulası',
      category: 'salary',
      description: 'MAAS',
      amount: 30_000,
      currencyCode: 'IQD',
      baseAmount: 30_000,
      paymentLabel: 'Nakit',
    });
    expect(named.detail.ficheNo).toBe('KL-MAVWGW9NN-TWRMD4');
    expect(named.detail.description).toBe('ZAHRA');
    expect(named.detail.amount).toBe(5_000);
    expect(named.detail.baseAmount).toBe(5_000);

    const screen = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const gridAt = screen.indexOf('data={dailyExpenseGridRows}');
    const columnsAt = screen.indexOf('columns={[', gridAt);
    const click = screen.slice(gridAt, columnsAt);
    expect(click).toContain('resolveDailyExpenseRowClick');
    expect(click).toContain("resolved.action !== 'detail'");
    expect(click).toContain('setDailyExpenseDetail(resolved.detail)');
    expect(click).not.toContain('deleteDailyExpenseRow');
    expect(click).not.toContain('handleDeleteDailyErpSale');
    expect(click).not.toContain('reportsDeleteInvoiceBtn');

    const modalAt = screen.indexOf('{dailyExpenseDetail ? (');
    const modal = screen.slice(modalAt, modalAt + 1800);
    expect(modal).toContain('<PercentBodyModal');
    expect(modal).toContain('size="compact"');
    expect(modal).not.toContain('deleteDailyExpenseRow');
    expect(modal).not.toContain('reportsDeleteInvoiceBtn');
  });
});

describe('erken kapanan rezervasyon tarihi', () => {
  it('hizmet erken yapılıp ödendiyse satır kapanış günündedir', () => {
    const strong = {
      appointment_date: VISIT,
      deposit_date: `${COLLECTED}T10:00:00`,
      updated_at: `${COLLECTED}T10:00:00`,
      payment_state: 'paid' as const,
      status: 'completed',
      deposit_amount: 5_000,
      total_price: 25_000,
    };
    expect(prePaymentListedYmd(strong)).toBe(COLLECTED);
    expect(prePaymentListedYmd(strong)).not.toBe(VISIT);
    expect(strong.deposit_amount).toBe(5_000);
    expect(prePaymentServiceTotal(strong)).toBe(25_000);
    expect(prePaymentReceived(strong)).toBe(25_000);
    expect(prePaymentRemaining(strong)).toBe(0);

    const closed = { ...strong, status: 'closed' };
    expect(prePaymentListedYmd(closed)).toBe(COLLECTED);
  });

  it('aynı gün kapanan HIGHLIGHT satırı 31.10 tarihinde kalır', () => {
    const highlight = {
      appointment_date: COLLECTED,
      deposit_date: `${COLLECTED}T09:00:00`,
      updated_at: `${COLLECTED}T09:00:00`,
      payment_state: 'paid' as const,
      status: 'completed',
      deposit_amount: 25_000,
      total_price: 75_000,
    };
    expect(prePaymentListedYmd(highlight)).toBe(COLLECTED);
    expect(prePaymentServiceTotal(highlight)).toBe(75_000);
    expect(prePaymentReceived(highlight)).toBe(75_000);
    expect(prePaymentRemaining(highlight)).toBe(0);
  });

  it('randevu gününde kapanan hizmet, eski peşinat gününe taşınmaz', () => {
    expect(prePaymentListedYmd({
      appointment_date: VISIT,
      deposit_date: `${COLLECTED}T18:00:00`,
      updated_at: `${VISIT}T15:00:00`,
      payment_state: 'paid',
      status: 'completed',
      deposit_amount: 5_000,
    })).toBe(VISIT);
  });

  it('yapılmamış ileri peşinat tahsilat gününde kalır, hizmet bugün sayılmaz', () => {
    const openFuture = {
      appointment_date: '2026-11-20',
      deposit_date: `${COLLECTED}T18:40:00`,
      updated_at: '2026-11-01T12:00:00',
      payment_state: 'deposit_only' as const,
      status: 'scheduled',
      deposit_amount: 5_000,
      total_price: 25_000,
    };
    expect(prePaymentListedYmd(openFuture)).toBe(COLLECTED);
    expect(prePaymentListedYmd(openFuture)).not.toBe('2026-11-01');
    expect(prePaymentListedYmd(openFuture)).not.toBe('2026-11-20');
    expect(prePaymentReceived(openFuture)).toBe(5_000);
    expect(prePaymentRemaining(openFuture)).toBe(20_000);
    expect(prePaymentReceived(openFuture)).not.toBe(25_000);
  });
});
