import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../locales/module-translations';
import {
    SOCIAL_INBOX_CHANNELS,
    buildInboxThreads,
    buildMetaOAuthStart,
    type SocialInboxMessage,
} from '../../services/messaging/clinicSocialInbox';
import { listOwnInstagramMedia } from '../../services/messaging/instagramOwnMedia';

const sample: SocialInboxMessage = {
    id: '1',
    channel: 'instagram',
    externalAccount: 'klinik',
    counterparty: 'Ayşe',
    direction: 'in',
    body: 'merhaba',
    occurredAt: '2026-10-22T08:00:00.000Z',
};

describe('Klinik sosyal gelen kutu', () => {
    it('kanal listesi Instagram ve WhatsApp', () => {
        expect([...SOCIAL_INBOX_CHANNELS]).toEqual(['instagram', 'whatsapp']);
        for (const key of ['bClinicV2SetInstagram', 'bClinicV2SetWhatsapp', 'bClinicV2Inbox', 'bClinicV2SocialMissingApp']) {
            for (const lang of ['tr', 'en', 'ar', 'ku'] as const) {
                const label = translate(key, lang);
                expect(label.trim().length, `${key}:${lang}`).toBeGreaterThan(0);
                expect(label).not.toBe(key);
            }
        }
        expect(translate('bClinicV2SocialMissingApp', 'tr')).toBe('Meta uygulama kimliği tanımlı değil');
    });

    it('belirteç yokken gelen kutu boş', () => {
        expect(buildInboxThreads({ token: '', messages: [sample] })).toEqual([]);
        expect(buildInboxThreads({ token: null, messages: [sample], channel: 'whatsapp' })).toEqual([]);
    });

    it('belirteç varken yalnızca seçilen kanalın satırlarını gruplar', () => {
        const threads = buildInboxThreads({
            token: 'x',
            messages: [
                sample,
                { ...sample, id: '2', channel: 'whatsapp', counterparty: 'Veli', body: 'wp', occurredAt: '2026-10-22T09:00:00.000Z' },
            ],
            channel: 'whatsapp',
        });
        expect(threads).toHaveLength(1);
        expect(threads[0]?.sender).toBe('Veli');
        expect(threads[0]?.lastMessage).toBe('wp');
        expect(threads[0]?.channel).toBe('whatsapp');
    });

    it('uygulama kimliği yoksa OAuth adresi kurulmaz', () => {
        const missing = buildMetaOAuthStart({
            appId: '  ',
            channel: 'instagram',
            redirectUri: 'https://ornek.example/clinic/meta-oauth',
            state: 'instagram:001',
        });
        expect(missing).toEqual({ error: 'missing_app_id' });

        const ready = buildMetaOAuthStart({
            appId: '123',
            channel: 'whatsapp',
            redirectUri: 'https://ornek.example/clinic/meta-oauth',
            state: 'whatsapp:001',
        });
        expect('url' in ready).toBe(true);
        if (!('url' in ready)) return;
        const url = new URL(ready.url);
        expect(url.origin).toBe('https://www.facebook.com');
        expect(url.pathname).toBe('/v21.0/dialog/oauth');
        expect(url.searchParams.get('client_id')).toBe('123');
        expect(url.searchParams.get('client_secret')).toBeNull();
        expect(ready.url).not.toContain('META_APP_SECRET');
    });

    it('belirteç yokken kendi gönderi listesi boş kalır', async () => {
        const fetchImpl = vi.fn();
        await expect(listOwnInstagramMedia({ token: '', igUserId: '123', fetchImpl })).resolves.toEqual([]);
        await expect(listOwnInstagramMedia({ token: 'x', igUserId: 'baska-hesap', fetchImpl })).resolves.toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('yalnızca bağlı hesabın kendi gönderi adresini çağırır', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
        await listOwnInstagramMedia({ token: 'x', igUserId: '1789', fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const called = String(fetchImpl.mock.calls[0]?.[0]);
        const url = new URL(called);
        expect(url.pathname).toBe('/v21.0/1789/media');
        expect(url.searchParams.get('fields')).toBe('id,caption,media_type,permalink,timestamp');
    });
});
