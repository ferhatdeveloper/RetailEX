import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../locales/module-translations';
import {
    DELETE_SOCIAL_ACCOUNT_SQL,
    INSERT_INBOX_MESSAGE_SQL,
    SOCIAL_INBOX_CHANNELS,
    assembleClinicInbox,
    buildInboxThreads,
    buildMetaOAuthStart,
    planWhatsAppInboxList,
    pullWhatsAppInboxMessages,
    selectInboxRows,
    type SocialInboxMessage,
} from '../../services/messaging/clinicSocialInbox';
import {
    completeInstagramConnect,
    exchangeInstagramAuthorization,
    instagramMessagesFromWebhook,
    pullInstagramInboxMessages,
} from '../../services/messaging/clinicInstagramConnect';
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
        for (const key of [
            'bClinicV2SetInstagram',
            'bClinicV2SetWhatsapp',
            'bClinicV2Inbox',
            'bClinicV2SocialMissingApp',
            'bClinicV2SocialMissingSecret',
            'bClinicV2WaBackofficeEmpty',
            'bClinicV2InboxCounterparty',
            'bClinicV2InboxDirection',
            'bClinicV2InboxBody',
            'bClinicV2InboxIgOff',
        ]) {
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

    it('Instagram kimliği yokken ağ yoktur ve başarı uydurulmaz', async () => {
        const fetchImpl = vi.fn();
        const missingId = await exchangeInstagramAuthorization({
            appId: '  ',
            appSecret: 'gizli',
            code: 'kod',
            redirectUri: 'https://ornek.example/clinic/meta-oauth',
            fetchImpl,
        });
        expect(missingId).toEqual({ ok: false, error: 'missing_app_id', callsNetwork: false });

        const missingSecret = await exchangeInstagramAuthorization({
            appId: '123',
            appSecret: '',
            code: 'kod',
            redirectUri: 'https://ornek.example/clinic/meta-oauth',
            fetchImpl,
        });
        expect(missingSecret.ok).toBe(false);
        if (!missingSecret.ok) expect(missingSecret.callsNetwork).toBe(false);

        const client = await completeInstagramConnect({
            appId: '',
            code: 'kod',
            redirectUri: 'https://ornek.example/clinic/meta-oauth',
            state: 'instagram:001',
            connStr: 'postgresql://kullanici:parola@127.0.0.1:5432/retailex_local',
            bridgeUrl: 'http://127.0.0.1:3001',
            fetchImpl,
        });
        expect(client).toEqual({ ok: false, error: 'missing_app_id' });
        await expect(pullInstagramInboxMessages({ token: '', igUserId: '1789', pageId: '99', fetchImpl })).resolves.toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(instagramMessagesFromWebhook({})).toEqual([]);
    });

    it('tarayıcı kod değişiminde gizli anahtar gövdeye girmez', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, accountName: 'klinik' }), { status: 200 }));
        const result = await completeInstagramConnect({
            appId: '123',
            code: 'kod',
            redirectUri: 'https://ornek.example/clinic/meta-oauth',
            state: 'instagram:001',
            connStr: 'postgresql://kullanici:parola@127.0.0.1:5432/retailex_local',
            bridgeUrl: 'http://127.0.0.1:3001',
            fetchImpl,
        });
        expect(result).toEqual({ ok: true, accountName: 'klinik' });
        const body = String(fetchImpl.mock.calls[0]?.[1] && (fetchImpl.mock.calls[0][1] as RequestInit).body);
        expect(body).not.toContain('META_APP_SECRET');
        expect(body).not.toContain('client_secret');
        expect(body).toContain('kod');
    });

    it('WhatsApp listesi backoffice kaydı yokken boştur', async () => {
        const fetchImpl = vi.fn();
        expect(planWhatsAppInboxList(null)).toEqual({ connected: false, source: 'none', url: '' });
        expect(planWhatsAppInboxList({ whatsapp_provider: 'NONE' })).toEqual({ connected: false, source: 'none', url: '' });
        await expect(pullWhatsAppInboxMessages({ record: null, fetchImpl })).resolves.toEqual([]);
        await expect(pullWhatsAppInboxMessages({ record: { whatsapp_provider: 'NONE' }, fetchImpl })).resolves.toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
        const hidden = selectInboxRows({
            messages: [{ ...sample, channel: 'whatsapp', id: 'w1' }],
            instagramConnected: false,
            whatsappConnected: false,
        });
        expect(hidden).toEqual([]);
    });

    it('WhatsApp kaydı varsa liste o kaynaktan planlanır', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            messages: {
                records: [{
                    key: { remoteJid: '905551112233@s.whatsapp.net', fromMe: false, id: 'abc' },
                    message: { conversation: 'selam' },
                    messageTimestamp: 1_761_120_000,
                }],
            },
        }), { status: 200 }));
        const record = {
            whatsapp_provider: 'EVOLUTION',
            whatsapp_base_url: 'https://evo.example',
            whatsapp_token: 'evo-key',
            whatsapp_instance_id: 'nora',
        };
        const plan = planWhatsAppInboxList(record);
        expect(plan).toEqual({
            connected: true,
            source: 'evolution',
            url: 'https://evo.example/chat/findMessages/nora',
        });
        const rows = await pullWhatsAppInboxMessages({ record, fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const called = fetchImpl.mock.calls[0];
        expect(called?.[0]).toBe(plan.url);
        expect((called?.[1] as RequestInit).method).toBe('POST');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.counterparty).toBe('905551112233');
        expect(rows[0]?.body).toBe('selam');
        expect(rows[0]?.channel).toBe('whatsapp');

        const bridgePlan = planWhatsAppInboxList({
            whatsapp_provider: 'EMBEDDED',
            whatsapp_base_url: 'http://127.0.0.1:3000',
        });
        expect(bridgePlan.source).toBe('bridge');
        expect(bridgePlan.url).toBe('http://127.0.0.1:3000/messages');

        const assembled = await assembleClinicInbox({
            listAccounts: async () => [],
            listMessages: async () => rows,
            readWhatsApp: async () => record,
            pullWhatsApp: async (passed) => pullWhatsAppInboxMessages({ record: passed, fetchImpl: vi.fn(async () => new Response('{}', { status: 200 })) }),
        });
        expect(assembled.whatsappConnected).toBe(true);
        expect(assembled.whatsappSource).toBe('evolution');
        expect(assembled.messages.map((row) => row.body)).toEqual(['selam']);
    });

    it('koparma mesaj tablosunu silmez', () => {
        expect(DELETE_SOCIAL_ACCOUNT_SQL).not.toContain('social_inbox_messages');
        expect(INSERT_INBOX_MESSAGE_SQL).not.toContain('DELETE');
    });
});
