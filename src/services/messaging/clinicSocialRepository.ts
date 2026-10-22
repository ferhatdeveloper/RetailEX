import { ERP_SETTINGS, PostgresConnection } from '../postgres';
import {
    isSocialChannel,
    type SocialChannel,
    type SocialInboxMessage,
} from './clinicSocialInbox';

export type SocialChannelAccount = {
    channel: SocialChannel;
    externalAccount: string;
    accountName: string;
};

function firmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

export async function listSocialAccounts(): Promise<SocialChannelAccount[]> {
    try {
        const { rows } = await PostgresConnection.getInstance().query<{
            channel: string;
            external_account: string | null;
            account_name: string | null;
        }>(
            `SELECT channel, external_account, account_name
               FROM beauty.social_channel_accounts
              WHERE firm_nr = $1`,
            [firmNr()],
        );
        return rows.flatMap((row) => {
            const channel = String(row.channel);
            if (!isSocialChannel(channel)) return [];
            const accountName = String(row.account_name || '').trim();
            if (!accountName) return [];
            return [{
                channel,
                externalAccount: String(row.external_account || ''),
                accountName,
            }];
        });
    } catch {
        return [];
    }
}

export async function disconnectSocialAccount(channel: SocialChannel): Promise<void> {
    await PostgresConnection.getInstance().query(
        `DELETE FROM beauty.social_channel_accounts
          WHERE firm_nr = $1 AND channel = $2`,
        [firmNr(), channel],
    );
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
