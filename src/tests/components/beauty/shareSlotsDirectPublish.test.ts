import { describe, expect, it, vi } from 'vitest';
import { SHARE_STORY_HEIGHT, SHARE_STORY_WIDTH } from '../../../components/beauty/share-slots/shareSlotsStory';
import {
    buildShareStoryPublishPlan,
    runInstagramStoryPublish,
    runWhatsAppMessagePublish,
} from '../../../components/beauty/share-slots/shareSlotsPublish';

const connectedInstagram = {
    metaAppId: 'app-1',
    pageAccessToken: 'page-token',
    igUserId: '17890000000000000',
};

function jsonResponse(body: unknown) {
    return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(body),
    };
}

describe('boş saat doğrudan yayın', () => {
    it('hikâye planı 1080x1920', () => {
        const plan = buildShareStoryPublishPlan({
            media: { kind: 'image', mime: 'image/png', byteLength: 12 },
            secrets: connectedInstagram,
        });
        expect(plan.width).toBe(1080);
        expect(plan.height).toBe(1920);
        expect(plan.media.width).toBe(SHARE_STORY_WIDTH);
        expect(plan.media.height).toBe(SHARE_STORY_HEIGHT);
        expect(SHARE_STORY_WIDTH).toBe(1080);
        expect(SHARE_STORY_HEIGHT).toBe(1920);
        expect(plan.instagram.status).toBe('ready');
    });

    it('belirteç yokken Instagram ağı çağırmaz', async () => {
        const fetchImpl = vi.fn();
        const plan = buildShareStoryPublishPlan({
            media: { kind: 'image', mime: 'image/png', byteLength: 8 },
            secrets: {},
        });
        expect(plan.instagram.status).toBe('not_connected');
        expect(plan.instagram.steps).toEqual([]);
        const result = await runInstagramStoryPublish(plan, {
            pageAccessToken: '',
            bytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
        });
        expect(result).toEqual({ status: 'not_connected' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('WhatsApp alıcı yoksa durum ucunu çağırmaz', async () => {
        const fetchImpl = vi.fn();
        const plan = buildShareStoryPublishPlan({
            media: { kind: 'image', mime: 'image/jpeg', byteLength: 8 },
            secrets: { whatsappAccessToken: 'wa-token', whatsappPhoneId: '100200' },
            recipient: '   ',
        });
        expect(plan.whatsapp.status).toBe('recipient_required');
        expect(plan.whatsapp.callsStatusApi).toBe(false);
        expect(plan.whatsapp.kind).toBe('message');
        expect(plan.whatsapp.calls).toEqual([]);
        const result = await runWhatsAppMessagePublish(plan, {
            accessToken: 'wa-token',
            bytes: new Uint8Array([1, 2, 3]),
            fetchImpl,
        });
        expect(result).toEqual({ status: 'recipient_required' });
        expect(fetchImpl).not.toHaveBeenCalled();

        const ready = buildShareStoryPublishPlan({
            media: { kind: 'image', mime: 'image/jpeg', byteLength: 4 },
            secrets: { whatsappAccessToken: 'wa-token', whatsappPhoneId: '100200' },
            recipient: '905551112233',
            caption: 'Boş saatler',
        });
        expect(ready.whatsapp.transport).toBe('cloud_message');
        expect(ready.whatsapp.callsStatusApi).toBe(false);
        expect(ready.whatsapp.calls.some((call) => call.url.endsWith('/messages'))).toBe(true);
        expect(ready.whatsapp.calls.some((call) => call.purpose === 'message')).toBe(true);
        for (const call of ready.whatsapp.calls) {
            expect(call.url.toLowerCase()).not.toMatch(/\/status(?:es)?(?:\/|$)/);
        }
    });

    it('bağlı hesapta görsel hikâye kap ve yayın uçlarını kullanır', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ id: 'cont-1' }))
            .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' })
            .mockResolvedValueOnce(jsonResponse({ id: 'story-9' }));
        const plan = buildShareStoryPublishPlan({
            media: { kind: 'image', mime: 'image/png', byteLength: 4 },
            secrets: connectedInstagram,
        });
        expect(plan.instagram.status).toBe('ready');
        if (plan.instagram.status !== 'ready') return;
        expect(plan.instagram.steps.map((step) => step.op)).toEqual([
            'media_container',
            'resumable_upload',
            'media_publish',
        ]);
        const result = await runInstagramStoryPublish(plan, {
            pageAccessToken: connectedInstagram.pageAccessToken,
            bytes: new Uint8Array([1, 2, 3, 4]),
            fetchImpl,
        });
        expect(result).toEqual({ status: 'published', id: 'story-9' });
        const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
        expect(urls[0]).toContain('/17890000000000000/media');
        expect(urls[2]).toContain('/media_publish');
        for (const url of urls) {
            expect(url.toLowerCase()).not.toMatch(/\/status(?:es)?(?:\/|$)/);
        }
    });
});
