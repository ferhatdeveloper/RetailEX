/**
 * @vitest-environment jsdom
 *
 * Kasa Durumu yerleşimi.
 * Özet tam üç kutudur. Zemin Günlük Rapor dolu kartlarıdır:
 * giren = Toplam Ciro mavisi, çıkan = Toplam Gider kırmızısı, bakiye = Net (Nakit) yeşili.
 * Yazı ve ikon beyazdır. Soluk çerçeve yoktur.
 * Açılış, günlük nakit, kapanış, avans, gider kartı, ödeme dağılımı ve kart türleri yoktur.
 * Kasalar tablosu altta tam genişliktedir. Tutarlar değişmez.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CashStatusFigures, gridHeightForRows, type CashStatusMovementLabels } from '../../components/reports/CashStatusFigures';
import { clinicDashboardKpiTone } from '../../utils/clinicDashboardKpiTones';
import {
  DAILY_REPORT_SOLID_CARD_FILL,
  dailyReportCardTone,
} from '../../utils/dailyReportScreenCards';

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

function cssColor(hex: string): string {
  const body = hex.replace('#', '');
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

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
  afterEach(() => {
    cleanup();
  });

  it('özeti üç kutuya indirir; kırmızı çizilen paneller yoktur', () => {
    const { container } = renderScreen();
    const text = container.textContent ?? '';

    const incoming = screen.getByTestId('cash-status-card-in');
    const outgoing = screen.getByTestId('cash-status-card-out');
    const balance = screen.getByTestId('cash-status-card-balance');

    const revenueTone = dailyReportCardTone('total-revenue');
    const expenseTone = dailyReportCardTone('total-expense');
    const netTone = dailyReportCardTone('net-cash');
    expect(revenueTone.background).toBe(DAILY_REPORT_SOLID_CARD_FILL['total-revenue']);
    expect(revenueTone.background).toBe(clinicDashboardKpiTone('completed').background);
    expect(expenseTone.background).toBe(DAILY_REPORT_SOLID_CARD_FILL['total-expense']);
    expect(expenseTone.background).toBe(clinicDashboardKpiTone('cancelled').background);
    expect(netTone.background).toBe(DAILY_REPORT_SOLID_CARD_FILL['net-cash']);
    expect(netTone.background).toBe(clinicDashboardKpiTone('collection').background);

    expect(incoming.textContent).toContain('Toplam giren');
    expect(incoming.textContent).toContain('263.500');
    expect(incoming.textContent).toContain('IQD');
    expect(incoming.getAttribute('data-cash-tone')).toBe('total-revenue');
    expect(incoming.style.backgroundColor).toBe(cssColor(revenueTone.background));
    expect(incoming.style.borderColor).toBe(cssColor(revenueTone.border));
    expect(incoming.className).not.toContain('bg-white');
    expect(incoming.className).not.toContain('border-blue-200');
    expect(incoming.className).not.toContain('border-2');

    expect(outgoing.textContent).toContain('Toplam çıkan');
    expect(outgoing.textContent).toContain('0');
    expect(outgoing.getAttribute('data-cash-tone')).toBe('total-expense');
    expect(outgoing.style.backgroundColor).toBe(cssColor(expenseTone.background));
    expect(outgoing.className).not.toContain('border-rose-200');
    expect(outgoing.className).not.toContain('bg-white');

    expect(balance.textContent).toContain('Bakiye');
    expect(balance.textContent).toContain('225.000');
    expect(balance.getAttribute('data-cash-tone')).toBe('net-cash');
    expect(balance.style.backgroundColor).toBe(cssColor(netTone.background));
    expect(balance.className).not.toContain('border-green-200');
    expect(balance.className).not.toContain('bg-white');
    expect(balance.textContent).toContain('Güncel kasa bakiyesi');

    for (const [card, tone] of [
      [incoming, revenueTone],
      [outgoing, expenseTone],
      [balance, netTone],
    ] as const) {
      const lines = card.querySelectorAll('p');
      const icon = card.querySelector('svg');
      expect(lines[0]?.style.color).toBe(cssColor(tone.label));
      expect(lines[1]?.style.color).toBe(cssColor(tone.value));
      expect(lines[2]?.style.color).toBe(cssColor(tone.hint));
      expect(icon?.style.color).toBe(cssColor(tone.accent));
      expect(tone.label).toBe('#ffffff');
      expect(tone.value).toBe('#ffffff');
      expect(tone.hint).toBe('#ffffff');
      expect(tone.accent).toBe('#ffffff');
    }

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
    expect(source).toContain("toneKey=\"total-revenue\"");
    expect(source).toContain("toneKey=\"total-expense\"");
    expect(source).toContain("toneKey=\"net-cash\"");
    expect(source).toContain('dailyReportCardTone');
    expect(source).not.toContain('border-blue-200');
    expect(source).not.toContain('border-rose-200');
    expect(source).not.toContain('border-green-200');
    expect(source).not.toContain('#2563eb');
    expect(source).not.toContain('#f04438');
    expect(source).not.toContain('#12b76a');
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

  it('kasa hareketlerini kasalar tablosunun içinde, pasta ve yöntem özeti olmadan gösterir', () => {
    const movementLabels: CashStatusMovementLabels = {
      title: 'Kasa Hareketleri',
      empty: 'Seçili aralıkta kasa hareketi yok.',
      total: 'Hareketler toplamı',
      date: 'Tarih',
      flow: 'Tip',
      party: 'Kategori / Müşteri',
      description: 'Açıklama',
      method: 'Yöntem',
      register: 'Kasa',
      amount: 'Tutar',
      flowIn: 'Gelir',
      flowOut: 'Gider',
      methodCash: 'Nakit',
      methodCard: 'Kredi kartı',
      methodTransfer: 'Havale',
      categories: {
        sale: 'Satış',
        deposit: 'Peşinat',
        collection: 'Tahsilat',
        openingDebit: 'Açılış borç',
        openingCredit: 'Açılış alacak',
        expense: 'Gider',
        payment: 'Cari ödeme',
        virman: 'Virman',
        bankIn: 'Bankadan çekilen',
        bankOut: 'Bankaya yatırılan',
        cashIn: 'Kasa giriş',
        cashOut: 'Kasa çıkış',
        other: 'Kasa hareketi',
      },
    };
    render(
      createElement(CashStatusFigures, {
        totalIn: 263_500,
        totalOut: 0,
        balance: 195_000,
        currency: 'IQD',
        labels: LABELS,
        movementLabels,
        registerLines: [
          { id: 'merkez', code: 'KASA.001', name: 'MERKEZ KASA', label: 'KASA.001 — MERKEZ KASA', amount: 195_000 },
          { id: 'qicard', code: 'KASA.002', name: 'QICARD', label: 'KASA.002 — QICARD', amount: 0 },
        ],
        movementRows: [
          {
            id: 'in',
            date: '2026-10-14',
            flow: 'gelir',
            amount: 1_367,
            method: 'nakit',
            party: 'Honda Türker',
            description: '4 taksitten 1. taksit',
            categoryCode: 'collection',
            typeCode: 'CH_TAHSILAT',
            ficheNo: 'T1',
            registerId: 'merkez',
            registerName: 'MERKEZ KASA',
          },
          {
            id: 'out',
            date: '2026-10-12',
            flow: 'gider',
            amount: -2_000,
            method: 'kart',
            party: 'Reklam',
            description: 'Instagram reklam',
            categoryCode: 'expense',
            typeCode: 'KASA_CIKIS',
            ficheNo: 'G1',
            registerId: 'qicard',
            registerName: 'QICARD',
          },
        ],
      }),
    );

    const registers = screen.getByTestId('cash-status-registers');
    const movements = screen.getByTestId('cash-status-movements');
    const kpiRow = screen.getByTestId('cash-status-kpi-row');
    expect(registers.contains(movements)).toBe(true);
    expect(kpiRow.contains(movements)).toBe(false);
    expect(registers.textContent?.indexOf('Kasa Hareketleri')).toBeGreaterThan(
      registers.textContent?.indexOf('Kasalar') ?? -1,
    );
    expect(movements.textContent).toContain('Tarih');
    expect(movements.textContent).toContain('Tip');
    expect(movements.textContent).toContain('Kategori / Müşteri');
    expect(movements.textContent).toContain('Açıklama');
    expect(movements.textContent).toContain('Yöntem');
    expect(movements.textContent).toContain('Tutar');
    expect(movements.textContent).toContain('Gelir');
    expect(movements.textContent).toContain('Gider');
    expect(movements.textContent).toContain('Honda Türker');
    expect(movements.textContent).toContain('Nakit');
    expect(movements.textContent).toContain('Kredi kartı');
    expect(movements.textContent).toContain('+1.367');
    expect(movements.textContent).toContain('-2.000');
    expect(movements.innerHTML).toContain('text-green-700');
    expect(movements.innerHTML).toContain('text-red-600');
    expect(screen.queryByText('Ödeme Dağılımı')).toBeNull();
    expect(screen.getByTestId('cash-status-card-in').textContent).toContain('263.500');
    expect(screen.getByTestId('cash-status-card-balance').textContent).toContain('195.000');

    const source = readFileSync(resolve('src/components/reports/CashStatusFigures.tsx'), 'utf8');
    expect(source).toContain('ReportColumnTable');
    expect(source).toContain('cash-status-movements');
    expect(source).not.toContain('<table');
    expect(source).not.toContain('PieChart');
    expect(source).not.toContain('Recharts');
  });

  it('kasa hareketleri tablosunda kasa adı kolonunu gösterir', () => {
    const movementLabels: CashStatusMovementLabels = {
      title: 'Kasa Hareketleri',
      empty: 'Seçili aralıkta kasa hareketi yok.',
      total: 'Hareketler toplamı',
      date: 'Tarih',
      flow: 'Tip',
      party: 'Kategori / Müşteri',
      description: 'Açıklama',
      method: 'Yöntem',
      register: 'Kasa',
      amount: 'Tutar',
      flowIn: 'Gelir',
      flowOut: 'Gider',
      methodCash: 'Nakit',
      methodCard: 'Kredi kartı',
      methodTransfer: 'Havale',
      categories: {
        sale: 'Satış',
        deposit: 'Peşinat',
        collection: 'Tahsilat',
        openingDebit: 'Açılış borç',
        openingCredit: 'Açılış alacak',
        expense: 'Gider',
        payment: 'Cari ödeme',
        virman: 'Virman',
        bankIn: 'Bankadan çekilen',
        bankOut: 'Bankaya yatırılan',
        cashIn: 'Kasa giriş',
        cashOut: 'Kasa çıkış',
        other: 'Kasa hareketi',
      },
    };
    render(
      createElement(CashStatusFigures, {
        totalIn: 263_500,
        totalOut: 0,
        balance: 195_000,
        currency: 'IQD',
        labels: LABELS,
        movementLabels,
        registerLines: [
          { id: 'merkez', code: 'KASA.001', name: 'MERKEZ KASA', label: 'KASA.001 — MERKEZ KASA', amount: 195_000 },
        ],
        movementRows: [
          {
            id: 'in',
            date: '2026-10-14',
            flow: 'gelir',
            amount: 1_367,
            method: 'nakit',
            party: 'Honda Türker',
            description: 'Tahsilat',
            categoryCode: 'collection',
            typeCode: 'CH_TAHSILAT',
            ficheNo: 'T1',
            registerId: 'merkez',
            registerName: 'MERKEZ KASA',
          },
        ],
      }),
    );

    const movements = screen.getByTestId('cash-status-movements');
    // Kolon başlığı görünür.
    expect(movements.textContent).toContain('Kasa');
    // Satırda kasa adı yazılır.
    expect(movements.textContent).toContain('MERKEZ KASA');
  });

  it('kasalar tablosunun yüksekliği satır sayısına göre sıkı hesaplanır (boşluk yok)', () => {
    // Ölçülen chrome: toolbar 39 + başlık 23 + tfoot 29 + sayfalama 59 = 150px.
    // Satır 22px. 2 satır → 150 + 44 = 194px.
    // Eski formül 332px veriyordu (içinde ~130px boşluk).
    expect(gridHeightForRows(2, 420)).toBe(194);
    // 1 satır → 150 + 22 = 172, minimum 180px'e yükseltilir.
    expect(gridHeightForRows(1, 420)).toBe(180);
    // 0 satır → minimum 180px.
    expect(gridHeightForRows(0, 420)).toBe(180);
    // Çok satır → üst sınır uygulanır.
    expect(gridHeightForRows(100, 420)).toBe(420);
    expect(gridHeightForRows(100, 560)).toBe(560);
    // 14 satır → 150 + 308 = 458 (üst sınır 560 değil).
    expect(gridHeightForRows(14, 560)).toBe(458);
    // 5 satır → 150 + 110 = 260.
    expect(gridHeightForRows(5, 560)).toBe(260);

    const source = readFileSync(resolve('src/components/reports/CashStatusFigures.tsx'), 'utf8');
    // Eski, boşluk bırakan formül artık kullanılmıyor.
    expect(source).not.toContain('260 + registerLines.length');
    expect(source).not.toContain('height={480}');
  });
});
