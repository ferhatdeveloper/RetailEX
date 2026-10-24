/**
 * Kasa Durumu yerleşimi.
 * Özet tam üç kutudur: toplam giren mavi, toplam çıkan kırmızı, bakiye yeşil.
 * Açılış, günlük nakit, kapanış, avans, gider kartı, ödeme dağılımı ve kart türleri yoktur.
 * Kasalar tablosu altta tam genişliktedir.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CashStatusFigures } from '../../components/reports/CashStatusFigures';

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
  totalIn: 'Toplam giren',
  totalInHint: 'Seçili aralıkta kasaya giren',
  totalOut: 'Toplam çıkan',
  totalOutHint: 'Seçili aralıkta kasadan çıkan',
  balance: 'Bakiye',
  balanceHint: 'Güncel kasa bakiyesi',
  registersTitle: 'Kasalar',
  registerName: 'Kasa',
  registerAmount: 'İçindeki tutar',
  registersTotal: 'Kasalar toplamı',
  registersEmpty: 'Seçili dönemde kasa kaydı yok.',
};

function renderScreen() {
  return render(
    createElement(CashStatusFigures, {
      totalIn: 263_500,
      totalOut: 0,
      balance: 225_000,
      currency: 'IQD',
      labels: LABELS,
      registerLines: [
        { id: 'merkez', code: 'KASA.001', name: 'MERKEZ KASA', label: 'KASA.001 — MERKEZ KASA', amount: 225_000 },
        { id: 'qicard', code: 'KASA.002', name: 'QICARD', label: 'KASA.002 — QICARD', amount: 0 },
      ],
    }),
  );
}

describe('Kasa Durumu yerleşimi', () => {
  it('özeti üç kutuya indirir; kırmızı çizilen paneller yoktur', () => {
    const { container } = renderScreen();
    const text = container.textContent ?? '';

    const incoming = screen.getByTestId('cash-status-card-in');
    const outgoing = screen.getByTestId('cash-status-card-out');
    const balance = screen.getByTestId('cash-status-card-balance');

    expect(incoming.textContent).toContain('Toplam giren');
    expect(incoming.textContent).toContain('263.500');
    expect(incoming.textContent).toContain('IQD');
    expect(incoming.className).toContain('border-blue-200');
    expect(incoming.className).toContain('border-2');

    expect(outgoing.textContent).toContain('Toplam çıkan');
    expect(outgoing.textContent).toContain('0');
    expect(outgoing.className).toContain('border-rose-200');

    expect(balance.textContent).toContain('Bakiye');
    expect(balance.textContent).toContain('225.000');
    expect(balance.className).toContain('border-green-200');
    expect(balance.textContent).toContain('Güncel kasa bakiyesi');

    expect(screen.queryByText('Açılış Kasası')).toBeNull();
    expect(screen.queryByText('Günlük Nakit')).toBeNull();
    expect(screen.queryByText('Günlük Kart')).toBeNull();
    expect(screen.queryByText('Alınan Avans (Rezervasyon)')).toBeNull();
    expect(screen.queryByText('Kapanış Kasası')).toBeNull();
    expect(screen.queryByText('Rezervasyon Avansı')).toBeNull();
    expect(screen.queryByText('Ödeme Dağılımı')).toBeNull();
    expect(screen.queryByText('Kart Türleri')).toBeNull();
    expect(screen.queryByText('Genel Toplam')).toBeNull();
    expect(screen.queryByText('Nakit')).toBeNull();
    expect(screen.queryByText('Açık Cari Hesap')).toBeNull();
    expect(text).not.toContain('10.000');
    expect(text).not.toContain('38.500');

    expect(screen.queryByTestId('cash-status-distribution')).toBeNull();
    expect(screen.queryByTestId('cash-status-panels')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-types')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-opening')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-today-cash')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-reservation')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-closing')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-expense')).toBeNull();
    expect(screen.queryByTestId('cash-status-card-reservation-info')).toBeNull();

    const kpiRow = screen.getByTestId('cash-status-kpi-row');
    expect(kpiRow.className).toContain('md:grid-cols-3');
    expect(kpiRow.className).not.toContain('lg:grid-cols-4');
    expect(kpiRow.className).not.toContain('grid-cols-2');
    expect(incoming.parentElement).toBe(kpiRow);
    expect(outgoing.parentElement).toBe(kpiRow);
    expect(balance.parentElement).toBe(kpiRow);
    expect(kpiRow.childElementCount).toBe(3);
  });

  it('kasalar tablosunu üç kutunun altında tam genişlikte tutar', () => {
    renderScreen();

    const registers = screen.getByTestId('cash-status-registers');
    const kpiRow = screen.getByTestId('cash-status-kpi-row');
    expect(registers.className).toContain('w-full');
    expect(kpiRow.contains(registers)).toBe(false);
    const rootChildren = Array.from(registers.parentElement?.children ?? []);
    expect(rootChildren.indexOf(registers)).toBeGreaterThan(rootChildren.indexOf(kpiRow));
    expect(registers.parentElement?.className ?? '').not.toContain('lg:grid-cols-2');
    expect(registers.textContent).toContain('Kasalar');
    expect(registers.textContent).toContain('KASA.001 — MERKEZ KASA');
    expect(registers.textContent).toContain('KASA.002 — QICARD');
    expect(registers.textContent).toContain('225.000');
    expect(registers.textContent).toContain('Kasalar toplamı');

    const source = readFileSync(resolve('src/components/reports/CashStatusFigures.tsx'), 'utf8');
    expect(source).toContain('ReportColumnTable');
    expect(source).toContain('md:grid-cols-3');
    expect(source).not.toContain('<table');
    expect(source).not.toContain('lg:grid-cols-4');
    expect(source).not.toContain('cash-status-distribution');
    expect(source).not.toContain('cash-status-panels');
    expect(source).not.toContain('aside');

    const moduleSource = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    const cashBlock = moduleSource.slice(moduleSource.indexOf("selectedTab === 'cash-status'"));
    const nextTab = cashBlock.indexOf("selectedTab === 'payment-distribution'");
    const summary = nextTab > 0 ? cashBlock.slice(0, nextTab) : cashBlock;
    expect(moduleSource).toContain("tm('cashStatusTotalIn')");
    expect(summary).toContain('formulaBalance');
    expect(summary).not.toContain("tm('cardTypes')");
    expect(summary).not.toContain('cash-status-card-types');
    expect(summary).not.toContain('reservationDeposit={');
    expect(summary).not.toContain('paymentRows=');
  });
});
