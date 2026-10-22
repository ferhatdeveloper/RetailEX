import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
    CLINIC_V2_SETTINGS_GROUPS,
    ClinicV2SettingsShell,
} from '../../../components/beauty/components/ClinicV2SettingsShell';

const { getBranches, getRooms, getPortalSettings, upsertBranch, upsertRoom, updatePortalSettings } = vi.hoisted(() => ({
    getBranches: vi.fn(),
    getRooms: vi.fn(),
    getPortalSettings: vi.fn(),
    upsertBranch: vi.fn(),
    upsertRoom: vi.fn(),
    updatePortalSettings: vi.fn(),
}));

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

vi.mock('../../../services/postgres', () => ({
    ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
}));

vi.mock('../../../services/messaging/whatsappEmbeddedBridge', () => ({
    getEmbeddedBridgeStatus: vi.fn(async () => ({ ok: true, status: 'disconnected' })),
}));

vi.mock('../../../services/beautyService', () => ({
    beautyService: {
        getBranches: (...args: unknown[]) => getBranches(...args),
        getRooms: (...args: unknown[]) => getRooms(...args),
        getPortalSettings: (...args: unknown[]) => getPortalSettings(...args),
        upsertBranch: (...args: unknown[]) => upsertBranch(...args),
        upsertRoom: (...args: unknown[]) => upsertRoom(...args),
        updatePortalSettings: (...args: unknown[]) => updatePortalSettings(...args),
    },
}));

vi.mock('../../../components/beauty/components/StaffManagement', async () => {
    const { createElement } = await import('react');
    return {
        StaffManagement: () => createElement('div', { 'data-testid': 'clinic-v2-settings-staff' }, 'personel'),
    };
});

vi.mock('../../../components/beauty/components/ServiceManagement', async () => {
    const { createElement } = await import('react');
    return {
        ServiceManagement: () => createElement('div', { 'data-testid': 'clinic-v2-settings-services' }, 'hizmet'),
    };
});

const portal = {
    id: 'p1',
    online_booking_enabled: true,
    allow_staff_slot_overlap: false,
    public_slug: 'merkez',
    public_token: 'tok',
    reminder_hours_before: 24,
    default_reminder_channel: 'sms',
    whatsapp_provider: 'NONE',
};

describe('Klinik V2 ayar kabuğu', () => {
    beforeEach(() => {
        getBranches.mockReset();
        getRooms.mockReset();
        getPortalSettings.mockReset();
        upsertBranch.mockReset();
        upsertRoom.mockReset();
        updatePortalSettings.mockReset();
        getBranches.mockResolvedValue([
            { id: 'b1', name: 'Merkez', address: 'Cadde 1', phone: '0500', is_active: true },
        ]);
        getRooms.mockResolvedValue([{ id: 'r1', branch_id: 'b1', name: 'Oda 1', is_active: true }]);
        getPortalSettings.mockResolvedValue(portal);
        upsertBranch.mockResolvedValue('b1');
        upsertRoom.mockResolvedValue('r2');
        updatePortalSettings.mockResolvedValue(undefined);
    });

    it('karşılığı olan grupları ekrandaki sırayla tutar', () => {
        expect(CLINIC_V2_SETTINGS_GROUPS.map((group) => group.id)).toEqual([
            'branch',
            'staff',
            'services',
            'online',
            'calendar',
            'notify',
            'instagram',
            'whatsapp',
            'branchList',
            'branchAdd',
        ]);
        const src = readFileSync(resolve('src/components/beauty/components/ClinicV2SettingsShell.tsx'), 'utf8');
        const lowered = src.toLocaleLowerCase('tr-TR');
        expect(lowered).not.toContain('premium');
        expect(lowered).not.toContain('kredi');
    });

    it('en az iki grup ve seçilen grubun paneli görünür', async () => {
        render(<ClinicV2SettingsShell />);
        expect(await screen.findByDisplayValue('Merkez')).toBeTruthy();
        expect(screen.getByTestId('clinic-v2-settings-group-branch')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByTestId('clinic-v2-settings-group-online')).toBeTruthy();
        expect(screen.getByText('Oda 1')).toBeTruthy();
        expect(screen.getByTestId('clinic-v2-branch-logo')).toBeTruthy();
        expect(screen.getByTestId('clinic-v2-branch-map')).toBeTruthy();
        expect(screen.getByLabelText('Ülke')).toBeTruthy();
        expect(screen.getByLabelText('Cadde/Sokak')).toHaveValue('Cadde 1');

        fireEvent.click(screen.getByTestId('clinic-v2-settings-group-online'));
        expect(screen.getByTestId('clinic-v2-settings-group-online')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('switch', { name: 'Online randevu açık' })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByLabelText('Kısa adres')).toHaveValue('merkez');
        expect(screen.getByTestId('clinic-v2-settings-panel').textContent).toContain('/book/001?period=01&token=tok');

        fireEvent.click(screen.getByTestId('clinic-v2-settings-group-staff'));
        expect(screen.getByTestId('clinic-v2-settings-staff')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
    });

    it('şube kaydı mevcut servise gider', async () => {
        render(<ClinicV2SettingsShell />);
        const name = await screen.findByDisplayValue('Merkez');
        fireEvent.change(name, { target: { value: 'Merkez Şube' } });
        fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
        await waitFor(() => expect(upsertBranch).toHaveBeenCalledWith(expect.objectContaining({
            id: 'b1',
            name: 'Merkez Şube',
            address: 'Cadde 1',
            phone: '0500',
            is_active: true,
        })));
    });

    it('V2 ayar hedefi kabuk, V1 hub durur', () => {
        const indexSrc = readFileSync(resolve('src/components/beauty/index.tsx'), 'utf8');
        expect(indexSrc).toContain('shellV2 ? <ClinicV2SettingsShell /> : <ClinicOperationsHub />');
        expect(indexSrc).toContain("{!surveyOverlayOpen && !shellV2 && (");
        expect(indexSrc).toContain("id: 'clinic_ops'");
    });

    it('uygulama kimliği yokken bağlan düğmesi sahte adres açmaz', async () => {
        render(<ClinicV2SettingsShell />);
        await screen.findByDisplayValue('Merkez');
        fireEvent.click(screen.getByTestId('clinic-v2-settings-group-instagram'));
        const button = await screen.findByTestId('clinic-v2-social-connect-instagram');
        await waitFor(() => {
            expect(button.textContent).toBe('Meta uygulama kimliği tanımlı değil');
        });
        expect(button.getAttribute('data-oauth-url')).toBe('');

        fireEvent.click(screen.getByTestId('clinic-v2-settings-group-whatsapp'));
        await waitFor(() => {
            expect(screen.getByTestId('clinic-v2-wa-bridge').textContent).toContain('Port 3000');
        });
        expect(screen.getByTestId('clinic-v2-social-connect-whatsapp').textContent).toBe('Meta uygulama kimliği tanımlı değil');
        expect(screen.getByTestId('clinic-v2-wa-bridge').textContent).toContain('Bağlı değil');
    });
});
