/**
 * Klinik V2 gelen kutu — Instagram ve WhatsApp.
 * Meta OAuth adresi yalnızca META_APP_ID ortam değişkeninden kurulur.
 * Gizli anahtar bu dosyada yoktur. Belirteç düz metin olarak dönülmez.
 */

export const META_APP_ID_ENV = 'META_APP_ID';

export const SOCIAL_INBOX_CHANNELS = ['instagram', 'whatsapp'] as const;

export type SocialChannel = (typeof SOCIAL_INBOX_CHANNELS)[number];

export type SocialInboxMessage = {
    id: string;
    channel: SocialChannel;
    externalAccount: string;
    counterparty: string;
    direction: 'in' | 'out';
    body: string;
    occurredAt: string;
    externalId?: string;
};

export type SocialInboxThread = {
    id: string;
    channel: SocialChannel;
    sender: string;
    lastMessage: string;
    occurredAt: string;
    messages: SocialInboxMessage[];
};

/** Vite `/__wa_bridge` hedefi ve köprüdeki WA_BRIDGE_PORT varsayılanı. */
export const WA_BRIDGE_DEFAULT_PORT = '3000';

const OAUTH_VERSION = 'v21.0';

const OAUTH_SCOPES: Record<SocialChannel, readonly string[]> = {
    instagram: [
        'instagram_basic',
        'instagram_manage_messages',
        'pages_show_list',
        'pages_messaging',
        'pages_read_engagement',
        'business_management',
    ],
    whatsapp: [
        'whatsapp_business_management',
        'whatsapp_business_messaging',
        'business_management',
    ],
};

export function isSocialChannel(value: string): value is SocialChannel {
    return (SOCIAL_INBOX_CHANNELS as readonly string[]).includes(value);
}

export function readMetaAppId(env?: { META_APP_ID?: string | null }): string {
    if (env) return String(env.META_APP_ID ?? '').trim();
    const fromVite = (import.meta.env as { META_APP_ID?: string }).META_APP_ID;
    return String(fromVite ?? '').trim();
}

export function metaOAuthRedirectUri(origin: string): string {
    const base = String(origin || '').replace(/\/$/, '');
    return `${base}/clinic/meta-oauth`;
}

export function metaOAuthState(channel: SocialChannel, firmNr: string): string {
    return `${channel}:${String(firmNr || '').trim()}`;
}

/**
 * Meta OAuth başlangıç adresi. Uygulama kimliği yoksa URL üretilmez.
 */
export function buildMetaOAuthStart(input: {
    appId?: string | null;
    channel: SocialChannel;
    redirectUri: string;
    state: string;
}): { url: string } | { error: 'missing_app_id' } {
    const appId = String(input.appId ?? '').trim();
    if (!appId) return { error: 'missing_app_id' };
    const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: input.redirectUri,
        state: input.state,
        response_type: 'code',
        scope: OAUTH_SCOPES[input.channel].join(','),
    });
    return { url: `https://www.facebook.com/${OAUTH_VERSION}/dialog/oauth?${params.toString()}` };
}

export function openSocialOAuth(url: string | null | undefined): boolean {
    const target = String(url || '');
    if (!target.startsWith('https://www.facebook.com/')) return false;
    if (typeof window === 'undefined') return false;
    window.open(target, '_blank', 'noopener,noreferrer');
    return true;
}

/**
 * Belirteç yokken boş dizi. Uydurma konuşma eklenmez.
 * Yalnızca Instagram ve WhatsApp satırları kalır.
 */
export function buildInboxThreads(input: {
    token?: string | null;
    messages: SocialInboxMessage[];
    channel?: SocialChannel;
}): SocialInboxThread[] {
    if (!String(input.token ?? '').trim()) return [];
    const grouped = new Map<string, SocialInboxMessage[]>();
    for (const row of input.messages) {
        if (!isSocialChannel(row.channel)) continue;
        if (input.channel && row.channel !== input.channel) continue;
        const key = `${row.channel}\n${row.externalAccount}\n${row.counterparty}`;
        const list = grouped.get(key) ?? [];
        list.push(row);
        grouped.set(key, list);
    }
    const threads: SocialInboxThread[] = [];
    for (const [id, list] of grouped) {
        const messages = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        const last = messages[messages.length - 1];
        if (!last) continue;
        threads.push({
            id,
            channel: last.channel,
            sender: last.counterparty,
            lastMessage: last.body,
            occurredAt: last.occurredAt,
            messages,
        });
    }
    threads.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return threads;
}

export function whatsappBridgePort(baseUrl: string | null | undefined): string | null {
    const raw = String(baseUrl ?? '').trim();
    if (!raw) return null;
    if (raw.startsWith('/')) return WA_BRIDGE_DEFAULT_PORT;
    try {
        const url = new URL(raw);
        if (url.port) return url.port;
        return url.protocol === 'https:' ? '443' : '80';
    } catch {
        return null;
    }
}

export type WhatsAppBridgeHealth = 'loading' | 'connected' | 'scanning' | 'disconnected' | 'down';

export function whatsappBridgeHealth(res: { ok: boolean; status?: string | null } | null): WhatsAppBridgeHealth {
    if (!res) return 'loading';
    if (!res.ok) return 'down';
    if (res.status === 'connected') return 'connected';
    if (res.status === 'scanning') return 'scanning';
    return 'disconnected';
}

/** Koparma yalnızca hesap satırını siler. Mesaj tablosuna dokunmaz. */
export const DELETE_SOCIAL_ACCOUNT_SQL =
    'DELETE FROM beauty.social_channel_accounts WHERE firm_nr = $1 AND channel = $2';

export const UPSERT_INSTAGRAM_ACCOUNT_SQL = `
INSERT INTO beauty.social_channel_accounts
    (firm_nr, channel, external_account, account_name, page_id, page_access_token)
VALUES ($1, 'instagram', $2, $3, $4, $5)
ON CONFLICT (firm_nr, channel) DO UPDATE SET
    external_account = EXCLUDED.external_account,
    account_name = EXCLUDED.account_name,
    page_id = EXCLUDED.page_id,
    page_access_token = EXCLUDED.page_access_token,
    connected_at = CURRENT_TIMESTAMP`;

export const INSERT_INBOX_MESSAGE_SQL = `
INSERT INTO beauty.social_inbox_messages
    (firm_nr, channel, external_account, counterparty, direction, body, occurred_at, external_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (firm_nr, channel, external_id) WHERE external_id <> '' DO NOTHING`;

export type BackofficeWhatsAppRecord = {
    whatsapp_provider?: string | null;
    whatsapp_base_url?: string | null;
    whatsapp_token?: string | null;
    whatsapp_instance_id?: string | null;
    whatsapp_phone_id?: string | null;
    has_token?: boolean | null;
};

export type WhatsAppInboxSource = 'none' | 'evolution' | 'bridge' | 'meta';

export type WhatsAppInboxPlan = {
    connected: boolean;
    source: WhatsAppInboxSource;
    url: string;
};

const WHATSAPP_INBOX_NONE: WhatsAppInboxPlan = { connected: false, source: 'none', url: '' };

function recordHasToken(record: BackofficeWhatsAppRecord): boolean {
    if (String(record.whatsapp_token || '').trim()) return true;
    return record.has_token === true;
}

function providerCode(value: string | null | undefined): string {
    return String(value || '').trim().toUpperCase();
}

function trimBase(value: string | null | undefined): string {
    return String(value || '').trim().replace(/\/+$/, '').replace(/\/status$/i, '');
}

/**
 * Backoffice `rex_{firma}_messaging_settings` satırından liste adresi.
 * Sağlayıcı NONE veya eksikse ağ çağrısı planlanmaz.
 */
export function planWhatsAppInboxList(record: BackofficeWhatsAppRecord | null | undefined): WhatsAppInboxPlan {
    if (!record) return WHATSAPP_INBOX_NONE;
    const provider = providerCode(record.whatsapp_provider);
    const base = trimBase(record.whatsapp_base_url);
    const instance = String(record.whatsapp_instance_id || '').trim();
    const phoneId = String(record.whatsapp_phone_id || '').trim();
    const token = recordHasToken(record);
    if (provider === 'EVOLUTION') {
        if (!base || !instance || !token) return WHATSAPP_INBOX_NONE;
        return {
            connected: true,
            source: 'evolution',
            url: `${base}/chat/findMessages/${encodeURIComponent(instance)}`,
        };
    }
    if (provider === 'EMBEDDED') {
        if (!base) return WHATSAPP_INBOX_NONE;
        return { connected: true, source: 'bridge', url: `${base}/messages` };
    }
    if (provider === 'META') {
        if (!token || !phoneId) return WHATSAPP_INBOX_NONE;
        return { connected: true, source: 'meta', url: '' };
    }
    return WHATSAPP_INBOX_NONE;
}

export function firmNrFromOAuthState(state: string | null | undefined): string | null {
    const parts = String(state || '').trim().split(':');
    if (parts.length !== 2 || parts[0] !== 'instagram') return null;
    const digits = parts[1].replace(/\D/g, '');
    if (!digits) return null;
    return digits.padStart(3, '0').slice(0, 10);
}

export function selectInboxRows(input: {
    messages: SocialInboxMessage[];
    instagramConnected: boolean;
    whatsappConnected: boolean;
    channel?: SocialChannel;
}): SocialInboxMessage[] {
    return input.messages
        .filter((row) => {
            if (!isSocialChannel(row.channel)) return false;
            if (input.channel && row.channel !== input.channel) return false;
            if (row.channel === 'instagram' && !input.instagramConnected) return false;
            if (row.channel === 'whatsapp' && !input.whatsappConnected) return false;
            return true;
        })
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function messageText(message: Record<string, unknown> | null): string {
    if (!message) return '';
    if (typeof message.conversation === 'string') return message.conversation.trim();
    const extended = asRecord(message.extendedTextMessage);
    if (extended && typeof extended.text === 'string') return extended.text.trim();
    const image = asRecord(message.imageMessage);
    if (image && typeof image.caption === 'string') return image.caption.trim();
    if (typeof message.text === 'string') return message.text.trim();
    if (typeof message.body === 'string') return message.body.trim();
    return '';
}

function epochToIso(value: unknown): string {
    const raw = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return '';
    const ms = raw > 10_000_000_000 ? raw : raw * 1000;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
}

function evolutionList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    const row = asRecord(payload);
    if (!row) return [];
    if (Array.isArray(row.messages)) return row.messages;
    const nested = asRecord(row.messages);
    if (nested && Array.isArray(nested.records)) return nested.records;
    if (Array.isArray(row.records)) return row.records;
    if (Array.isArray(row.data)) return row.data;
    return [];
}

export function mapEvolutionInboxPayload(payload: unknown, externalAccount = ''): SocialInboxMessage[] {
    const rows: SocialInboxMessage[] = [];
    for (const item of evolutionList(payload)) {
        const row = asRecord(item);
        if (!row) continue;
        const key = asRecord(row.key) ?? {};
        const remote = String(key.remoteJid || row.remoteJid || '');
        if (!remote || remote === 'status@broadcast' || remote.endsWith('@g.us') || remote.endsWith('@broadcast')) continue;
        const externalId = String(key.id || row.id || '').trim();
        const body = messageText(asRecord(row.message)) || messageText(row);
        if (!externalId || !body) continue;
        const digits = remote.replace(/@.*/, '').replace(/\D/g, '');
        const occurredAt = epochToIso(row.messageTimestamp) || String(row.occurredAt || row.occurred_at || '');
        if (!occurredAt) continue;
        rows.push({
            id: externalId,
            externalId,
            channel: 'whatsapp',
            externalAccount,
            counterparty: digits || remote,
            direction: key.fromMe === true || row.fromMe === true ? 'out' : 'in',
            body,
            occurredAt,
        });
    }
    return rows;
}

export function mapBridgeInboxPayload(payload: unknown, externalAccount = ''): SocialInboxMessage[] {
    const row = asRecord(payload);
    const list = row && Array.isArray(row.messages) ? row.messages : Array.isArray(payload) ? payload : [];
    const rows: SocialInboxMessage[] = [];
    for (const item of list) {
        const message = asRecord(item);
        if (!message) continue;
        const externalId = String(message.id || '').trim();
        const body = String(message.body || '').trim();
        const direction = message.direction === 'out' ? 'out' : message.direction === 'in' ? 'in' : null;
        const occurredAt = String(message.occurredAt || message.occurred_at || '').trim();
        const counterparty = String(message.counterparty || '').trim();
        if (!externalId || !body || !direction || !occurredAt || !counterparty) continue;
        rows.push({
            id: externalId,
            externalId,
            channel: 'whatsapp',
            externalAccount,
            counterparty,
            direction,
            body,
            occurredAt,
        });
    }
    return rows;
}

export async function pullWhatsAppInboxMessages(input: {
    record: BackofficeWhatsAppRecord | null | undefined;
    fetchImpl?: typeof fetch;
}): Promise<SocialInboxMessage[]> {
    const plan = planWhatsAppInboxList(input.record);
    if (!plan.connected || !plan.url || !input.record) return [];
    const fetchImpl = input.fetchImpl ?? fetch;
    const token = String(input.record.whatsapp_token || '').trim();
    const externalAccount = String(input.record.whatsapp_instance_id || input.record.whatsapp_phone_id || plan.source);
    try {
        if (plan.source === 'evolution') {
            if (!token) return [];
            const res = await fetchImpl(plan.url, {
                method: 'POST',
                headers: {
                    apikey: token,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ limit: 50 }),
            });
            if (!res.ok) return [];
            return mapEvolutionInboxPayload(await res.json(), externalAccount);
        }
        if (plan.source === 'bridge') {
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const res = await fetchImpl(plan.url, { method: 'GET', headers });
            if (!res.ok) return [];
            return mapBridgeInboxPayload(await res.json(), externalAccount);
        }
    } catch {
        return [];
    }
    return [];
}

export type ClinicInboxSnapshot = {
    instagramConnected: boolean;
    whatsappConnected: boolean;
    whatsappSource: WhatsAppInboxSource;
    messages: SocialInboxMessage[];
};

export async function assembleClinicInbox(deps: {
    listAccounts: () => Promise<Array<{ channel: string; linked?: boolean }>>;
    listMessages: () => Promise<SocialInboxMessage[]>;
    readWhatsApp: () => Promise<BackofficeWhatsAppRecord | null>;
    pullWhatsApp?: (record: BackofficeWhatsAppRecord) => Promise<SocialInboxMessage[]>;
    pullInstagram?: () => Promise<SocialInboxMessage[]>;
}): Promise<ClinicInboxSnapshot> {
    const [accounts, record, stored] = await Promise.all([
        deps.listAccounts(),
        deps.readWhatsApp(),
        deps.listMessages(),
    ]);
    const plan = planWhatsAppInboxList(record);
    const instagramConnected = accounts.some((row) => row.channel === 'instagram' && row.linked === true);
    const pulled: SocialInboxMessage[] = [];
    if (instagramConnected && deps.pullInstagram) {
        pulled.push(...await deps.pullInstagram());
    }
    if (plan.connected && record && deps.pullWhatsApp) {
        pulled.push(...await deps.pullWhatsApp(record));
    }
    return {
        instagramConnected,
        whatsappConnected: plan.connected,
        whatsappSource: plan.source,
        messages: selectInboxRows({
            messages: dedupeMessages([...stored, ...pulled]),
            instagramConnected,
            whatsappConnected: plan.connected,
        }),
    };
}

function dedupeMessages(rows: SocialInboxMessage[]): SocialInboxMessage[] {
    const seen = new Set<string>();
    const out: SocialInboxMessage[] = [];
    for (const row of rows) {
        const key = row.externalId ? `${row.channel}:${row.externalId}` : `${row.channel}:${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}
