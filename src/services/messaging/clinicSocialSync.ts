/**
 * Klinik gelen kutu senkronu.
 * Instagram belirteci tarayıcı deposuna yazılmaz. WhatsApp listesi backoffice kaydındandır.
 */
import { getBridgeUrl } from '../../utils/env';
import { ERP_SETTINGS, getPrimarySqlConnectionString } from '../postgres';
import {
    assembleClinicInbox,
    type ClinicInboxSnapshot,
    type SocialInboxMessage,
} from './clinicSocialInbox';
import { listSocialAccounts, listSocialMessages, readBackofficeWhatsApp } from './clinicSocialRepository';

function firmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

export async function requestSocialSync(fetchImpl?: typeof fetch): Promise<SocialInboxMessage[]> {
    const bridge = String(getBridgeUrl() || '').trim().replace(/\/$/, '');
    const connStr = getPrimarySqlConnectionString();
    if (!bridge || !connStr) return [];
    const call = fetchImpl ?? fetch;
    const res = await call(`${bridge}/api/clinic/social/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connStr, firmNr: firmNr() }),
    });
    if (!res.ok) return [];
    const payload = await res.json() as { messages?: SocialInboxMessage[] };
    return Array.isArray(payload.messages) ? payload.messages : [];
}

export async function prepareClinicInbox(): Promise<ClinicInboxSnapshot> {
    const synced = await requestSocialSync().catch(() => [] as SocialInboxMessage[]);
    return assembleClinicInbox({
        listAccounts: listSocialAccounts,
        listMessages: async () => {
            const stored = await listSocialMessages();
            return [...stored, ...synced];
        },
        readWhatsApp: readBackofficeWhatsApp,
    });
}
