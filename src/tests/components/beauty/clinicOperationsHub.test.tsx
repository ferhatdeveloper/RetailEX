import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { CLINIC_CUSTOM_PALETTES_KEY, CLINIC_FONT_KEY, CLINIC_MENU_PALETTE_KEY } from '../../../components/beauty/clinicMenuPalette';
import {
    CLINIC_OPS_GROUPS,
    ClinicOperationsHub,
} from '../../../components/beauty/components/ClinicOperationsHub';

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

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: { id: 'u1' } }),
}));

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getClinicAnalytics: vi.fn(async () => ({
            noShowCount: 0,
            cancelledCount: 0,
            completedCount: 3,
            scheduledCount: 0,
            pendingBookingRequests: 0,
            waitlistActive: 0,
            consumableUsage30d: 0,
        })),
        getPortalSettings: vi.fn(async () => null),
        listNotificationQueue: vi.fn(async () => []),
        getBranches: vi.fn(async () => []),
        getRooms: vi.fn(async () => []),
        listAuditLog: vi.fn(async () => []),
    },
}));

describe('Klinik operasyon ayar kabuğu', () => {
    beforeEach(() => {
        localStorage.removeItem(CLINIC_MENU_PALETTE_KEY);
        localStorage.removeItem(CLINIC_CUSTOM_PALETTES_KEY);
        localStorage.removeItem(CLINIC_FONT_KEY);
    });

    it('ayar grupları solda listelenir ve seçilen form sağda kalır', async () => {
        expect(CLINIC_OPS_GROUPS.map((group) => group.id)).toEqual([
            'overview',
            'specialty',
            'portal',
            'locations',
            'wait',
            'clinical',
            'stock',
            'biz',
            'integrations',
            'audit',
        ]);
        for (const group of CLINIC_OPS_GROUPS) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(group.labelKey, lang);
                expect(label.trim().length).toBeGreaterThan(0);
                expect(label).not.toBe(group.labelKey);
            }
        }

        render(<ClinicOperationsHub />);
        const shell = screen.getByTestId('clinic-ops-settings');
        const nav = screen.getByTestId('clinic-ops-settings-nav');
        const panel = screen.getByTestId('clinic-ops-settings-panel');
        const card = screen.getByTestId('clinic-menu-color-card');
        expect(nav.className).toContain('flex-col');
        expect(card.contains(screen.getByTestId('clinic-menu-palette-picker'))).toBe(true);
        expect(card.contains(screen.getByTestId('clinic-custom-palette-form'))).toBe(true);
        expect(nav.closest('aside')?.contains(card)).toBe(true);
        expect(panel.contains(screen.getByTestId('clinic-custom-palette-form'))).toBe(false);
        expect(shell.innerHTML.indexOf('clinic-ops-settings-nav')).toBeLessThan(
            shell.innerHTML.indexOf('clinic-ops-settings-panel'),
        );

        for (const group of CLINIC_OPS_GROUPS) {
            const button = screen.getByTestId(`clinic-ops-settings-group-${group.id}`);
            expect(nav.contains(button)).toBe(true);
            expect(button.textContent).toBe(translate(group.labelKey, 'tr'));
        }

        const overview = screen.getByTestId('clinic-ops-settings-group-overview');
        expect(overview.getAttribute('aria-pressed')).toBe('true');
        const selectedStyle = overview.getAttribute('style') ?? '';
        expect(selectedStyle).toContain('rgb(27, 132, 255)');
        expect(selectedStyle).toContain('3px solid');
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Özet');
        expect(screen.getByRole('heading', { level: 1 }).className).toContain('cops-title');
        expect(await screen.findByText('Klinik analitik (90 gün)')).toBeTruthy();

        fireEvent.click(screen.getByTestId('clinic-ops-settings-group-locations'));
        expect(screen.getByTestId('clinic-ops-settings-group-locations').getAttribute('aria-pressed')).toBe('true');
        expect(overview.getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Şube / oda');
        expect(await screen.findByText('Şubeler')).toBeTruthy();
        expect(screen.queryByText('Klinik analitik (90 gün)')).toBeNull();
        expect(panel.contains(screen.getByText('Şubeler'))).toBe(true);
        expect(card.contains(screen.getByTestId('clinic-custom-palette-form'))).toBe(true);

        const css = shell.querySelector('style')?.textContent ?? '';
        expect(css).toContain('font-size: 16.575px');
        expect(css).toContain('height: 70px');
        expect(css).toContain('height: 44px');
        expect(css).toContain('width: 440px');
        expect(css).toContain('background: #1b84ff');

        const src = readFileSync(resolve('src/components/beauty/components/ClinicOperationsHub.tsx'), 'utf8');
        expect(src).not.toContain('overflow-x-auto');
        expect(src).toContain('cops-save');
        expect(src).toContain('<ClinicMenuPalettePicker variant="rail" />');
    });

    it('oluştur alanı Menü rengi kartında, grup listesinin üstünde render olur', () => {
        render(<ClinicOperationsHub />);
        const card = screen.getByTestId('clinic-menu-color-card');
        const form = screen.getByTestId('clinic-custom-palette-form');
        const nav = screen.getByTestId('clinic-ops-settings-nav');
        const picker = screen.getByTestId('clinic-menu-palette-picker');
        expect(picker.getAttribute('data-variant')).toBe('rail');
        expect(card.contains(picker)).toBe(true);
        expect(card.contains(form)).toBe(true);
        expect(card.contains(screen.getByTestId('clinic-font-settings'))).toBe(true);
        expect(card.contains(screen.getByTestId('clinic-menu-palette-plum'))).toBe(true);
        expect(card.textContent).toContain('Menü rengi');
        expect(form.textContent).toContain('Palet oluştur');
        expect(screen.getByTestId('clinic-custom-palette-save').textContent).toBe('Kaydet');
        expect(nav.contains(form)).toBe(false);
        expect(screen.getByTestId('clinic-ops-settings-panel').contains(form)).toBe(false);
        const html = nav.closest('aside')?.innerHTML ?? '';
        expect(html.indexOf('clinic-menu-palette-pearl')).toBeLessThan(html.indexOf('clinic-custom-palette-form'));
        expect(html.indexOf('clinic-custom-palette-form')).toBeLessThan(html.indexOf('clinic-font-settings'));
        expect(html.indexOf('clinic-font-settings')).toBeLessThan(html.indexOf('clinic-ops-settings-nav'));
        expect(screen.getByTestId('clinic-menu-palette-plum').getAttribute('aria-pressed')).toBe('true');
    });

    it('yazı tipi ve punto ayar kabuğunda kalır', async () => {
        localStorage.setItem(CLINIC_FONT_KEY, JSON.stringify({ family: 'serif', size: 'xl' }));
        render(<ClinicOperationsHub />);
        const shell = screen.getByTestId('clinic-ops-settings');
        expect(shell.getAttribute('data-font-family')).toBe('serif');
        expect(shell.getAttribute('data-font-size')).toBe('xl');
        expect(shell.getAttribute('style') ?? '').toContain('Georgia');
        expect(shell.getAttribute('style') ?? '').toContain('1.25');
        const css = shell.querySelector('style')?.textContent ?? '';
        expect(css).toContain('font-size: 16.575px');
        expect(css).toContain('calc(16.575px * var(--clinic-font-scale, 1))');
        expect(css).toContain('calc(14px * var(--clinic-font-scale, 1))');
        expect(screen.getByTestId('clinic-ops-settings-group-overview').getAttribute('style') ?? '').toContain('var(--clinic-font-scale, 1)');
        expect(await screen.findByText('Klinik analitik (90 gün)')).toBeTruthy();
        const card = screen.getByTestId('clinic-menu-color-card');
        expect(screen.getByTestId('clinic-font-family-serif').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-font-size-xl').getAttribute('aria-pressed')).toBe('true');
        expect(card.contains(screen.getByTestId('clinic-font-settings'))).toBe(true);
        expect(screen.getByTestId('clinic-ops-settings-nav').contains(screen.getByTestId('clinic-font-settings'))).toBe(false);
    });
});
