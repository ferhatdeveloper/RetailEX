import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ClinicV2SideRail, CLINIC_V2_RAIL_ITEMS } from '../../../components/beauty/components/ClinicV2SideRail';

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
    'bShellNavClients',
    'bShellNavCalendar',
    'bShellNavServices',
    'bShellNavStaff',
    'bShellNavClinicOps',
    'bSatisfactionSurveysTitle',
];

describe('Klinik V2 sol şerit', () => {
    it('V2 kapalıyken eski menü maddeleri kaynakta durur', () => {
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(indexSrc).toContain('background: shell.sidebar');
        expect(indexSrc).toContain('CLINIC_CLASSIC_SHELL');
        expect(indexSrc).toContain('{!surveyOverlayOpen && !shellV2 && (');
        expect(indexSrc).toContain('<ClinicBoardPage');
        expect(indexSrc).not.toContain('ClinicDashboardV2');
        for (const marker of V1_MENU_MARKERS) {
            expect(indexSrc.includes(marker), marker).toBe(true);
        }
        const ops = indexSrc.indexOf("title: tm('bShellMenuOperations')");
        const clientsAt = indexSrc.indexOf("id: 'clients'", ops);
        const calendarAt = indexSrc.indexOf("id: 'calendar'", ops);
        expect(clientsAt).toBeGreaterThan(ops);
        expect(calendarAt).toBeGreaterThan(clientsAt);
    });

    it('V2 açıkken dar menüde kısa etiketler görünür ve mevcut sekmeyi açar', () => {
        expect(CLINIC_V2_RAIL_ITEMS.map((item) => item.id)).toEqual([
            'calendar',
            'clients',
            'staff',
            'services',
            'clinic_ops',
        ]);
        for (const item of CLINIC_V2_RAIL_ITEMS) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(item.labelKey, lang);
                expect(label.trim().length).toBeGreaterThan(0);
                expect(label).not.toBe(item.labelKey);
            }
        }
        expect(translate('bClinicV2RailAppointment', 'tr')).toBe('Randevu');
        expect(translate('bClinicV2RailClients', 'tr')).toBe('Müşteriler');
        expect(translate('bClinicV2RailStaff', 'tr')).toBe('Personel');
        expect(translate('bClinicV2RailService', 'tr')).toBe('Hizmet');
        expect(translate('bClinicV2RailSettings', 'tr')).toBe('Ayarlar');

        const onSelect = vi.fn();
        const { rerender } = render(
            <ClinicV2SideRail activeTab="dashboard" onSelect={onSelect} isMobile={false} mobileOpen={false} />,
        );

        for (const label of ['Randevu', 'Müşteriler', 'Personel', 'Hizmet', 'Ayarlar']) {
            expect(screen.getByRole('button', { name: label })).toBeTruthy();
        }
        expect(screen.queryByText('Randevu tahtası')).toBeNull();
        expect(screen.queryByText('Memnuniyet anketleri')).toBeNull();
        expect(screen.queryByText('Klinik operasyon')).toBeNull();
        expect(screen.getByRole('button', { name: 'Dashboard' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: 'Randevu' }).getAttribute('aria-pressed')).toBe('false');

        fireEvent.click(screen.getByRole('button', { name: 'Müşteriler' }));
        expect(onSelect).toHaveBeenCalledWith('clients');
        fireEvent.click(screen.getByRole('button', { name: 'Randevu' }));
        expect(onSelect).toHaveBeenCalledWith('calendar');
        fireEvent.click(screen.getByRole('button', { name: 'Ayarlar' }));
        expect(onSelect).toHaveBeenCalledWith('clinic_ops');

        rerender(<ClinicV2SideRail activeTab="calendar" onSelect={onSelect} isMobile={false} mobileOpen={false} />);
        expect(screen.getByRole('button', { name: 'Randevu' }).getAttribute('aria-pressed')).toBe('true');

        rerender(<ClinicV2SideRail activeTab="clinic_board" onSelect={onSelect} isMobile={false} mobileOpen={false} />);
        expect(screen.getByRole('button', { name: 'Randevu' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Randevu' }));
        expect(onSelect).toHaveBeenLastCalledWith('calendar');
    });
});
