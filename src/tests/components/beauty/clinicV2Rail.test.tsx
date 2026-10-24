import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import {
    CLINIC_V2_CRM_MENU_KEY,
    clinicV2TabAfterCrmMenu,
} from '../../../components/beauty/clinicShellV2';
import {
    CLINIC_V2_RAIL_EXPANDED_KEY,
    CLINIC_V2_RAIL_GROUPS,
    ClinicV2SideRail,
} from '../../../components/beauty/components/ClinicV2SideRail';

vi.mock('../../../contexts/LanguageContext', async () => {
    const actual = await vi.importActual<typeof import('../../../locales/module-translations')>(
        '../../../locales/module-translations',
    );
    return {
        useLanguage: () => ({
            language: 'tr',
            tm: (key: string) => actual.translate(key, 'tr'),
        }),
    };
});

vi.mock('../../../shared/hooks/usePermission', () => ({
    usePermission: () => ({ hasPermission: () => true }),
}));

const V1_MENU_MARKERS = [
    "id: 'dashboard'",
    'CLINIC_BOARD_SHELL_TAB_ID',
    "id: 'clients'",
    "id: 'calendar'",
    "id: 'services'",
    "id: 'staff'",
    "id: 'clinic_ops'",
    "id: 'leads'",
    'bShellNavClients',
    'bShellNavCalendar',
    'bShellNavServices',
    'bShellNavStaff',
    'bShellNavClinicOps',
    'bSatisfactionSurveysTitle',
];

describe('Klinik V2 sol şerit', () => {
    beforeEach(() => {
        localStorage.removeItem(CLINIC_V2_RAIL_EXPANDED_KEY);
        localStorage.removeItem(CLINIC_V2_CRM_MENU_KEY);
    });

    it('V2 kapalıyken eski menü maddeleri kaynakta durur', () => {
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(indexSrc).toContain('background: shell.sidebar');
        expect(indexSrc).toContain('useClinicMenuPalette');
        expect(indexSrc).toContain('{!surveyOverlayOpen && !shellV2 && (');
        expect(indexSrc).toContain('<ClinicBoardPage');
        expect(indexSrc).not.toContain('ClinicDashboardV2');
        expect(indexSrc).toContain("id: 'reports'");
        expect(indexSrc).toContain("activeTab === 'reports'");
        expect(indexSrc).toContain('activeTab === CLINIC_REPORT_CENTER_TAB');
        expect(indexSrc).toContain('setActiveTab(GENERAL_REPORTS_TAB)');
        expect(indexSrc).toContain('<ClinicReportCenter');
        for (const marker of V1_MENU_MARKERS) {
            expect(indexSrc.includes(marker), marker).toBe(true);
        }
        const ops = indexSrc.indexOf("title: tm('bShellMenuOperations')");
        const clientsAt = indexSrc.indexOf("id: 'clients'", ops);
        const calendarAt = indexSrc.indexOf("id: 'calendar'", ops);
        expect(clientsAt).toBeGreaterThan(ops);
        expect(calendarAt).toBeGreaterThan(clientsAt);
    });

    it('dar halde kısa etiket, geniş halde grup ve alt madde görünür', () => {
        expect(CLINIC_V2_RAIL_GROUPS.map((group) => group.id)).toEqual([
            'home',
            'appointments',
            'customers',
            'inbox',
            'catalog',
            'expenses',
            'reports',
            'settings',
        ]);
        const railIds = CLINIC_V2_RAIL_GROUPS.flatMap((group) => group.items.map((item) => item.id));
        expect(railIds).not.toContain('staff');
        expect(railIds).not.toContain('services');
        expect(CLINIC_V2_RAIL_GROUPS.find((group) => group.id === 'catalog')?.items.map((item) => item.id)).toEqual([
            'packages',
            'product_sales',
            'service_recipes',
            'devices',
        ]);
        expect(railIds).toContain('clinic_ops');
        expect(CLINIC_V2_RAIL_GROUPS.find((group) => group.id === 'reports')?.items.map((item) => item.id)).toEqual([
            'clinic_reports',
        ]);
        expect(CLINIC_V2_RAIL_GROUPS.find((group) => group.id === 'appointments')?.items.map((item) => item.id)).toEqual([
            'calendar',
            'clinic_board',
            'share_open_slots',
        ]);
        const labelKeys = [
            'bClinicV2RailHome',
            'bClinicV2RailCalendar',
            'bClinicV2RailExpenseShort',
            'bClinicV2RailReportShort',
            'bClinicV2RailExpand',
            'bClinicV2RailCollapse',
            ...CLINIC_V2_RAIL_GROUPS.flatMap((group) => [group.shortKey, group.titleKey, ...group.items.map((item) => item.labelKey)]),
        ];
        for (const key of labelKeys) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(key, lang);
                expect(label.trim().length, `${key}:${lang}`).toBeGreaterThan(0);
                expect(label, key).not.toBe(key);
            }
        }

        const onSelect = vi.fn();
        const view = render(
            <ClinicV2SideRail activeTab="dashboard" onSelect={onSelect} isMobile={false} mobileOpen={false} />,
        );

        expect(screen.getByTestId('clinic-v2-rail').getAttribute('data-expanded')).toBe('0');
        for (const label of ['Anasayfa', 'Randevu', 'Müşteriler', 'Hizmet', 'Gider', 'Rapor', 'Ayarlar']) {
            expect(screen.getByRole('button', { name: label })).toBeTruthy();
        }
        expect(screen.queryByRole('button', { name: 'Personel' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Leads & CRM' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'CRM' })).toBeNull();
        expect(screen.queryByText('Randevu takvimi')).toBeNull();
        expect(screen.queryByText('Randevu tahtası')).toBeNull();
        expect(screen.queryByText('Memnuniyet anketleri')).toBeNull();
        expect(screen.getByRole('button', { name: 'Anasayfa' }).getAttribute('aria-pressed')).toBe('true');

        fireEvent.click(screen.getByRole('button', { name: 'Müşteriler' }));
        expect(onSelect).toHaveBeenCalledWith('clients');
        fireEvent.click(screen.getByRole('button', { name: 'Randevu' }));
        expect(onSelect).toHaveBeenCalledWith('calendar');
        fireEvent.click(screen.getByRole('button', { name: 'Rapor' }));
        expect(onSelect).toHaveBeenCalledWith('clinic_reports');
        expect(onSelect).not.toHaveBeenCalledWith('reports');

        fireEvent.click(screen.getByRole('button', { name: 'Menüyü genişlet' }));
        expect(localStorage.getItem(CLINIC_V2_RAIL_EXPANDED_KEY)).toBe('1');
        expect(screen.getByTestId('clinic-v2-group-appointments').textContent).toBe('Randevu');
        expect(screen.getByTestId('clinic-v2-group-customers').textContent).toBe('Müşteriler');
        expect(screen.getByTestId('clinic-v2-group-catalog').textContent).toBe('Hizmetler');
        expect(screen.getByRole('button', { name: 'Randevu takvimi' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Randevu tahtası' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Memnuniyet anketleri' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Leads & CRM' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Giderler' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Raporlar' })).toBeTruthy();
        expect(screen.queryByText('Klinik operasyon')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Randevu takvimi' }));
        expect(onSelect).toHaveBeenCalledWith('calendar');
        fireEvent.click(screen.getByRole('button', { name: 'Randevu tahtası' }));
        expect(onSelect).toHaveBeenCalledWith('clinic_board');
        fireEvent.click(screen.getByRole('button', { name: 'Boş saatleri paylaş' }));
        expect(onSelect).toHaveBeenCalledWith('share_open_slots');
        fireEvent.click(screen.getByRole('button', { name: 'Gelen kutu' }));
        expect(onSelect).toHaveBeenCalledWith('clinic_inbox');
        fireEvent.click(screen.getByRole('button', { name: 'Ayarlar' }));
        expect(onSelect).toHaveBeenCalledWith('clinic_ops');
        fireEvent.click(screen.getByRole('button', { name: 'Giderler' }));
        expect(onSelect).toHaveBeenCalledWith('expenses');
        fireEvent.click(screen.getByRole('button', { name: 'Raporlar' }));
        expect(onSelect).toHaveBeenCalledWith('clinic_reports');
        expect(onSelect.mock.calls.filter((call) => call[0] === 'reports')).toHaveLength(0);

        view.unmount();
        render(<ClinicV2SideRail activeTab="clinic_board" onSelect={onSelect} isMobile={false} mobileOpen={false} />);
        expect(screen.getByTestId('clinic-v2-rail').getAttribute('data-expanded')).toBe('1');
        expect(screen.getByRole('button', { name: 'Randevu tahtası' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('CRM menü anahtarı açıkken Leads & CRM geniş menüde görünür', () => {
        localStorage.setItem(CLINIC_V2_CRM_MENU_KEY, '1');
        localStorage.setItem(CLINIC_V2_RAIL_EXPANDED_KEY, '1');
        const onSelect = vi.fn();
        render(<ClinicV2SideRail activeTab="dashboard" onSelect={onSelect} isMobile={false} mobileOpen={false} />);
        const crm = screen.getByRole('button', { name: 'Leads & CRM' });
        expect(crm).toBeTruthy();
        fireEvent.click(crm);
        expect(onSelect).toHaveBeenCalledWith('leads');
    });

    it('CRM kapalıyken leads sekmesi anasayfaya döner, açıkken kalır', () => {
        expect(clinicV2TabAfterCrmMenu('leads', false)).toBe('dashboard');
        expect(clinicV2TabAfterCrmMenu('leads', true)).toBe('leads');
        expect(clinicV2TabAfterCrmMenu('clients', false)).toBe('clients');
        expect(clinicV2TabAfterCrmMenu('clinic_ops', false)).toBe('clinic_ops');
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(indexSrc).toContain('if (!shellV2) return;');
        expect(indexSrc).toContain('clinicV2TabAfterCrmMenu(activeTab, crmMenuOn)');
        expect(indexSrc).toContain("{activeTab === 'leads' && (!shellV2 || crmMenuOn) && <LeadManagement />}");
    });
});
