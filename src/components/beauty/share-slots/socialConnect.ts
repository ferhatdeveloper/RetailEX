/**
 * V2 ayarlarındaki Instagram / WhatsApp bağlan grubu hesabı
 * beauty.social_channel_accounts içinde tutar; sayfa belirteci o tabloda yoktur.
 * Belirteç aynı yerel anahtarda aranır. META_APP_ID, clinicSocialInbox.readMetaAppId ile okunur.
 * Kayıt ve belirteç yoksa düğme bağlan deyinceye kadar bekler.
 */
import { readMetaAppId } from '../../../services/messaging/clinicSocialInbox';
export const CLINIC_V2_SOCIAL_CONNECT_KEY = 'retailex_clinic_v2_social_connect';
export const CLINIC_V2_SOCIAL_FOCUS_KEY = 'retailex_clinic_v2_social_focus';
export const CLINIC_V2_WA_RECIPIENTS_KEY = 'retailex_clinic_v2_wa_recipients';

export type SocialConnectChannel = 'instagram' | 'whatsapp';

export type SocialChat = { label: string; number: string };

export type ClinicSocialConnect = {
    instagram: {
        connected: boolean;
        metaAppId: string;
        pageAccessToken: string;
        igUserId: string;
    };
    whatsapp: {
        connected: boolean;
        accessToken: string;
        phoneId: string;
        bridgeBaseUrl: string;
        bridgeToken: string;
        savedNumber: string;
        recentChats: SocialChat[];
    };
};

export type PortalWhatsAppSnapshot = {
    whatsapp_provider?: string | null;
    whatsapp_token?: string | null;
    whatsapp_phone_id?: string | null;
    whatsapp_base_url?: string | null;
};

export type SocialAccountHint = {
    channel: string;
    externalAccount?: string | null;
    accountName?: string | null;
};

export type SocialChatHint = {
    channel: string;
    counterparty?: string | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const EMPTY: ClinicSocialConnect = {
    instagram: { connected: false, metaAppId: '', pageAccessToken: '', igUserId: '' },
    whatsapp: {
        connected: false,
        accessToken: '',
        phoneId: '',
        bridgeBaseUrl: '',
        bridgeToken: '',
        savedNumber: '',
        recentChats: [],
    },
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function pickString(row: Record<string, unknown> | null, keys: string[]): string {
    if (!row) return '';
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function pickChats(value: unknown): SocialChat[] {
    if (!Array.isArray(value)) return [];
    const chats: SocialChat[] = [];
    for (const item of value) {
        const row = asRecord(item);
        if (!row) continue;
        const number = pickString(row, ['number', 'phone', 'to', 'jid']);
        if (!number) continue;
        const label = pickString(row, ['label', 'name', 'title']) || number;
        chats.push({ label, number });
    }
    return chats.slice(0, 12);
}

function accountExternal(accounts: SocialAccountHint[] | null | undefined, channel: string): string {
    const row = (accounts || []).find((item) => item.channel === channel);
    const value = String(row?.externalAccount || '').trim();
    return /^\d+$/.test(value) ? value : '';
}

function chatsFromHints(rows: SocialChatHint[] | null | undefined): SocialChat[] {
    const chats: SocialChat[] = [];
    for (const row of rows || []) {
        if (row.channel !== 'whatsapp') continue;
        const raw = String(row.counterparty || '').trim();
        const number = raw.replace(/\D/g, '');
        if (number.length < 8) continue;
        chats.push({ label: raw, number });
    }
    return chats;
}

function browserStorage(kind: 'local' | 'session'): StorageLike | null {
    try {
        if (typeof window === 'undefined') return null;
        return kind === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
        return null;
    }
}

function readJson(storage: StorageLike | null, key: string): unknown {
    if (!storage) return null;
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function portalWhatsApp(portal: PortalWhatsAppSnapshot | null | undefined): {
    accessToken: string;
    phoneId: string;
    bridgeBaseUrl: string;
    bridgeToken: string;
} {
    const blank = { accessToken: '', phoneId: '', bridgeBaseUrl: '', bridgeToken: '' };
    if (!portal) return blank;
    const provider = String(portal.whatsapp_provider || '').trim().toUpperCase();
    if (provider === 'NONE' || provider === 'EVOLUTION') return blank;
    const token = String(portal.whatsapp_token || '').trim();
    const phoneId = String(portal.whatsapp_phone_id || '').trim();
    const base = String(portal.whatsapp_base_url || '').trim();
    if (provider === 'META' || (!provider && token && phoneId)) {
        return { accessToken: token, phoneId, bridgeBaseUrl: '', bridgeToken: '' };
    }
    if (provider === 'EMBEDDED' || (!provider && base)) {
        return { accessToken: '', phoneId: '', bridgeBaseUrl: base, bridgeToken: token };
    }
    return blank;
}

function savedRecipients(storage: StorageLike | null): SocialChat[] {
    const parsed = readJson(storage, CLINIC_V2_WA_RECIPIENTS_KEY);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((item) => String(item || '').trim())
        .filter((number) => number.length > 0)
        .slice(0, 8)
        .map((number) => ({ label: number, number }));
}

export function readClinicSocialConnect(input?: {
    storage?: StorageLike | null;
    portal?: PortalWhatsAppSnapshot | null;
    env?: { META_APP_ID?: string | null };
    accounts?: SocialAccountHint[] | null;
    chats?: SocialChatHint[] | null;
}): ClinicSocialConnect {
    const storage = input && 'storage' in input ? input.storage ?? null : browserStorage('local');
    const session = input?.storage ? null : browserStorage('session');
    const parsed = asRecord(readJson(storage, CLINIC_V2_SOCIAL_CONNECT_KEY))
        ?? asRecord(readJson(session, CLINIC_V2_SOCIAL_CONNECT_KEY));
    const instagramRow = asRecord(parsed?.instagram) ?? parsed;
    const whatsappRow = asRecord(parsed?.whatsapp) ?? null;
    const metaFromEnv = input && 'env' in input
        ? readMetaAppId({ META_APP_ID: input.env?.META_APP_ID ?? null })
        : readMetaAppId();
    const metaAppId = pickString(instagramRow, ['metaAppId', 'meta_app_id', 'appId', 'app_id']) || metaFromEnv;
    const pageAccessToken = pickString(instagramRow, [
        'pageAccessToken', 'page_access_token', 'pageToken', 'page_token',
    ]);
    const igUserId = pickString(instagramRow, [
        'igUserId', 'ig_user_id', 'instagramUserId', 'instagram_user_id',
    ]) || accountExternal(input?.accounts, 'instagram');
    const fromPortal = portalWhatsApp(input?.portal);
    const accessToken = pickString(whatsappRow, ['accessToken', 'access_token', 'cloudToken', 'token'])
        || fromPortal.accessToken;
    const phoneId = pickString(whatsappRow, ['phoneId', 'phone_id', 'phoneNumberId', 'whatsapp_phone_id'])
        || fromPortal.phoneId
        || accountExternal(input?.accounts, 'whatsapp');
    const bridgeBaseUrl = pickString(whatsappRow, ['bridgeBaseUrl', 'bridge_base_url', 'baseUrl', 'whatsapp_base_url'])
        || fromPortal.bridgeBaseUrl;
    const bridgeToken = pickString(whatsappRow, ['bridgeToken', 'bridge_token'])
        || (bridgeBaseUrl ? fromPortal.bridgeToken : '');
    const savedNumber = pickString(whatsappRow, ['savedNumber', 'saved_number', 'number']);
    const recentChats = [
        ...pickChats(whatsappRow?.recentChats ?? whatsappRow?.recent_chats ?? whatsappRow?.chats),
        ...chatsFromHints(input?.chats),
        ...savedRecipients(storage),
    ].filter((chat, index, list) => list.findIndex((item) => item.number === chat.number) === index);
    const instagramConnected = Boolean(metaAppId && pageAccessToken && igUserId);
    const whatsappConnected = Boolean((accessToken && phoneId) || bridgeBaseUrl);
    return {
        instagram: {
            connected: instagramConnected,
            metaAppId,
            pageAccessToken,
            igUserId,
        },
        whatsapp: {
            connected: whatsappConnected,
            accessToken,
            phoneId,
            bridgeBaseUrl,
            bridgeToken,
            savedNumber,
            recentChats,
        },
    };
}

export function emptySocialConnect(): ClinicSocialConnect {
    return {
        instagram: { ...EMPTY.instagram },
        whatsapp: { ...EMPTY.whatsapp, recentChats: [] },
    };
}

export function rememberSocialConnectFocus(channel: SocialConnectChannel): void {
    const write = (storage: StorageLike | null) => {
        try {
            storage?.setItem(CLINIC_V2_SOCIAL_FOCUS_KEY, channel);
        } catch {
            /* depolama kapalı */
        }
    };
    write(browserStorage('session'));
    write(browserStorage('local'));
}

export function rememberWhatsAppRecipient(number: string): void {
    const digits = String(number || '').replace(/\D/g, '');
    if (digits.length < 8) return;
    const storage = browserStorage('local');
    if (!storage) return;
    try {
        const parsed = readJson(storage, CLINIC_V2_WA_RECIPIENTS_KEY);
        const prev = Array.isArray(parsed) ? parsed.map((item) => String(item || '').replace(/\D/g, '')).filter(Boolean) : [];
        const next = [digits, ...prev.filter((item) => item !== digits)].slice(0, 8);
        storage.setItem(CLINIC_V2_WA_RECIPIENTS_KEY, JSON.stringify(next));
    } catch {
        /* depolama kapalı */
    }
}
