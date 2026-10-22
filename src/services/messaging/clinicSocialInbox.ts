/**
 * Klinik V2 gelen kutu — Instagram ve WhatsApp.
 * Meta OAuth adresi yalnızca META_APP_ID ortam değişkeninden kurulur.
 * Gizli anahtar, belirteç veya şifre bu dosyada yoktur.
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
