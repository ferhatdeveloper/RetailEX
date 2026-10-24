import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { translate } from '../../../locales/module-translations';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import BeautyModule from '../../../components/beauty';
import { ClinicMenuPalettePicker } from '../../../components/beauty/components/ClinicMenuPalettePicker';
import {
    CLINIC_MENU_PALETTE_KEY,
    CLINIC_MENU_PALETTES,
    clinicMenuPaletteById,
    readClinicMenuPaletteId,
} from '../../../components/beauty/clinicMenuPalette';
import { CLINIC_CLASSIC_SHELL, CLINIC_V2_CRM_MENU_KEY, CLINIC_V2_STORAGE_KEY } from '../../../components/beauty/clinicShellV2';

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

function channel(hex: string, index: number): number {
    const raw = hex.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    const value = parseInt(full.slice(index * 2, index * 2 + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a: string, b: string): number {
    const lum = (hex: string) => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
    const hi = Math.max(lum(a), lum(b));
    const lo = Math.min(lum(a), lum(b));
    return (hi + 0.05) / (lo + 0.05);
}

function hexToRgb(hex: string): string {
    const raw = hex.replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
}

function expectStyleToken(el: HTMLElement, token: string) {
    const style = el.getAttribute('style') ?? '';
    if (token.startsWith('#')) {
        expect(style).toContain(hexToRgb(token));
        return;
    }
    const nums = token.match(/[\d.]+/g);
    if (token.startsWith('rgba') && nums && nums.length >= 4) {
        expect(style).toContain(`rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${nums[3]})`);
        return;
    }
    expect(style).toContain(token);
}

function mountClinic() {
    return render(
        <ThemeProvider>
            <BeautyModule />
            <ClinicMenuPalettePicker />
        </ThemeProvider>,
    );
}

describe('Klinik menü renk paleti', () => {
    beforeEach(() => {
        localStorage.removeItem(CLINIC_MENU_PALETTE_KEY);
        localStorage.removeItem(CLINIC_V2_STORAGE_KEY);
        localStorage.removeItem(CLINIC_V2_CRM_MENU_KEY);
    });

    it('varsayılan mor palettir ve gül seçilince menü o tokenları kullanır', () => {
        const plum = clinicMenuPaletteById('plum');
        const rose = clinicMenuPaletteById('rose');
        expect(readClinicMenuPaletteId()).toBe('plum');
        expect(plum.sidebar).toBe('#12082a');
        expect(plum.sidebar).toBe(CLINIC_CLASSIC_SHELL.sidebar);
        expect(plum.accent).toBe('#7c3aed');
        expect(plum.accent).toBe(CLINIC_CLASSIC_SHELL.accent);
        expect(plum.accentEdge).toBe(CLINIC_CLASSIC_SHELL.accentEdge);
        expect(plum.item).toBe('rgba(196,181,253,0.65)');
        expect(plum.onAccent).toBe('#ffffff');

        mountClinic();
        const nav = screen.getByTestId('clinic-classic-nav');
        expect(nav.getAttribute('data-palette')).toBe('plum');
        expectStyleToken(nav, plum.sidebar);
        expectStyleToken(nav, plum.sidebarLine);

        const dashboard = screen.getByRole('button', { name: 'Dashboard' });
        const clients = screen.getByRole('button', { name: 'Müşteriler' });
        expectStyleToken(dashboard, plum.accent);
        expectStyleToken(dashboard, plum.onAccent);
        expectStyleToken(clients, plum.item);
        expectStyleToken(screen.getByText('Operasyonlar'), plum.group);
        expect(screen.getByTestId('clinic-menu-palette-plum').getAttribute('aria-pressed')).toBe('true');

        const crmBefore = localStorage.getItem(CLINIC_V2_CRM_MENU_KEY);
        const shellBefore = localStorage.getItem(CLINIC_V2_STORAGE_KEY);
        fireEvent.click(screen.getByTestId('clinic-menu-palette-rose'));

        expect(localStorage.getItem(CLINIC_MENU_PALETTE_KEY)).toBe('rose');
        expect(localStorage.getItem(CLINIC_V2_CRM_MENU_KEY)).toBe(crmBefore);
        expect(localStorage.getItem(CLINIC_V2_STORAGE_KEY)).toBe(shellBefore);
        expect(nav.getAttribute('data-palette')).toBe('rose');
        expectStyleToken(nav, rose.sidebar);
        expectStyleToken(nav, rose.sidebarLine);
        expectStyleToken(dashboard, rose.accent);
        expectStyleToken(dashboard, rose.accentEdge);
        expectStyleToken(dashboard, rose.onAccent);
        expectStyleToken(clients, rose.item);
        expectStyleToken(screen.getByText('Operasyonlar'), rose.group);
        expectStyleToken(screen.getByText('ClinicERP'), rose.text);
        expect(screen.getByTestId('clinic-menu-palette-rose').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-menu-palette-rose').textContent).toBe('Gül');
    });

    it('kayıt anahtarda kalır, bilinmeyen değer mora döner', () => {
        localStorage.setItem(CLINIC_MENU_PALETTE_KEY, 'rose');
        const first = mountClinic();
        expect(screen.getByTestId('clinic-classic-nav').getAttribute('data-palette')).toBe('rose');
        expectStyleToken(screen.getByTestId('clinic-classic-nav'), clinicMenuPaletteById('rose').sidebar);
        first.unmount();

        localStorage.setItem(CLINIC_MENU_PALETTE_KEY, 'Gül');
        const second = mountClinic();
        expect(readClinicMenuPaletteId()).toBe('plum');
        expect(screen.getByTestId('clinic-classic-nav').getAttribute('data-palette')).toBe('plum');
        second.unmount();
    });

    it('palet adları dört dilde dolu ve seçim Klinik operasyon kabuğundadır', () => {
        const names: Record<string, Record<string, string>> = {
            plum: { tr: 'Mor', en: 'Plum', ar: 'بنفسجي', ku: 'مۆر' },
            rose: { tr: 'Gül', en: 'Rose', ar: 'وردي', ku: 'گوڵ' },
            lavender: { tr: 'Lavanta', en: 'Lavender', ar: 'خزامى', ku: 'لاڤەندەر' },
            sage: { tr: 'Adaçayı', en: 'Sage', ar: 'مريمية', ku: 'چای مریەم' },
            champagne: { tr: 'Şampanya', en: 'Champagne', ar: 'شمبانيا', ku: 'شامپانیا' },
            navy: { tr: 'Gece lacivert', en: 'Night navy', ar: 'كحلي ليلي', ku: 'شینی شەو' },
        };
        expect(CLINIC_MENU_PALETTES.map((palette) => palette.id)).toEqual([
            'plum',
            'rose',
            'lavender',
            'sage',
            'champagne',
            'navy',
        ]);
        for (const palette of CLINIC_MENU_PALETTES) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                expect(translate(palette.nameKey, lang)).toBe(names[palette.id][lang]);
                expect(translate('bClinicMenuPaletteTitle', lang).trim().length).toBeGreaterThan(0);
                expect(translate('bClinicMenuPaletteHint', lang)).not.toBe('bClinicMenuPaletteHint');
            }
            if (palette.tone === 'light') {
                expect(contrast(palette.sidebar, palette.text)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(palette.sidebar, palette.item)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(palette.sidebar, palette.muted)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(palette.sidebar, palette.group)).toBeGreaterThanOrEqual(4.5);
            }
            if (!palette.muted.startsWith('rgba')) {
                expect(contrast(palette.sidebar, palette.text)).toBeGreaterThanOrEqual(4.5);
                expect(contrast(palette.sidebar, palette.item)).toBeGreaterThanOrEqual(4.5);
            }
            expect(contrast(palette.accent, palette.onAccent)).toBeGreaterThanOrEqual(4.5);
        }

        const hub = readFileSync(resolve('src/components/beauty/components/ClinicOperationsHub.tsx'), 'utf8');
        const v2 = readFileSync(resolve('src/components/beauty/components/ClinicV2SettingsShell.tsx'), 'utf8');
        const rail = readFileSync(resolve('src/components/beauty/components/ClinicV2SideRail.tsx'), 'utf8');
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(hub).toContain('<ClinicMenuPalettePicker />');
        expect(v2).not.toContain('ClinicMenuPalettePicker');
        expect(rail).not.toContain('useClinicMenuPalette');
        expect(indexSrc).toContain('data-testid="clinic-classic-nav"');
        expect(indexSrc).toContain('background: active ? shell.accent : \'transparent\'');
        expect(indexSrc).toContain('color: active ? shell.onAccent : shell.item');
    });
});
