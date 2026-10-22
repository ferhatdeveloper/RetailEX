import { describe, expect, it, vi } from 'vitest';
import {
    buildShareStoryPublishPlan,
    runInstagramStoryPublish,
    runWhatsAppMessagePublish,
    toPublishSecrets,
    type PublishResponse,
} from '../../../components/beauty/share-slots/shareSlotsPublish';
import { readClinicSocialConnect } from '../../../components/beauty/share-slots/socialConnect';

function jsonResponse(body: unknown, ok = true, status = 200): PublishResponse {
    return { ok, status, text: async () => JSON.stringify(body) };
}

const image = {
    kind: 'image' as const,
    mime: 'image/png',
    byteLength: 2048,
    width: 100,
    height: 80,
    publicUrl: 'https://cdn.example/bos-saat.png',
};

describe('boş saat hikâye yayını', () => {
    it('görsel yükü 1080×1920 yayın planına girer', async () => {
        const plan = buildShareStoryPublishPlan({
            media: image,
            secrets: {
                metaAppId: 'meta-app',
                pageAccessToken: 'page-token',
                igUserId: '178900',
            },
            recipient: '905551112233',
        });
        expect(plan.width).toBe(1080);
        expect(plan.height).toBe(1920);
        expect(plan.media.kind).toBe('image');
        expect(plan.media.width).toBe(1080);
        expect(plan.media.height).toBe(1920);
        expect(plan.media.byteLength).toBe(2048);
        expect(plan.instagram.status).toBe('ready');
        if (plan.instagram.status !== 'ready') return;
        expect(plan.instagram.igUserId).toBe('178900');
        expect(plan.instagram.steps[0]).toMatchObject({
            op: 'media_container',
            method: 'POST',
            url: 'https://graph.facebook.com/v21.0/178900/media',
            body: { image_url: 'https://cdn.example/bos-saat.png', media_type: 'STORIES' },
        });
        expect(plan.instagram.steps[1]).toMatchObject({
            op: 'media_publish',
            url: 'https://graph.facebook.com/v21.0/178900/media_publish',
            body: { creation_id: '{container_id}' },
        });
        expect(JSON.stringify(plan.instagram)).not.toContain('page-token');

        const calls: { url: string; body: string }[] = [];
        const result = await runInstagramStoryPublish(plan, {
            pageAccessToken: 'page-token',
            fetchImpl: async (url, init) => {
                calls.push({ url, body: String(init?.body || '') });
                if (url.endsWith('/media')) return jsonResponse({ id: 'container-1' });
                return jsonResponse({ id: 'story-9' });
            },
        });
        expect(result).toEqual({ status: 'published', id: 'story-9' });
        expect(calls).toHaveLength(2);
        expect(calls[0]?.url).toBe('https://graph.facebook.com/v21.0/178900/media');
        expect(JSON.parse(calls[1]?.body || '{}')).toMatchObject({ creation_id: 'container-1' });
        expect(calls[1]?.url).toBe('https://graph.facebook.com/v21.0/178900/media_publish');
        expect(calls.every((call) => call.url.includes('/178900/'))).toBe(true);
    });

    it('token yokken sonuç not_connected', async () => {
        const missingPage = buildShareStoryPublishPlan({
            media: image,
            secrets: { metaAppId: 'meta-app', igUserId: '178900' },
        });
        expect(missingPage.instagram.status).toBe('not_connected');

        const missingApp = buildShareStoryPublishPlan({
            media: image,
            secrets: { pageAccessToken: 'page-token', igUserId: '178900' },
        });
        expect(missingApp.instagram.status).toBe('not_connected');

        const storage = {
            getItem: (key: string) => (key.endsWith('social_connect')
                ? JSON.stringify({ instagram: { igUserId: '178900', pageAccessToken: 'sakli' } })
                : null),
            setItem: () => undefined,
        };
        const connect = readClinicSocialConnect({
            storage,
            env: {},
            accounts: [{ channel: 'instagram', externalAccount: '178900', accountName: 'Nora' }],
        });
        expect(connect.instagram.igUserId).toBe('178900');
        expect(connect.instagram.connected).toBe(false);
        const fromStore = buildShareStoryPublishPlan({
            media: image,
            secrets: toPublishSecrets(connect),
        });
        expect(fromStore.instagram.status).toBe('not_connected');
        expect(fromStore.whatsapp.status).toBe('not_connected');

        const fetchImpl = vi.fn();
        const result = await runInstagramStoryPublish(missingPage, { pageAccessToken: 'page-token', fetchImpl });
        expect(result.status).toBe('not_connected');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('WhatsApp planı alıcı numarası ister ve durum API çağırmaz', async () => {
        const secrets = { whatsappAccessToken: 'wa-token', whatsappPhoneId: '55501' };
        const missingRecipient = buildShareStoryPublishPlan({
            media: image,
            secrets,
            recipient: '   ',
        });
        expect(missingRecipient.whatsapp.status).toBe('recipient_required');
        expect(missingRecipient.whatsapp.callsStatusApi).toBe(false);
        expect(missingRecipient.whatsapp.kind).toBe('message');
        expect(missingRecipient.whatsapp.calls).toEqual([]);
        const fetchImpl = vi.fn();
        const blocked = await runWhatsAppMessagePublish(missingRecipient, { accessToken: 'wa-token', fetchImpl });
        expect(blocked.status).toBe('recipient_required');
        expect(fetchImpl).not.toHaveBeenCalled();

        const ready = buildShareStoryPublishPlan({
            media: image,
            secrets,
            recipient: '+90 555 111 22 33',
            caption: 'Boş saatler',
        });
        expect(ready.whatsapp.status).toBe('ready');
        expect(ready.whatsapp.transport).toBe('cloud_message');
        expect(ready.whatsapp.callsStatusApi).toBe(false);
        expect(ready.whatsapp.to).toBe('905551112233');
        for (const call of ready.whatsapp.calls) {
            const path = new URL(call.url).pathname;
            expect(path.includes('/status')).toBe(false);
            expect(path.endsWith('/messages')).toBe(true);
            expect(call.body.type).toBe('image');
        }

        const bridge = buildShareStoryPublishPlan({
            media: { kind: 'image', mime: 'image/png', byteLength: 12 },
            secrets: { bridgeBaseUrl: 'http://127.0.0.1:3000/status' },
            recipient: '905551112233',
        });
        expect(bridge.whatsapp.transport).toBe('bridge_message');
        expect(bridge.whatsapp.calls[0]?.url).toBe('http://127.0.0.1:3000/send');
        expect(bridge.whatsapp.callsStatusApi).toBe(false);

        const forged = buildShareStoryPublishPlan({
            media: image,
            secrets,
            recipient: '905551112233',
        });
        forged.whatsapp.calls[0]!.url = 'https://graph.facebook.com/v21.0/55501/status';
        const refused = await runWhatsAppMessagePublish(forged, { accessToken: 'wa-token', fetchImpl });
        expect(refused.status).toBe('failed');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
