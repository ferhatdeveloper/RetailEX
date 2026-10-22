import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClinicV2Inbox } from '../../../components/beauty/components/ClinicV2Inbox';

const { listSocialMessages } = vi.hoisted(() => ({
    listSocialMessages: vi.fn(),
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

vi.mock('../../../services/messaging/clinicSocialRepository', () => ({
    listSocialMessages: (...args: unknown[]) => listSocialMessages(...args),
}));

describe('Klinik V2 gelen kutu', () => {
    beforeEach(() => {
        listSocialMessages.mockReset();
        listSocialMessages.mockResolvedValue([
            {
                id: '1',
                channel: 'instagram',
                externalAccount: 'klinik',
                counterparty: 'Ayşe',
                direction: 'in',
                body: 'gizli-satir',
                occurredAt: '2026-10-22T08:00:00.000Z',
            },
        ]);
    });

    it('kanal düğmeleri Instagram ve WhatsApp, belirteç yokken boş', async () => {
        render(<ClinicV2Inbox />);
        expect(screen.getByTestId('clinic-v2-inbox-channel-instagram').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-v2-inbox-channel-whatsapp')).toBeTruthy();
        expect(await screen.findByTestId('clinic-v2-inbox-empty')).toBeTruthy();
        expect(screen.queryByText('gizli-satir')).toBeNull();
        expect(listSocialMessages).toHaveBeenCalled();

        fireEvent.click(screen.getByTestId('clinic-v2-inbox-channel-whatsapp'));
        expect(screen.getByTestId('clinic-v2-inbox-channel-whatsapp').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByTestId('clinic-v2-inbox-empty')).toBeTruthy();
    });
});
