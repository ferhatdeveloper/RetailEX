import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '../../../contexts/LanguageContext';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { POSPaymentModal } from '../../../components/pos/POSPaymentModal';
import {
    CLINIC_CUSTOM_PALETTES_KEY,
    CLINIC_MENU_PALETTE_KEY,
    clinicMenuPaletteById,
    saveClinicCustomPalette,
} from '../../../components/beauty/clinicMenuPalette';

vi.mock('../../../contexts/FirmaDonemContext', () => ({
    useFirmaDonem: () => ({ selectedFirm: null }),
}));

vi.mock('../../../services/api/kasa', () => ({
    fetchKasalar: vi.fn(async () => []),
}));

vi.mock('../../../services/receiptSettingsService', async () => {
    const actual = await vi.importActual<typeof import('../../../services/receiptSettingsService')>(
        '../../../services/receiptSettingsService',
    );
    return {
        ...actual,
        getReceiptSettings: vi.fn(async () => ({})),
        saveReceiptSettings: vi.fn(async () => undefined),
    };
});

vi.mock('../../../services/reportMenuParamsService', async () => {
    const actual = await vi.importActual<typeof import('../../../services/reportMenuParamsService')>(
        '../../../services/reportMenuParamsService',
    );
    return {
        ...actual,
        loadReportMenuParams: vi.fn(async () => actual.getRuntimeReportMenuParams()),
    };
});

vi.mock('../../../services/api/customerDebtCollection', () => ({
    collectCustomerDebt: vi.fn(),
    collectCustomerBalanceOnly: vi.fn(),
    getCustomerOutstandingInvoices: vi.fn(async () => []),
    getCustomerOutstandingBalance: vi.fn(async () => ({
        customerId: 'roza',
        customerCode: null,
        customerName: 'ROZA',
        customerBalance: 10000,
        outstandingInvoices: [],
    })),
}));

function rgbOf(hex: string): string {
    const raw = hex.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
}

function expectPainted(actual: string, hex: string) {
    const compact = actual.replace(/\s/g, '').toLowerCase();
    const rgb = rgbOf(hex).replace(/\s/g, '').toLowerCase();
    expect(compact === hex.toLowerCase() || compact === rgb).toBe(true);
}

function renderPayment() {
    return render(
        <ThemeProvider>
            <LanguageProvider>
                <POSPaymentModal
                    total={50000}
                    subtotal={50000}
                    itemDiscount={0}
                    campaignDiscount={0}
                    selectedCustomer={{ id: 'roza', name: 'ROZA' } as never}
                    onClose={() => undefined}
                    onComplete={() => undefined}
                    onPrintDraftReceipt={() => undefined}
                />
            </LanguageProvider>
        </ThemeProvider>,
    );
}

describe('POSPaymentModal menü paleti', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('retailos_language', 'tr');
        localStorage.setItem('retailos_darkmode', 'false');
    });

    it('rose seçilince bu başlık gül vurgusunu kullanır', () => {
        localStorage.setItem(CLINIC_MENU_PALETTE_KEY, 'rose');
        const rose = clinicMenuPaletteById('rose');
        renderPayment();

        const header = screen.getByTestId('pos-payment-header');
        expect(header).toHaveTextContent('Ödeme Al');
        expectPainted(header.style.backgroundColor, rose.accent);
        expectPainted(header.style.color, rose.onAccent);

        expectPainted(screen.getByTestId('pos-payment-numpad').style.color, rose.onAccent);
        expectPainted(screen.getByTestId('pos-payment-numpad').style.borderColor, rose.accentEdge);
        expectPainted(screen.getByTestId('pos-payment-discount-percent').style.backgroundColor, rose.accent);
        expectPainted(screen.getByTestId('pos-payment-discount-5').style.borderColor, rose.accent);
        expectPainted(screen.getByTestId('pos-payment-discount-5').style.color, rose.accent);
        expectPainted(screen.getByTestId('pos-payment-total').style.color, rose.accent);
        expect(screen.getByTestId('pos-payment-total')).toHaveTextContent('50.000');
        expectPainted(screen.getByTestId('pos-payment-method-cash').style.borderColor, rose.accent);
        expectPainted(screen.getByTestId('pos-payment-quick-1000').style.color, rose.accent);
        expectPainted(screen.getByTestId('pos-payment-print').style.borderColor, rose.accent);

        expect(screen.getByTestId('pos-complete-payment-label').closest('button')).toHaveClass('bg-green-600');
        expect(screen.getByTestId('pos-write-remaining-to-cari')).toHaveClass('bg-orange-50');
        expect(screen.getByTestId('pos-write-remaining-to-cari')).toHaveTextContent('50.000');
    });

    it('anahtar yoksa başlık lavanta vurgusunu kullanır', () => {
        localStorage.removeItem(CLINIC_MENU_PALETTE_KEY);
        renderPayment();
        expectPainted(
            screen.getByTestId('pos-payment-header').style.backgroundColor,
            clinicMenuPaletteById('lavender').accent,
        );
    });

    it('özel palet seçilince başlık onun vurgu rengini kullanır', () => {
        const saved = saveClinicCustomPalette({
            name: 'Deniz',
            background: '#102033',
            accent: '#0f766e',
            text: '#f8fafc',
        });
        expect(saved.ok).toBe(true);
        if (!saved.ok) return;
        renderPayment();
        expect(localStorage.getItem(CLINIC_MENU_PALETTE_KEY)).toBe(saved.id);
        expect(localStorage.getItem(CLINIC_CUSTOM_PALETTES_KEY)).toContain(saved.id);
        expectPainted(
            screen.getByTestId('pos-payment-header').style.backgroundColor,
            saved.palette.accent,
        );
    });
});
