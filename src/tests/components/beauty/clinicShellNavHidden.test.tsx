import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import BeautyModule from '../../../components/beauty';
import {
    CLINIC_V2_CRM_MENU_KEY,
    CLINIC_V2_STORAGE_KEY,
} from '../../../components/beauty/clinicShellV2';
import { CLINIC_V2_RAIL_EXPANDED_KEY } from '../../../components/beauty/components/ClinicV2SideRail';

const navRole = vi.hoisted(() => ({
    name: 'cashier',
    id: 'cashier',
}));

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
    usePermission: () => ({
        hasPermission: () => true,
        user: { roles: [{ name: navRole.name, id: navRole.id }] },
    }),
}));

vi.mock('../../../components/beauty/components/ClinicDashboard', () => ({
    ClinicDashboard: () => <div data-testid="clinic-dashboard-stub" />,
}));

vi.mock('../../../components/reports/ReportsModule', () => ({
    ReportsModule: () => <div data-testid="reports-stub" />,
}));

vi.mock('../../../components/beauty/specialty/DentalChartScreen', () => ({
    DentalChartScreen: () => <div data-testid="dental-chart-stub" />,
}));

const HIDDEN_LABELS = ['Leads & CRM', 'Klinik operasyon'] as const;

const ROLES = [
    { name: 'cashier', id: 'cashier' },
    { name: 'Kasiyer', id: 'cashier' },
    { name: 'admin', id: 'admin' },
    { name: 'Yönetici', id: 'yonetici' },
    { name: 'Sistem Yöneticisi', id: 'admin' },
] as const;

function expectLabelsAbsent(root: HTMLElement) {
    const text = root.textContent ?? '';
    for (const label of HIDDEN_LABELS) {
        expect(text, label).not.toContain(label);
    }
}

function mountShell() {
    return render(
        <ThemeProvider>
            <BeautyModule />
        </ThemeProvider>,
    );
}

describe('Klinik kabuk menüsü Leads ve Klinik operasyonu her rolde gizler', () => {
    beforeEach(() => {
        navRole.name = 'cashier';
        navRole.id = 'cashier';
        localStorage.clear();
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    });

    it('ekranlar durur ve rol formu kaydırma işareti durur', () => {
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        const roleForm = readFileSync(resolve('src/components/system/RoleForm.tsx'), 'utf8');
        expect(indexSrc).toContain('<LeadManagement />');
        expect(indexSrc).toContain('<ClinicOperationsHub />');
        expect(indexSrc).toContain('<ClinicV2SettingsShell />');
        expect(roleForm).toContain('data-testid="role-form-scroll"');
    });

    it.each(ROLES)('klasik menü $name rolünde bu iki etiketi göstermez ve panele düşer', (role) => {
        navRole.name = role.name;
        navRole.id = role.id;
        localStorage.setItem('retailex_clinic_erp_specialty_001', 'beauty_default');
        const view = mountShell();
        const nav = screen.getByTestId('clinic-classic-nav');
        expectLabelsAbsent(nav);
        expect(nav.textContent).toContain('Müşteriler');
        expect(screen.getByTestId('clinic-dashboard-stub')).toBeTruthy();
        expect(screen.queryByTestId('clinic-v2-rail')).toBeNull();
        view.unmount();

        localStorage.setItem('retailex_clinic_erp_specialty_001', 'dental');
        const dental = mountShell();
        expectLabelsAbsent(screen.getByTestId('clinic-classic-nav'));
        expect(screen.getByTestId('dental-chart-stub')).toBeTruthy();
        expect(screen.queryByText('Leads & CRM')).toBeNull();
        expect(screen.queryByText('Klinik operasyon')).toBeNull();
        dental.unmount();
    });

    it.each(ROLES)('V2 menü $name rolünde CRM anahtarı açıkken de bu iki etiketi göstermez', (role) => {
        navRole.name = role.name;
        navRole.id = role.id;
        localStorage.setItem(CLINIC_V2_STORAGE_KEY, '1');
        localStorage.setItem(CLINIC_V2_CRM_MENU_KEY, '1');
        localStorage.setItem(CLINIC_V2_RAIL_EXPANDED_KEY, '1');
        const view = mountShell();
        const rail = screen.getByTestId('clinic-v2-rail');
        expect(rail.getAttribute('data-expanded')).toBe('1');
        expectLabelsAbsent(rail);
        expect(screen.queryByRole('button', { name: 'Leads & CRM' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Klinik operasyon' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Ayarlar' })).toBeNull();
        expect(rail.textContent).toContain('Müşteriler');
        expect(screen.getByTestId('clinic-dashboard-stub')).toBeTruthy();
        expect(screen.queryByTestId('clinic-classic-nav')).toBeNull();
        view.unmount();
    });
});
