/**
 * Instagram profesyonel hesap bağlama.
 * META_APP_SECRET yalnızca sunucu çağrısında okunur. Tarayıcıya yazılmaz.
 * Belirteç dönüşü köprüde kalır; bu modül değeri günlüğe basmaz.
 */
import type { SocialInboxMessage } from './clinicSocialInbox';

const GRAPH = 'https://graph.facebook.com/v21.0';

export type InstagramExchangeError =
    | 'missing_app_id'
    | 'missing_app_secret'
    | 'missing_code'
    | 'no_professional_account'
    | 'exchange_failed';

export type InstagramExchangeResult =
    | { ok: false; error: InstagramExchangeError; callsNetwork: boolean }
    | {
        ok: true;
        callsNetwork: true;
        igUserId: string;
        pageId: string;
        accountName: string;
        pageAccessToken: string;
    };

type FetchImpl = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

async function readAccessToken(fetchImpl: FetchImpl, url: URL): Promise<string> {
    try {
        const res = await fetchImpl(url.toString(), { method: 'GET' });
        if (!res.ok) return '';
        const payload = asRecord(await res.json());
        return String(payload?.access_token || '').trim();
    } catch {
        return '';
    }
}

function pickProfessionalPage(payload: unknown): {
    igUserId: string;
    pageId: string;
    accountName: string;
    pageAccessToken: string;
} | null {
    const root = asRecord(payload);
    const pages = root && Array.isArray(root.data) ? root.data : [];
    for (const item of pages) {
        const page = asRecord(item);
        if (!page) continue;
        const ig = asRecord(page.instagram_business_account) ?? asRecord(page.connected_instagram_account);
        const igUserId = String(ig?.id || '').trim();
        const pageId = String(page.id || '').trim();
        const pageAccessToken = String(page.access_token || '').trim();
        if (!/^\d+$/.test(igUserId) || !/^\d+$/.test(pageId) || !pageAccessToken) continue;
        const accountName = String(ig?.username || page.name || igUserId).trim();
        return { igUserId, pageId, accountName, pageAccessToken };
    }
    return null;
}

/**
 * Kod değişimi. Uygulama kimliği veya gizli anahtar yoksa ağ çağrılmaz.
 */
export async function exchangeInstagramAuthorization(input: {
    appId?: string | null;
    appSecret?: string | null;
    code?: string | null;
    redirectUri: string;
    fetchImpl?: FetchImpl;
}): Promise<InstagramExchangeResult> {
    const appId = String(input.appId ?? '').trim();
    const appSecret = String(input.appSecret ?? '').trim();
    const code = String(input.code ?? '').trim();
    const redirectUri = String(input.redirectUri || '').trim();
    if (!appId) return { ok: false, error: 'missing_app_id', callsNetwork: false };
    if (!appSecret) return { ok: false, error: 'missing_app_secret', callsNetwork: false };
    if (!code || !redirectUri) return { ok: false, error: 'missing_code', callsNetwork: false };
    const fetchImpl = input.fetchImpl ?? fetch;
    const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
    shortUrl.searchParams.set('client_id', appId);
    shortUrl.searchParams.set('client_secret', appSecret);
    shortUrl.searchParams.set('redirect_uri', redirectUri);
    shortUrl.searchParams.set('code', code);
    const shortToken = await readAccessToken(fetchImpl, shortUrl);
    if (!shortToken) return { ok: false, error: 'exchange_failed', callsNetwork: true };
    const longUrl = new URL(`${GRAPH}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', shortToken);
    const longToken = await readAccessToken(fetchImpl, longUrl);
    const userToken = longToken || shortToken;
    const pagesUrl = new URL(`${GRAPH}/me/accounts`);
    pagesUrl.searchParams.set(
        'fields',
        'id,name,access_token,instagram_business_account{id,username},connected_instagram_account{id,username}',
    );
    pagesUrl.searchParams.set('access_token', userToken);
    let payload: unknown;
    try {
        const res = await fetchImpl(pagesUrl.toString(), { method: 'GET' });
        if (!res.ok) return { ok: false, error: 'exchange_failed', callsNetwork: true };
        payload = await res.json();
    } catch {
        return { ok: false, error: 'exchange_failed', callsNetwork: true };
    }
    const page = pickProfessionalPage(payload);
    if (!page) return { ok: false, error: 'no_professional_account', callsNetwork: true };
    return { ok: true, callsNetwork: true, ...page };
}

export function mapInstagramConversations(payload: unknown, igUserId: string): SocialInboxMessage[] {
    const root = asRecord(payload);
    const threads = root && Array.isArray(root.data) ? root.data : [];
    const own = String(igUserId || '').trim();
    const rows: SocialInboxMessage[] = [];
    for (const thread of threads) {
        const conversation = asRecord(thread);
        if (!conversation) continue;
        const participants = asRecord(conversation.participants);
        const people = participants && Array.isArray(participants.data) ? participants.data : [];
        const messages = asRecord(conversation.messages);
        const list = messages && Array.isArray(messages.data) ? messages.data : [];
        for (const item of list) {
            const message = asRecord(item);
            if (!message) continue;
            const externalId = String(message.id || '').trim();
            const body = String(message.message || '').trim();
            const from = asRecord(message.from);
            const fromId = String(from?.id || '').trim();
            const occurredAt = String(message.created_time || '').trim();
            if (!externalId || !body || !occurredAt || !fromId) continue;
            const other = people
                .map((person) => asRecord(person))
                .find((person) => person && String(person.id || '') !== own && String(person.id || '') !== fromId);
            const counterparty = fromId === own
                ? String(other?.username || other?.id || '').trim()
                : String(from?.username || fromId).trim();
            if (!counterparty) continue;
            rows.push({
                id: externalId,
                externalId,
                channel: 'instagram',
                externalAccount: own,
                counterparty,
                direction: fromId === own ? 'out' : 'in',
                body,
                occurredAt,
            });
        }
    }
    return rows;
}

export async function pullInstagramInboxMessages(input: {
    token?: string | null;
    igUserId?: string | null;
    pageId?: string | null;
    fetchImpl?: FetchImpl;
}): Promise<SocialInboxMessage[]> {
    const token = String(input.token ?? '').trim();
    const igUserId = String(input.igUserId ?? '').trim();
    const pageId = String(input.pageId ?? '').trim();
    if (!token || !/^\d+$/.test(igUserId) || !/^\d+$/.test(pageId)) return [];
    const fetchImpl = input.fetchImpl ?? fetch;
    const url = new URL(`${GRAPH}/${pageId}/conversations`);
    url.searchParams.set('platform', 'instagram');
    url.searchParams.set('fields', 'participants,messages.limit(25){id,message,from,created_time}');
    url.searchParams.set('access_token', token);
    try {
        const res = await fetchImpl(url.toString(), { method: 'GET' });
        if (!res.ok) return [];
        return mapInstagramConversations(await res.json(), igUserId);
    } catch {
        return [];
    }
}

export type InstagramWebhookRow = {
    externalId: string;
    externalAccount: string;
    counterparty: string;
    direction: 'in' | 'out';
    body: string;
    occurredAt: string;
    lookupId: string;
};

/** Webhook gövdesinden gerçek mesajlar. Boş veya yabancı gövde boş dizi döner. */
export function instagramMessagesFromWebhook(body: unknown): InstagramWebhookRow[] {
    const root = asRecord(body);
    if (!root || (root.object !== 'instagram' && root.object !== 'page')) return [];
    const entries = Array.isArray(root.entry) ? root.entry : [];
    const rows: InstagramWebhookRow[] = [];
    for (const entry of entries) {
        const item = asRecord(entry);
        if (!item) continue;
        const accountId = String(item.id || '').trim();
        const events = Array.isArray(item.messaging) ? item.messaging : [];
        for (const event of events) {
            const messaging = asRecord(event);
            if (!messaging) continue;
            const message = asRecord(messaging.message);
            const text = String(message?.text || '').trim();
            const externalId = String(message?.mid || message?.id || '').trim();
            const sender = String(asRecord(messaging.sender)?.id || '').trim();
            const recipient = String(asRecord(messaging.recipient)?.id || '').trim();
            const stamp = epochIso(messaging.timestamp);
            if (!accountId || !text || !externalId || !sender || !recipient || !stamp) continue;
            const outgoing = message?.is_echo === true || sender === accountId;
            rows.push({
                externalId,
                externalAccount: accountId,
                counterparty: outgoing ? recipient : sender,
                direction: outgoing ? 'out' : 'in',
                body: text,
                occurredAt: stamp,
                lookupId: accountId,
            });
        }
    }
    return rows;
}

function epochIso(value: unknown): string {
    const raw = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return '';
    const ms = raw > 10_000_000_000 ? raw : raw * 1000;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

export type InstagramConnectClientResult =
    | { ok: true; accountName: string }
    | { ok: false; error: string };

/**
 * Tarayıcı kodu köprüye yollar. Gizli anahtar gövdeye konmaz.
 * Kimlik yoksa istek atılmaz.
 */
export async function completeInstagramConnect(input: {
    appId?: string | null;
    code?: string | null;
    redirectUri: string;
    state: string;
    connStr: string;
    bridgeUrl: string;
    fetchImpl?: FetchImpl;
}): Promise<InstagramConnectClientResult> {
    const appId = String(input.appId ?? '').trim();
    const code = String(input.code ?? '').trim();
    if (!appId) return { ok: false, error: 'missing_app_id' };
    if (!code) return { ok: false, error: 'missing_code' };
    const bridge = String(input.bridgeUrl || '').trim().replace(/\/$/, '');
    const connStr = String(input.connStr || '').trim();
    if (!bridge || !connStr) return { ok: false, error: 'exchange_failed' };
    const fetchImpl = input.fetchImpl ?? fetch;
    try {
        const res = await fetchImpl(`${bridge}/api/clinic/instagram/exchange`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                redirectUri: input.redirectUri,
                state: input.state,
                connStr,
            }),
        });
        const payload = asRecord(await res.json().catch(() => null));
        if (!res.ok || payload?.ok !== true) {
            return { ok: false, error: String(payload?.error || 'exchange_failed') };
        }
        const accountName = String(payload.accountName || '').trim();
        if (!accountName) return { ok: false, error: 'exchange_failed' };
        return { ok: true, accountName };
    } catch {
        return { ok: false, error: 'exchange_failed' };
    }
}
