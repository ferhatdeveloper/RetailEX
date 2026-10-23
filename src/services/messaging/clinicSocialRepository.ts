import { ERP_SETTINGS, PostgresConnection } from '../postgres';
import {
    DELETE_SOCIAL_ACCOUNT_SQL,
    isSocialChannel,
    type BackofficeWhatsAppRecord,
    type SocialChannel,
    type SocialInboxMessage,
} from './clinicSocialInbox';

export type SocialChannelAccount = {
    channel: SocialChannel;
    externalAccount: string;
    accountName: string;
    linked: boolean;
};

function firmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function mapAccount(row: {
    channel: string;
    external_account: string | null;
    account_name: string | null;
    linked?: boolean | null;
}): SocialChannelAccount | null {
    const channel = String(row.channel);
    if (!isSocialChannel(channel)) return null;
    const accountName = String(row.account_name || '').trim();
    if (!accountName) return null;
    return {
        channel,
        externalAccount: String(row.external_account || ''),
        accountName,
        linked: row.linked === true,
    };
}

export async function listSocialAccounts(): Promise<SocialChannelAccount[]> {
    const params = [firmNr()];
    try {
        const db = PostgresConnection.getInstance();
        const { rows } = await db.query<{
            channel: string;
            external_account: string | null;
            account_name: string | null;
            linked: boolean | null;
        }>(
            `SELECT channel, external_account, account_name,
                    (COALESCE(btrim(page_access_token), '') <> '') AS linked
               FROM beauty.social_channel_accounts
              WHERE firm_nr = $1`,
            params,
        );
        return rows.flatMap((row) => {
            const mapped = mapAccount(row);
            return mapped ? [mapped] : [];
        });
    } catch {
        try {
            const db = PostgresConnection.getInstance();
            const { rows } = await db.query<{
                channel: string;
                external_account: string | null;
                account_name: string | null;
            }>(
                `SELECT channel, external_account, account_name
                   FROM beauty.social_channel_accounts
                  WHERE firm_nr = $1`,
                params,
            );
            return rows.flatMap((row) => {
                const mapped = mapAccount({ ...row, linked: false });
                return mapped ? [mapped] : [];
            });
        } catch {
            return [];
        }
    }
}

export async function disconnectSocialAccount(channel: SocialChannel): Promise<void> {
    await PostgresConnection.getInstance().query(DELETE_SOCIAL_ACCOUNT_SQL, [firmNr(), channel]);
}

/** Belirteç sütunu seçilmez. Bağlılık yalnızca has_token ile planlanır. */
export async function readBackofficeWhatsApp(): Promise<BackofficeWhatsAppRecord | null> {
    try {
        const db = PostgresConnection.getInstance();
        const table = db.getCardTableName('messaging_settings', 'public');
        const { rows } = await db.query<BackofficeWhatsAppRecord & { has_token?: boolean | null }>(
            `SELECT whatsapp_provider, whatsapp_base_url, whatsapp_instance_id, whatsapp_phone_id,
                    (whatsapp_token IS NOT NULL AND btrim(whatsapp_token) <> '') AS has_token
               FROM ${table}
              ORDER BY created_at ASC
              LIMIT 1`,
        );
        const row = rows[0];
        if (!row) return null;
        return {
            whatsapp_provider: row.whatsapp_provider,
            whatsapp_base_url: row.whatsapp_base_url,
            whatsapp_instance_id: row.whatsapp_instance_id,
            whatsapp_phone_id: row.whatsapp_phone_id,
            has_token: row.has_token === true,
        };
    } catch {
        return null;
    }
}

export async function listSocialMessages(): Promise<SocialInboxMessage[]> {
    try {
        const { rows } = await PostgresConnection.getInstance().query<{
            id: string;
            channel: string;
            external_account: string | null;
            counterparty: string | null;
            direction: string;
            body: string | null;
            occurred_at: string;
        }>(
            `SELECT id::text AS id, channel, external_account, counterparty, direction, body, occurred_at
               FROM beauty.social_inbox_messages
              WHERE firm_nr = $1
                AND channel IN ('instagram', 'whatsapp')
              ORDER BY occurred_at ASC`,
            [firmNr()],
        );
        return rows.flatMap((row) => {
            const channel = String(row.channel);
            if (!isSocialChannel(channel)) return [];
            const direction = row.direction === 'out' ? 'out' : row.direction === 'in' ? 'in' : null;
            if (!direction) return [];
            return [{
                id: String(row.id),
                channel,
                externalAccount: String(row.external_account || ''),
                counterparty: String(row.counterparty || ''),
                direction,
                body: String(row.body || ''),
                occurredAt: String(row.occurred_at || ''),
            }];
        });
    } catch {
        return [];
    }
}
