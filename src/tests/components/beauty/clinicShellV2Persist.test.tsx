import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { CLINIC_V2_STORAGE_KEY } from '../../../components/beauty/clinicShellV2';
import { BeautyShellChromeButtons } from '../../../components/beauty/components/BeautyShellChrome';
import BeautyModule from '../../../components/beauty';
import { ThemeProvider } from '../../../contexts/ThemeContext';

const ZOOM_KEY = 'retailos_zoom_level';
const GRAFANA_SIZE_KEY = 'retailex_clinic_v2_grafana_size';
const GRAFANA_PICKS_KEY = 'retailex_clinic_v2_grafana_picks';
const RAIL_KEY = 'retailex_clinic_v2_rail_expanded';

vi.mock('../../../contexts/LanguageContext', async () => {
    const actual = await vi.importActual<typeof import('../../../locales/module-translations')>(
        '../../../locales/module-translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr',
            t: new Proxy({} as Record<string, string>, {
                get: (_target, prop) => String(prop),
            }),
            tm: (key: string) => actual.translate(key, 'tr'),
        }),
    };
});

vi.mock('../../../contexts/FirmaDonemContext', async () => {
    const actual = await vi.importActual<typeof import('../../../contexts/FirmaDonemContext')>(
        '../../../contexts/FirmaDonemContext',
    );
    return {
        ...actual,
        useFirmaDonem: () => ({ selectedFirm: null }),
    };
});

vi.mock('../../../shared/hooks/usePermission', () => ({
    usePermission: () => ({ hasPermission: () => true }),
}));

vi.mock('../../../components/beauty/components/ClinicDashboard', () => ({
    ClinicDashboard: () => <div data-testid="clinic-dashboard-stub" />,
}));

vi.mock('../../../components/reports/ReportsModule', () => ({
    ReportsModule: () => <div data-testid="reports-stub" />,
}));

function v2Button() {
    return screen.getByRole('button', { name: translate('bClinicV2Toggle', 'tr') });
}

describe('Klinik kabuğu V2 seçimi', () => {
    beforeEach(() => {
        localStorage.removeItem(CLINIC_V2_STORAGE_KEY);
    });

    it('tıklama 1 yazar, kapatma 0 yazar', () => {
        const untouched = [ZOOM_KEY, GRAFANA_SIZE_KEY, GRAFANA_PICKS_KEY, RAIL_KEY].map((key) => [
            key,
            localStorage.getItem(key),
        ]);

        render(<BeautyShellChromeButtons />);
        const button = v2Button();
        expect(button.getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(button);
        expect(localStorage.getItem(CLINIC_V2_STORAGE_KEY)).toBe('1');
        expect(button.getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(button);
        expect(localStorage.getItem(CLINIC_V2_STORAGE_KEY)).toBe('0');
        expect(button.getAttribute('aria-pressed')).toBe('false');

        for (const [key, value] of untouched) {
            expect(localStorage.getItem(key)).toBe(value);
        }
    });

    it('ilk okuma 1 ise kabuk V2 açılır, 0 ise V1 kalır', () => {
        localStorage.setItem(CLINIC_V2_STORAGE_KEY, '1');
        const open = render(
            <ThemeProvider>
                <BeautyModule />
            </ThemeProvider>,
        );
        expect(screen.getByTestId('clinic-v2-rail')).toBeTruthy();
        expect(v2Button().getAttribute('aria-pressed')).toBe('true');
        open.unmount();

        localStorage.setItem(CLINIC_V2_STORAGE_KEY, '0');
        render(
            <ThemeProvider>
                <BeautyModule />
            </ThemeProvider>,
        );
        expect(screen.queryByTestId('clinic-v2-rail')).toBeNull();
        expect(v2Button().getAttribute('aria-pressed')).toBe('false');
    });
});
