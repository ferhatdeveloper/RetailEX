/**
 * Kasa Durumu yerleşimi.
 * Günlük Kart kutusu ve genel toplam çubuğu yoktur.
 * Rezervasyon avansı ile gider üst kutularla aynı kart biçimindedir.
 * Kasa ızgarası altta kalır. Tutarlar çağıranın verdiği değerdir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CashStatusFigures } from '../../components/reports/CashStatusFigures';
import type { CashStatusPaymentLine } from '../../utils/cashStatusTotals';

vi.mock('../../contexts/FirmaDonemContext', () => ({
  useFirmaDonem: () => ({ selectedFirm: null }),
}));

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'tr',
    tm: (key: string) => key,
    t: {},
    setLanguage: () => undefined,
  }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ darkMode: false }),
}));

const LABELS = {
  opening: 'Açılış Kasası',
  todayCash: 'Günlük Nakit',
  todayCashHint: 'rezervasyon nakdi dahil',
  reservation: 'Alınan Avans (Rezervasyon)',
  reservationHint: 'bilgi — günlük nakde dahildir',
  todayCard: 'Günlük Kart',
  closing: 'Kapanış Kasası',
  closingHint: 'rezervasyon nakdi dahil',
  distribution: 'Ödeme Dağılımı',
  grandTotal: 'Genel Toplam',
  grandHint: 'Genel toplam nakit (rezervasyon dahil), kart, açık cari ve havaleyi bir kez sayar.',
  expenseHint: 'nakit tahsilattan düşülür',
  infoBadge: 'bilgi',
  registersTitle: 'Kasalar',
  registerName: 'Kasa',
  registerAmount: 'İçindeki tutar',
  registersTotal: 'Kasalar toplamı',
  registersEmpty: 'Seçili dönemde kasa kaydı yok.',
  registerListHint: 'Her satır kasanın bakiyesidir; gider bu bakiyeden düşülmüştür. Genel toplama ikinci kez eklenmez.',
};

const PAYMENT_ROWS: CashStatusPaymentLine[] = [
  { code: 'NAKIT', amount: 138_500, label: 'Nakit', color: '#16a34a' },
  { code: 'KREDIKARTI', amount: 0, label: 'Kredi Kartı', color: '#7c3aed' },
  { code: 'ACIK_CARI', amount: 0, label: 'Açık Cari Hesap', color: '#64748b' },
  { code: 'HAVAL', amount: 0, label: 'Havale/EFT', color: '#2563eb' },
  {
    code: 'REZERVASYON_AVANS',
    amount: 10_000,
    label: 'Rezervasyon Avansı',
    informational: true,
    color: '#0ea5e9',
  },
  {
    code: 'GIDER',
    amount: 15_000,
    label: 'Gider',
    deduction: true,
    color: '#e11d48',
  },
];

function renderScreen() {
  const onPaymentClick = vi.fn();
  const view = render(
    createElement(CashStatusFigures, {
      openingCash: -38_500,
      todayCash: 138_500,
      reservationDeposit: 10_000,
      todayCard: 0,
      closingCash: 85_000,
      currency: 'IQD',
      paymentRows: PAYMENT_ROWS,
      grandTotal: 123_500,
      labels: LABELS,
      onPaymentClick,
      registerLines: [
        { id: 'merkez', code: 'KASA.001', name: 'MERKEZ KASA', label: 'KASA.001 — MERKEZ KASA', amount: 85_000 },
        { id: 'qicard', code: 'KASA.002', name: 'QICARD', label: 'KASA.002 — QICARD', amount: 0 },
      ],
      aside: createElement('div', { 'data-testid': 'cash-status-card-types' }, 'Kart Türleri'),
    }),
  );
  return { ...view, onPaymentClick };
}

describe('Kasa Durumu yerleşimi', () => {
  it('günlük kart kutusunu ve genel toplam çubuğunu göstermez; rakamlar aynı kalır', () => {
    const { container } = renderScreen();
    const text = container.textContent ?? '';

    expect(screen.queryByText('Günlük Kart')).toBeNull();
    expect(screen.queryByText('Genel Toplam')).toBeNull();
    expect(text).not.toContain('123.500');
    expect(text).not.toContain(LABELS.grandHint);
    expect(text).not.toContain('Her satır kasanın bakiyesidir');

    const opening = screen.getByTestId('cash-status-card-opening');
    const cash = screen.getByTestId('cash-status-card-today-cash');
    const advance = screen.getByTestId('cash-status-card-reservation');
    const closing = screen.getByTestId('cash-status-card-closing');

    expect(opening.textContent).toContain('Açılış Kasası');
    expect(opening.textContent).toMatch(/[-−]38\.500/);
    expect(opening.textContent).toContain('IQD');
    expect(cash.textContent).toContain('138.500');
    expect(advance.textContent).toContain('Alınan Avans (Rezervasyon)');
    expect(advance.textContent).toContain('10.000');
    expect(closing.textContent).toContain('85.000');

    const html = container.innerHTML;
    const kpi = html.indexOf('data-testid="cash-status-kpi-row"');
    const spot = html.indexOf('data-testid="cash-status-spotlight-row"');
    const dist = html.indexOf('data-testid="cash-status-distribution"');
    const regs = html.indexOf('data-testid="cash-status-registers"');
    expect(kpi).toBeGreaterThanOrEqual(0);
    expect(kpi).toBeLessThan(spot);
    expect(spot).toBeLessThan(dist);
    expect(dist).toBeLessThan(regs);
  });

  it('rezervasyon ve gideri kart yapar; nakit ile açık cari listede, kasalar altta kalır', () => {
    const { onPaymentClick } = renderScreen();

    const info = screen.getByTestId('cash-status-card-reservation-info');
    expect(info.className).toContain('border-2');
    expect(info.className).toContain('border-sky-200');
    expect(info.textContent).toContain('Rezervasyon Avansı');
    expect(info.textContent).toContain('10.000');
    expect(info.textContent?.toLocaleLowerCase('tr-TR')).toContain('bilgi');
    expect(info.textContent).toContain('günlük nakde dahildir');
    expect(info.tagName).not.toBe('BUTTON');

    const expense = screen.getByTestId('cash-status-card-expense');
    expect(expense.className).toContain('border-2');
    expect(expense.className).toContain('border-rose-200');
    expect(expense.className).toContain('bg-white');
    expect(expense.textContent).toContain('Gider');
    expect(expense.textContent).toContain('15.000');
    expect(expense.textContent).toContain('−');
    expect(expense.textContent).toContain('nakit tahsilattan düşülür');
    expect(expense.tagName).not.toBe('BUTTON');

    const distribution = screen.getByTestId('cash-status-distribution');
    expect(within(distribution).getByText('Nakit')).toBeTruthy();
    expect(within(distribution).getByText('Açık Cari Hesap')).toBeTruthy();
    expect(within(distribution).queryByText('Rezervasyon Avansı')).toBeNull();
    expect(within(distribution).queryByText('Gider')).toBeNull();
    expect(within(distribution).queryByText('Kredi Kartı')).toBeNull();
    expect(within(distribution).queryByText('Havale/EFT')).toBeNull();
    expect(within(distribution).getByText('138.500 IQD')).toBeTruthy();
    expect(within(distribution).getAllByText('0 IQD').length).toBeGreaterThan(0);

    fireEvent.click(within(distribution).getByRole('button', { name: /Nakit/ }));
    expect(onPaymentClick).toHaveBeenCalledWith('NAKIT');

    const registers = screen.getByTestId('cash-status-registers');
    expect(distribution.contains(registers)).toBe(true);
    expect(registers.textContent).toContain('Kasalar');
    expect(registers.textContent).toContain('KASA.001 — MERKEZ KASA');
    expect(registers.textContent).toContain('KASA.002 — QICARD');
    expect(registers.textContent).toContain('85.000');
    expect(registers.textContent).toContain('Kasalar toplamı');

    const source = readFileSync(resolve('src/components/reports/CashStatusFigures.tsx'), 'utf8');
    expect(source).toContain('ReportColumnTable');
    expect(source).not.toContain('<table');
    expect(source).not.toContain('labels.todayCard');
    expect(source).not.toContain('labels.grandTotal');

    expect(screen.getByTestId('cash-status-card-types').textContent).toContain('Kart Türleri');
  });
});
