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
            'menuColor',
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
        expect(nav.className).toContain('flex-col');
        expect(screen.queryByTestId('clinic-menu-palette-picker')).toBeNull();
        expect(screen.queryByTestId('clinic-custom-palette-form')).toBeNull();
        expect(screen.queryByTestId('clinic-menu-color-card')).toBeNull();
        expect(nav.closest('aside')?.querySelector('[data-testid="clinic-menu-palette-picker"]')).toBeNull();
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
        expect(screen.queryByTestId('clinic-menu-palette-picker')).toBeNull();

        const css = shell.querySelector('style')?.textContent ?? '';
        expect(css).toContain('font-size: 16.575px');
        expect(css).toContain('height: 70px');
        expect(css).toContain('height: 44px');
        expect(css).toContain('width: 230px');
        expect(css).toContain('background: #1b84ff');

        const src = readFileSync(resolve('src/components/beauty/components/ClinicOperationsHub.tsx'), 'utf8');
        expect(src).not.toContain('overflow-x-auto');
        expect(src).toContain('cops-save');
    });

    it('Menü rengi grubu seçilince palet formu ana içerikte render olur', async () => {
        render(<ClinicOperationsHub />);
        const nav = screen.getByTestId('clinic-ops-settings-nav');
        const panel = screen.getByTestId('clinic-ops-settings-panel');
        const aside = nav.closest('aside');
        const menu = screen.getByTestId('clinic-ops-settings-group-menuColor');

        expect(nav.contains(menu)).toBe(true);
        expect(menu.textContent).toBe('Menü rengi');
        expect(aside?.querySelector('[data-testid="clinic-custom-palette-form"]')).toBeNull();
        expect(screen.queryByTestId('clinic-menu-palette-picker')).toBeNull();
        expect(screen.queryByTestId('clinic-menu-color-card')).toBeNull();
        expect(await screen.findByText('Klinik analitik (90 gün)')).toBeTruthy();

        fireEvent.click(menu);

        const picker = screen.getByTestId('clinic-menu-palette-picker');
        const form = screen.getByTestId('clinic-custom-palette-form');
        expect(menu.getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Menü rengi');
        expect(picker.getAttribute('data-variant')).toBe('page');
        expect(panel.contains(picker)).toBe(true);
        expect(panel.contains(form)).toBe(true);
        expect(panel.contains(screen.getByTestId('clinic-font-settings'))).toBe(true);
        expect(panel.contains(screen.getByTestId('clinic-menu-palette-plum'))).toBe(true);
        expect(aside?.contains(picker)).toBe(false);
        expect(aside?.contains(form)).toBe(false);
        expect(nav.contains(form)).toBe(false);
        expect(screen.getAllByTestId('clinic-menu-palette-picker')).toHaveLength(1);
        expect(screen.getAllByTestId('clinic-custom-palette-form')).toHaveLength(1);
        expect(screen.getByTestId('clinic-menu-palette-plum').getAttribute('aria-pressed')).toBe('true');
        expect(form.textContent).toContain('Palet adı');
        expect(form.textContent).toContain('Arka plan');
        expect(form.textContent).toContain('Vurgu');
        expect(form.textContent).toContain('Yazı rengi');
        const html = panel.innerHTML;
        expect(html.indexOf('clinic-menu-palette-presets')).toBeLessThan(html.indexOf('clinic-custom-palette-form'));
        expect(html.indexOf('clinic-custom-palette-form')).toBeLessThan(html.indexOf('clinic-font-settings'));

        fireEvent.click(screen.getByTestId('clinic-ops-settings-group-overview'));
        expect(screen.queryByTestId('clinic-menu-palette-picker')).toBeNull();
        expect(screen.queryByTestId('clinic-custom-palette-form')).toBeNull();
        expect(aside?.querySelector('[data-testid="clinic-menu-palette-picker"]')).toBeNull();
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Özet');
        expect(await screen.findByText('Klinik analitik (90 gün)')).toBeTruthy();
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
        expect(screen.queryByTestId('clinic-font-family-serif')).toBeNull();

        fireEvent.click(screen.getByTestId('clinic-ops-settings-group-menuColor'));
        const panel = screen.getByTestId('clinic-ops-settings-panel');
        expect(screen.getByTestId('clinic-font-family-serif').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-font-size-xl').getAttribute('aria-pressed')).toBe('true');
        expect(panel.contains(screen.getByTestId('clinic-font-settings'))).toBe(true);
        expect(screen.getByTestId('clinic-ops-settings-nav').contains(screen.getByTestId('clinic-font-settings'))).toBe(false);
    });
});
