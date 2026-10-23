import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClinicV2Inbox } from '../../../components/beauty/components/ClinicV2Inbox';

const { prepareClinicInbox } = vi.hoisted(() => ({
    prepareClinicInbox: vi.fn(),
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

vi.mock('../../../contexts/ThemeContext', () => ({
    useTheme: () => ({ darkMode: false }),
}));

vi.mock('../../../contexts/FirmaDonemContext', () => ({
    useFirmaDonem: () => ({ selectedFirm: null }),
}));

vi.mock('../../../services/messaging/clinicSocialSync', () => ({
    prepareClinicInbox: (...args: unknown[]) => prepareClinicInbox(...args),
}));

describe('Klinik V2 gelen kutu', () => {
    beforeEach(() => {
        prepareClinicInbox.mockReset();
        prepareClinicInbox.mockResolvedValue({
            messages: [],
            instagramConnected: false,
            whatsappConnected: false,
            whatsappSource: 'none',
        });
    });

    it('kanal düğmeleri Instagram ve WhatsApp, kayıt yokken boş', async () => {
        render(<ClinicV2Inbox />);
        expect(screen.getByTestId('clinic-v2-inbox-channel-instagram').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-v2-inbox-channel-whatsapp')).toBeTruthy();
        expect(await screen.findByTestId('clinic-v2-inbox-empty')).toBeTruthy();
        expect(screen.getByTestId('clinic-v2-inbox-empty').textContent).toBe('Instagram hesabı bağlı değil');
        expect(screen.queryByText('gizli-satir')).toBeNull();
        expect(prepareClinicInbox).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('clinic-v2-inbox-channel-whatsapp'));
        expect(screen.getByTestId('clinic-v2-inbox-channel-whatsapp').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-v2-inbox-empty').textContent).toBe('Backoffice WhatsApp kaydı yok');
    });

    it('bağlı kanaldaki mesaj ızgarada görünür', async () => {
        prepareClinicInbox.mockResolvedValue({
            messages: [{
                id: 'w1',
                channel: 'whatsapp',
                externalAccount: 'nora',
                counterparty: '905551112233',
                direction: 'in',
                body: 'selam-kayit',
                occurredAt: '2026-10-22T09:00:00.000Z',
            }],
            instagramConnected: false,
            whatsappConnected: true,
            whatsappSource: 'evolution',
        });
        render(<ClinicV2Inbox />);
        fireEvent.click(screen.getByTestId('clinic-v2-inbox-channel-whatsapp'));
        expect(await screen.findByText('selam-kayit')).toBeTruthy();
        expect(screen.getByText('905551112233')).toBeTruthy();
        expect(screen.getByText('Gelen')).toBeTruthy();
    });
});
