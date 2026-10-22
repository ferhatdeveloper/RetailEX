import { evolutionMediaEndpoint, evolutionMediaPayload } from '../../../services/messaging/whatsappEvolution';
import { SHARE_STORY_HEIGHT, SHARE_STORY_WIDTH } from './shareSlotsStory';
import type { ClinicSocialConnect } from './socialConnect';

/** Hikâye tuvali ile aynı ölçü. Yayın planı bu kareye oturur. */
export const SHARE_PUBLISH_WIDTH = SHARE_STORY_WIDTH;
export const SHARE_PUBLISH_HEIGHT = SHARE_STORY_HEIGHT;

const GRAPH_VERSION = 'v21.0';
const GRAPH_ROOT = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type SharePublishKind = 'image' | 'video';

export type SharePublishSecrets = {
    metaAppId?: string | null;
    pageAccessToken?: string | null;
    igUserId?: string | null;
    whatsappChannel?: ClinicSocialConnect['whatsapp']['channel'] | null;
    whatsappAccessToken?: string | null;
    whatsappPhoneId?: string | null;
    bridgeBaseUrl?: string | null;
    bridgeToken?: string | null;
    evolutionBaseUrl?: string | null;
    evolutionToken?: string | null;
    evolutionInstance?: string | null;
};

export type SharePublishMediaInput = {
    kind: SharePublishKind;
    mime?: string;
    byteLength?: number;
    publicUrl?: string;
    width?: number;
    height?: number;
};

export type InstagramPublishStep = {
    op: 'media_container' | 'resumable_upload' | 'media_publish';
    method: 'POST';
    url: string;
    body: Record<string, string>;
};

export type WhatsAppPublishCall = {
    method: 'POST';
    url: string;
    purpose: 'message' | 'media_upload' | 'bridge_send' | 'evolution_send';
    body: Record<string, string>;
};

export type ShareStoryPublishPlan = {
    width: number;
    height: number;
    media: {
        kind: SharePublishKind;
        mime: string;
        byteLength: number;
        publicUrl?: string;
        width: number;
        height: number;
    };
    instagram:
        | { status: 'not_connected'; steps: [] }
        | { status: 'media_url_required'; igUserId: string; steps: [] }
        | { status: 'ready'; igUserId: string; steps: InstagramPublishStep[] };
    whatsapp: {
        status: 'not_connected' | 'recipient_required' | 'ready';
        /** Cloud API 24 saatlik duruma yazmaz. Bu plan durum ucu çağırmaz. */
        callsStatusApi: false;
        kind: 'message';
        to: string;
        transport: 'cloud_message' | 'bridge_message' | 'evolution_message' | 'none';
        calls: WhatsAppPublishCall[];
    };
};

export type PublishResponse = {
    ok: boolean;
    status: number;
    text(): Promise<string>;
};

export type PublishFetch = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array | Blob | FormData },
) => Promise<PublishResponse>;

function clean(value: string | null | undefined): string {
    return String(value || '').trim();
}

function isPublicMediaUrl(value: string | undefined): string {
    const url = clean(value);
    if (!/^https:\/\//i.test(url)) return '';
    return url;
}

function digitsOf(value: string | undefined): string {
    return String(value || '').replace(/\D/g, '');
}

function isStatusEndpoint(url: string): boolean {
    try {
        const path = new URL(url).pathname.toLowerCase();
        return path.endsWith('/status') || path.includes('/status/') || path.endsWith('/statuses') || path.includes('/statuses/');
    } catch {
        return /\/status(?:es)?(?:\/|$)/i.test(url);
    }
}

function bridgeSendUrl(base: string): string {
    const trimmed = base.trim().replace(/\/+$/, '').replace(/\/status$/i, '');
    if (trimmed.endsWith('/send')) return trimmed;
    return `${trimmed}/send`;
}

export function toPublishSecrets(connect: ClinicSocialConnect): SharePublishSecrets {
    return {
        metaAppId: connect.instagram.metaAppId,
        pageAccessToken: connect.instagram.pageAccessToken,
        igUserId: connect.instagram.igUserId,
        whatsappChannel: connect.whatsapp.channel,
        whatsappAccessToken: connect.whatsapp.accessToken,
        whatsappPhoneId: connect.whatsapp.phoneId,
        bridgeBaseUrl: connect.whatsapp.bridgeBaseUrl,
        bridgeToken: connect.whatsapp.bridgeToken,
        evolutionBaseUrl: connect.whatsapp.evolutionBaseUrl,
        evolutionToken: connect.whatsapp.evolutionToken,
        evolutionInstance: connect.whatsapp.evolutionInstance,
    };
}

function whatsAppChannel(secrets: SharePublishSecrets): ClinicSocialConnect['whatsapp']['channel'] {
    const explicit = clean(secrets.whatsappChannel);
    if (explicit === 'evolution' || explicit === 'bridge' || explicit === 'cloud' || explicit === 'none') return explicit;
    if (clean(secrets.evolutionBaseUrl) && clean(secrets.evolutionInstance)) return 'evolution';
    if (clean(secrets.bridgeBaseUrl)) return 'bridge';
    if (clean(secrets.whatsappAccessToken) && clean(secrets.whatsappPhoneId)) return 'cloud';
    return 'none';
}

function instagramReady(secrets: SharePublishSecrets): { metaAppId: string; pageAccessToken: string; igUserId: string } | null {
    const metaAppId = clean(secrets.metaAppId);
    const pageAccessToken = clean(secrets.pageAccessToken);
    const igUserId = clean(secrets.igUserId);
    if (!metaAppId || !pageAccessToken || !igUserId) return null;
    return { metaAppId, pageAccessToken, igUserId };
}

export function buildShareStoryPublishPlan(input: {
    media: SharePublishMediaInput;
    secrets: SharePublishSecrets;
    recipient?: string;
    caption?: string;
}): ShareStoryPublishPlan {
    const kind = input.media.kind === 'video' ? 'video' : 'image';
    const mime = clean(input.media.mime) || (kind === 'video' ? 'video/mp4' : 'image/png');
    const publicUrl = isPublicMediaUrl(input.media.publicUrl);
    const media = {
        kind,
        mime,
        byteLength: Math.max(0, Number(input.media.byteLength) || 0),
        publicUrl: publicUrl || undefined,
        width: SHARE_PUBLISH_WIDTH,
        height: SHARE_PUBLISH_HEIGHT,
    };
    const ig = instagramReady(input.secrets);
    let instagram: ShareStoryPublishPlan['instagram'];
    const hasBytes = Number(input.media.byteLength) > 0;
    if (!ig) {
        instagram = { status: 'not_connected', steps: [] };
    } else if (!publicUrl && !hasBytes) {
        instagram = { status: 'media_url_required', igUserId: ig.igUserId, steps: [] };
    } else if (!publicUrl) {
        const container = `${GRAPH_ROOT}/${ig.igUserId}/media`;
        instagram = {
            status: 'ready',
            igUserId: ig.igUserId,
            steps: [
                {
                    op: 'media_container',
                    method: 'POST',
                    url: container,
                    body: { media_type: 'STORIES', upload_type: 'resumable' },
                },
                {
                    op: 'resumable_upload',
                    method: 'POST',
                    url: `https://rupload.facebook.com/ig-api-upload/${GRAPH_VERSION}/{container_id}`,
                    body: {},
                },
                {
                    op: 'media_publish',
                    method: 'POST',
                    url: `${GRAPH_ROOT}/${ig.igUserId}/media_publish`,
                    body: { creation_id: '{container_id}' },
                },
            ],
        };
    } else {
        const body: Record<string, string> = { media_type: 'STORIES' };
        if (kind === 'video') body.video_url = publicUrl;
        else body.image_url = publicUrl;
        instagram = {
            status: 'ready',
            igUserId: ig.igUserId,
            steps: [
                {
                    op: 'media_container',
                    method: 'POST',
                    url: `${GRAPH_ROOT}/${ig.igUserId}/media`,
                    body,
                },
                {
                    op: 'media_publish',
                    method: 'POST',
                    url: `${GRAPH_ROOT}/${ig.igUserId}/media_publish`,
                    body: { creation_id: '{container_id}' },
                },
            ],
        };
    }

    const to = digitsOf(input.recipient);
    const channel = whatsAppChannel(input.secrets);
    const cloudToken = clean(input.secrets.whatsappAccessToken);
    const phoneId = clean(input.secrets.whatsappPhoneId);
    const bridge = clean(input.secrets.bridgeBaseUrl);
    const evolutionBase = clean(input.secrets.evolutionBaseUrl);
    const evolutionInstance = clean(input.secrets.evolutionInstance);
    const caption = clean(input.caption).slice(0, 1024);
    const channelReady = channel === 'evolution'
        ? Boolean(evolutionBase && evolutionInstance)
        : channel === 'bridge'
            ? Boolean(bridge)
            : channel === 'cloud'
                ? Boolean(cloudToken && phoneId)
                : false;
    let whatsapp: ShareStoryPublishPlan['whatsapp'];
    if (!channelReady) {
        whatsapp = { status: 'not_connected', callsStatusApi: false, kind: 'message', to, transport: 'none', calls: [] };
    } else if (to.length < 8) {
        whatsapp = { status: 'recipient_required', callsStatusApi: false, kind: 'message', to, transport: 'none', calls: [] };
    } else if (channel === 'evolution') {
        whatsapp = {
            status: 'ready',
            callsStatusApi: false,
            kind: 'message',
            to,
            transport: 'evolution_message',
            calls: [{
                method: 'POST',
                url: evolutionMediaEndpoint(evolutionBase, evolutionInstance),
                purpose: 'evolution_send',
                body: {
                    to,
                    text: caption,
                    mediaKind: kind,
                    ...(publicUrl ? { media: publicUrl } : {}),
                },
            }],
        };
    } else if (channel === 'bridge') {
        whatsapp = {
            status: 'ready',
            callsStatusApi: false,
            kind: 'message',
            to,
            transport: 'bridge_message',
            calls: [{
                method: 'POST',
                url: bridgeSendUrl(bridge),
                purpose: 'bridge_send',
                body: { to, text: caption, mediaKind: kind },
            }],
        };
    } else if (channel === 'cloud') {
        const messageBody: Record<string, string> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: kind,
        };
        if (publicUrl) messageBody.link = publicUrl;
        if (caption) messageBody.caption = caption;
        const calls: WhatsAppPublishCall[] = [];
        if (!publicUrl) {
            calls.push({
                method: 'POST',
                url: `${GRAPH_ROOT}/${phoneId}/media`,
                purpose: 'media_upload',
                body: { messaging_product: 'whatsapp', type: mime },
            });
        }
        calls.push({
            method: 'POST',
            url: `${GRAPH_ROOT}/${phoneId}/messages`,
            purpose: 'message',
            body: messageBody,
        });
        whatsapp = { status: 'ready', callsStatusApi: false, kind: 'message', to, transport: 'cloud_message', calls };
    } else {
        whatsapp = { status: 'not_connected', callsStatusApi: false, kind: 'message', to, transport: 'none', calls: [] };
    }

    return { width: SHARE_PUBLISH_WIDTH, height: SHARE_PUBLISH_HEIGHT, media, instagram, whatsapp };
}

async function readJson(res: PublishResponse): Promise<Record<string, unknown>> {
    const text = await res.text();
    if (!text) return {};
    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
        return {};
    } catch {
        return {};
    }
}

function defaultFetch(): PublishFetch {
    return (url, init) => globalThis.fetch(url, init);
}

function bytesToBase64(bytes: Uint8Array): string {
    const chunk = 0x1000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        const slice = bytes.subarray(offset, offset + chunk);
        binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
}

export async function runInstagramStoryPublish(
    plan: ShareStoryPublishPlan,
    options: { pageAccessToken?: string | null; bytes?: Uint8Array | null; fetchImpl?: PublishFetch },
): Promise<{ status: 'not_connected' | 'media_url_required' | 'published' | 'failed'; id?: string }> {
    if (plan.instagram.status === 'not_connected') return { status: 'not_connected' };
    if (plan.instagram.status === 'media_url_required') return { status: 'media_url_required' };
    const token = clean(options.pageAccessToken);
    if (!token) return { status: 'not_connected' };
    const fetchImpl = options.fetchImpl ?? defaultFetch();
    let containerId = '';
    for (const step of plan.instagram.steps) {
        if (isStatusEndpoint(step.url)) return { status: 'failed' };
        const url = step.url.replace('{container_id}', containerId);
        if (step.op === 'resumable_upload') {
            const bytes = options.bytes;
            if (!bytes || bytes.byteLength < 1 || !containerId) return { status: 'failed' };
            const uploaded = await fetchImpl(url, {
                method: 'POST',
                headers: {
                    Authorization: `OAuth ${token}`,
                    offset: '0',
                    file_size: String(bytes.byteLength),
                },
                body: bytes,
            });
            if (!uploaded.ok) return { status: 'failed' };
            continue;
        }
        const body = { ...step.body };
        if (body.creation_id === '{container_id}') body.creation_id = containerId;
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) return { status: 'failed' };
        const payload = await readJson(response);
        const id = typeof payload.id === 'string' ? payload.id : '';
        if (step.op === 'media_container') {
            if (!id) return { status: 'failed' };
            containerId = id;
        }
        if (step.op === 'media_publish') {
            if (!id) return { status: 'failed' };
            return { status: 'published', id };
        }
    }
    return { status: 'failed' };
}

export async function runWhatsAppMessagePublish(
    plan: ShareStoryPublishPlan,
    options: {
        accessToken?: string | null;
        bridgeToken?: string | null;
        evolutionToken?: string | null;
        bytes?: Uint8Array | null;
        fetchImpl?: PublishFetch;
    },
): Promise<{ status: 'not_connected' | 'recipient_required' | 'sent' | 'failed' }> {
    if (plan.whatsapp.status === 'not_connected') return { status: 'not_connected' };
    if (plan.whatsapp.status === 'recipient_required') return { status: 'recipient_required' };
    if (plan.whatsapp.calls.length === 0) return { status: 'failed' };
    const fetchImpl = options.fetchImpl ?? defaultFetch();
    const cloudToken = clean(options.accessToken);
    const bridgeToken = clean(options.bridgeToken);
    const evolutionToken = clean(options.evolutionToken);
    if (plan.whatsapp.transport === 'cloud_message' && !cloudToken) return { status: 'not_connected' };
    if (plan.whatsapp.transport === 'bridge_message' && !plan.whatsapp.calls[0]?.url) return { status: 'not_connected' };
    if (plan.whatsapp.transport === 'evolution_message' && !evolutionToken) return { status: 'not_connected' };
    let mediaId = '';
    for (const call of plan.whatsapp.calls) {
        if (isStatusEndpoint(call.url)) return { status: 'failed' };
        if (call.purpose === 'media_upload') {
            const bytes = options.bytes;
            if (!bytes || bytes.byteLength < 1) return { status: 'failed' };
            const form = new FormData();
            form.append('messaging_product', 'whatsapp');
            form.append('type', plan.media.mime);
            form.append('file', new Blob([bytes], { type: plan.media.mime }), plan.media.kind === 'video' ? 'story.mp4' : 'story.png');
            const uploaded = await fetchImpl(call.url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${cloudToken}` },
                body: form,
            });
            if (!uploaded.ok) return { status: 'failed' };
            const payload = await readJson(uploaded);
            mediaId = typeof payload.id === 'string' ? payload.id : '';
            if (!mediaId) return { status: 'failed' };
            continue;
        }
        if (call.purpose === 'bridge_send') {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (bridgeToken) headers.Authorization = `Bearer ${bridgeToken}`;
            const bytes = options.bytes;
            const body: Record<string, string> = { ...call.body };
            if (bytes && bytes.byteLength > 0) body.mediaBase64 = bytesToBase64(bytes);
            const response = await fetchImpl(call.url, { method: 'POST', headers, body: JSON.stringify(body) });
            if (!response.ok) return { status: 'failed' };
            return { status: 'sent' };
        }
        if (call.purpose === 'evolution_send') {
            const linked = clean(call.body.media);
            const bytes = options.bytes;
            const media = linked || (bytes && bytes.byteLength > 0 ? bytesToBase64(bytes) : '');
            if (!media) return { status: 'failed' };
            const payload = evolutionMediaPayload({
                to: plan.whatsapp.to,
                mediatype: plan.media.kind === 'video' ? 'video' : 'image',
                media,
                caption: clean(call.body.text),
            });
            const response = await fetchImpl(call.url, {
                method: 'POST',
                headers: {
                    apikey: evolutionToken,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            if (!response.ok) return { status: 'failed' };
            return { status: 'sent' };
        }
        const message: Record<string, unknown> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: plan.whatsapp.to,
            type: plan.media.kind,
        };
        const mediaBody: Record<string, string> = {};
        if (call.body.link) mediaBody.link = call.body.link;
        else if (mediaId) mediaBody.id = mediaId;
        else return { status: 'failed' };
        if (call.body.caption) mediaBody.caption = call.body.caption;
        message[plan.media.kind] = mediaBody;
        const response = await fetchImpl(call.url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${cloudToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
        if (!response.ok) return { status: 'failed' };
        return { status: 'sent' };
    }
    return { status: 'failed' };
}
