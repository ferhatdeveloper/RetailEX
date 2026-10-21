import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

import { fireEvent, render, screen, within } from '@testing-library/react';
import { DashboardModule } from '../../../components/system/DashboardModule';
import {
    BACKOFFICE_GRAFANA_SIZE_KEY,
    CLINIC_V2_GRAFANA_SIZE_KEY,
} from '../../../components/beauty/components/ClinicGrafanaCardFrame';
import type { Customer, Product, Sale } from '../../../core/types';
import {
    BACKOFFICE_GRAFANA_PICKS_KEY,
    CLINIC_V2_GRAFANA_PICKS_KEY,
    clinicGrafanaCatalog,
    clinicGrafanaEmbedUrl,
} from '../../../utils/clinicDashboardRich';

vi.mock('../../../contexts/ThemeContext', () => ({
    useTheme: () => ({ darkMode: false }),
}));

vi.mock('../../../contexts/FirmaDonemContext', () => ({
    useFirmaDonem: () => ({
        selectedFirm: { firm_nr: 1, ana_para_birimi: 'IQD', firma_adi: 'Demo' },
        selectedPeriod: { nr: 1, donem_adi: '2026' },
    }),
}));

vi.mock('../../../contexts/LanguageContext', async () => {
    const modules = await vi.importActual<typeof import('../../../locales/module-translations')>(
        '../../../locales/module-translations',
    );
    const locale = await vi.importActual<typeof import('../../../locales/translations')>(
        '../../../locales/translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr',
            t: locale.translations.tr,
            tm: (key: string) => modules.translate(key, 'tr'),
        }),
    };
});

vi.mock('../../../hooks/useMenuFavorites', () => ({
    useMenuFavorites: () => ({
        favoriteIds: [] as string[],
        setFavorites: () => {},
        maxFavorites: 12,
    }),
}));

vi.mock('../../../services/layeredInventoryCost', () => ({
    fetchLayeredInventoryValuation: vi.fn(async () => null),
    layeredAvgForProduct: () => 0,
}));

vi.mock('../../../services/weightedAverageUnitCost', () => ({
    fetchWeightedAverageUnitCosts: vi.fn(async () => null),
    lookupWeightedAvgUnitCost: () => 0,
}));

const CLINIC_PICKS = JSON.stringify(['klinik-koru']);
const CLINIC_SIZE = JSON.stringify({ heights: { 'klinik-koru': 640 }, wideUid: 'klinik-koru' });

const boya: Product = {
    id: 'boya-1',
    code: 'BOYA',
    name: 'BOYA',
    barcode: 'BOYA',
    stock: 19,
    price: 10_000,
    cost: 10_000,
    average_unit_cost: 5_500,
    category: 'Boya',
    unit: 'AD',
    taxRate: 0,
};

function fiches(date: string): Sale[] {
    const base = {
        subtotal: 0,
        discount: 0,
        paymentMethod: 'Nakit',
        cashier: 'kasa',
    };
    return [
        {
            ...base,
            id: 'ret-1',
            receiptNumber: '0000003',
            date,
            status: 'return',
            total: -10_000,
            subtotal: -10_000,
            trcode: 3,
            items: [{ productId: 'boya-1', productName: 'BOYA', quantity: 1, price: 10_000, discount: 0, total: 10_000, cost: 10_000, lineType: 'Malzeme' }],
        },
        {
            ...base,
            id: 'srv-1',
            receiptNumber: 'BEA-2026-MVGYLBOM',
            date,
            status: 'completed',
            total: 110_000,
            subtotal: 110_000,
            items: [
                { productId: 'cut', productName: 'HAIR CUT', quantity: 1, price: 50_000, discount: 0, total: 50_000, lineType: 'Hizmet' },
                { productId: 'color', productName: 'HAIR PINK COLOR', quantity: 1, price: 60_000, discount: 0, total: 60_000, lineType: 'Hizmet' },
            ],
        },
        {
            ...base,
            id: 'sale-1',
            receiptNumber: 'BEA-2026-MVGZEUWF',
            date,
            status: 'completed',
            total: 20_000,
            subtotal: 20_000,
            items: [{ productId: 'boya-1', productName: 'BOYA', quantity: 2, price: 10_000, discount: 0, total: 20_000, cost: 10_000, lineType: 'Malzeme' }],
        },
        {
            ...base,
            id: 'dep-1',
            receiptNumber: 'PESINAT-20',
            date,
            status: 'completed',
            total: 20_000,
            subtotal: 20_000,
            isDeposit: true,
            items: [{ productId: 'dep', productName: 'PEŞİNAT', quantity: 1, price: 20_000, discount: 0, total: 20_000, lineType: 'Hizmet' }],
        },
    ] as Sale[];
}

describe('Backoffice Grafana rapor ızgarası', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 20, 18, 0, 0));
        localStorage.setItem(CLINIC_V2_GRAFANA_PICKS_KEY, CLINIC_PICKS);
        localStorage.setItem(CLINIC_V2_GRAFANA_SIZE_KEY, CLINIC_SIZE);
        localStorage.removeItem(BACKOFFICE_GRAFANA_PICKS_KEY);
        localStorage.removeItem(BACKOFFICE_GRAFANA_SIZE_KEY);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('günlük özetin altında ekle kartı vardır; kayıt ayrı anahtara yazılır', () => {
        const catalog = clinicGrafanaCatalog();
        const n = 2;
        expect(catalog.length).toBeGreaterThan(n);

        render(
            <DashboardModule
                products={[boya]}
                customers={[] as Customer[]}
                sales={fiches('2026-10-20T00:00:00.000Z')}
                setCurrentScreen={() => {}}
            />,
        );

        expect(screen.getAllByText(/120\.000/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/114\.500/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/104\.500/).length).toBeGreaterThan(0);

        const summary = screen.getByRole('heading', { name: 'Günlük Özet' });
        const grid = screen.getByTestId('backoffice-grafana-grid');
        const finance = screen.getByRole('heading', { name: 'Finansal Özet' });
        expect(summary.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(grid.compareDocumentPosition(finance) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(grid.getAttribute('data-picks-key')).toBe('retailex_backoffice_grafana_picks');
        expect(grid.getAttribute('data-size-key')).toBe('retailex_backoffice_grafana_size');
        expect(screen.queryByTestId('clinic-grafana-grid')).toBeNull();

        const add = within(grid).getByTestId('backoffice-grafana-add');
        expect(within(add).getByText('Rapor ekle')).toBeTruthy();
        expect(grid.lastElementChild).toBe(add);

        fireEvent.click(add);
        const dialog = screen.getByRole('dialog');
        for (let i = 1; i <= n; i += 1) {
            const boxes = within(dialog).getAllByRole('checkbox');
            fireEvent.click(boxes[i]);
        }
        fireEvent.click(within(dialog).getByTestId('backoffice-grafana-save'));

        expect(screen.queryByRole('dialog')).toBeNull();
        const cards = within(grid).getAllByTestId('clinic-grafana-card');
        expect(cards).toHaveLength(n);
        const stored = JSON.parse(localStorage.getItem(BACKOFFICE_GRAFANA_PICKS_KEY) || '[]') as string[];
        expect(stored).toHaveLength(n);
        expect(stored).toEqual(cards.map((node) => node.getAttribute('data-uid')));
        expect(catalog.some((row) => row.uid === stored[0])).toBe(true);
        const src = cards[0].querySelector('iframe')?.getAttribute('src') || '';
        expect(src).toBe(clinicGrafanaEmbedUrl(catalog.find((row) => row.uid === stored[0])!));
        expect(localStorage.getItem(CLINIC_V2_GRAFANA_PICKS_KEY)).toBe(CLINIC_PICKS);

        fireEvent.click(cards[0].querySelector('[data-testid="clinic-grafana-grow"]') as HTMLButtonElement);
        const size = JSON.parse(localStorage.getItem(BACKOFFICE_GRAFANA_SIZE_KEY) || '{}') as {
            heights: Record<string, number>;
        };
        expect(size.heights[stored[0]]).toBe(420);
        expect(localStorage.getItem(CLINIC_V2_GRAFANA_SIZE_KEY)).toBe(CLINIC_SIZE);
        expect(localStorage.getItem(CLINIC_V2_GRAFANA_PICKS_KEY)).toBe(CLINIC_PICKS);
    });
});
