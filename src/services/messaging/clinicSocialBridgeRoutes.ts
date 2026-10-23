/**
 * Klinik sosyal köprü uçları.
 * META_APP_SECRET ve sayfa belirteci yanıtta ve günlükte yer almaz.
 */
import type { Hono } from 'hono';
import {
    firmNrFromOAuthState,
    INSERT_INBOX_MESSAGE_SQL,
    pullWhatsAppInboxMessages,
    UPSERT_INSTAGRAM_ACCOUNT_SQL,
    type SocialInboxMessage,
} from './clinicSocialInbox';
import {
    exchangeInstagramAuthorization,
    instagramMessagesFromWebhook,
    pullInstagramInboxMessages,
} from './clinicInstagramConnect';

type Queryable = {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function safeFirm(value: unknown): string | null {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    return digits.padStart(3, '0').slice(0, 10);
}

function serverConnStr(): string {
    const raw = String(process.env.DATABASE_URL || '').trim();
    if (raw.startsWith('postgres')) return raw;
    const host = String(process.env.PGHOST || '').trim();
    const user = String(process.env.PGUSER || '').trim();
    const database = String(process.env.PGDATABASE || '').trim();
    if (!host || !user || !database) return '';
    const password = String(process.env.PGPASSWORD || '');
    const port = String(process.env.PGPORT || '5432').trim() || '5432';
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function acceptsConn(value: unknown): string {
    const conn = String(value || '').trim();
    if (!conn.startsWith('postgresql://') && !conn.startsWith('postgres://')) return '';
    return conn;
}

async function writeMessages(pool: Queryable, firmNr: string, rows: SocialInboxMessage[]): Promise<void> {
    for (const row of rows) {
        const externalId = String(row.externalId || row.id || '').trim();
        if (!externalId || !row.body) continue;
        await pool.query(INSERT_INBOX_MESSAGE_SQL, [
            firmNr,
            row.channel,
            row.externalAccount,
            row.counterparty,
            row.direction,
            row.body,
            row.occurredAt,
            externalId,
        ]);
    }
}

export function registerClinicSocialRoutes(app: Hono, getPool: (connStr: string) => Queryable): void {
    app.post('/api/clinic/instagram/exchange', async (c) => {
        const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
        const appId = String(process.env.META_APP_ID || '').trim();
        const appSecret = String(process.env.META_APP_SECRET || '').trim();
        const code = String(body.code || '').trim();
        const redirectUri = String(body.redirectUri || '').trim();
        const firmNr = firmNrFromOAuthState(String(body.state || ''));
        const connStr = acceptsConn(body.connStr);
        if (!appId) return c.json({ ok: false, error: 'missing_app_id' }, 400);
        if (!appSecret) return c.json({ ok: false, error: 'missing_app_secret' }, 400);
        if (!code || !redirectUri) return c.json({ ok: false, error: 'missing_code' }, 400);
        if (!firmNr || !connStr) return c.json({ ok: false, error: 'exchange_failed' }, 400);
        const exchanged = await exchangeInstagramAuthorization({
            appId,
            appSecret,
            code,
            redirectUri,
        });
        if (!exchanged.ok) return c.json({ ok: false, error: exchanged.error }, 400);
        try {
            await getPool(connStr).query(UPSERT_INSTAGRAM_ACCOUNT_SQL, [
                firmNr,
                exchanged.igUserId,
                exchanged.accountName,
                exchanged.pageId,
                exchanged.pageAccessToken,
            ]);
        } catch {
            return c.json({ ok: false, error: 'exchange_failed' }, 500);
        }
        return c.json({ ok: true, accountName: exchanged.accountName, igUserId: exchanged.igUserId });
    });

    app.post('/api/clinic/social/sync', async (c) => {
        const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
        const firmNr = safeFirm(body.firmNr);
        const connStr = acceptsConn(body.connStr);
        if (!firmNr || !connStr) return c.json({ ok: false, messages: [] }, 400);
        const pool = getPool(connStr);
        const collected: SocialInboxMessage[] = [];
        try {
            const ig = await pool.query(
                `SELECT external_account, page_id, page_access_token
                   FROM beauty.social_channel_accounts
                  WHERE firm_nr = $1 AND channel = 'instagram'
                  LIMIT 1`,
                [firmNr],
            );
            const account = ig.rows[0];
            const token = String(account?.page_access_token || '').trim();
            if (token) {
                collected.push(...await pullInstagramInboxMessages({
                    token,
                    igUserId: String(account?.external_account || ''),
                    pageId: String(account?.page_id || ''),
                }));
            }
        } catch {
            /* hesap tablosu yoksa Instagram çekilmez */
        }
        try {
            const table = `rex_${firmNr}_messaging_settings`;
            const wa = await pool.query(
                `SELECT whatsapp_provider, whatsapp_base_url, whatsapp_token,
                        whatsapp_instance_id, whatsapp_phone_id
                   FROM ${table}
                  ORDER BY created_at ASC
                  LIMIT 1`,
            );
            const record = wa.rows[0];
            if (record) {
                collected.push(...await pullWhatsAppInboxMessages({
                    record: {
                        whatsapp_provider: String(record.whatsapp_provider || ''),
                        whatsapp_base_url: String(record.whatsapp_base_url || ''),
                        whatsapp_token: String(record.whatsapp_token || ''),
                        whatsapp_instance_id: String(record.whatsapp_instance_id || ''),
                        whatsapp_phone_id: String(record.whatsapp_phone_id || ''),
                    },
                }));
            }
        } catch {
            /* backoffice tablosu yoksa WhatsApp listesi boş kalır */
        }
        try {
            await writeMessages(pool, firmNr, collected);
        } catch {
            /* şema gerideyse satırlar bu yanıtta kalır, uydurma satır eklenmez */
        }
        return c.json({
            ok: true,
            messages: collected.map((row) => ({
                id: row.id,
                externalId: row.externalId,
                channel: row.channel,
                externalAccount: row.externalAccount,
                counterparty: row.counterparty,
                direction: row.direction,
                body: row.body,
                occurredAt: row.occurredAt,
            })),
        });
    });

    app.get('/api/clinic/instagram/webhook', (c) => {
        const mode = c.req.query('hub.mode');
        const token = c.req.query('hub.verify_token');
        const challenge = c.req.query('hub.challenge') || '';
        const expected = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim();
        if (!expected || mode !== 'subscribe' || token !== expected) return c.text('forbidden', 403);
        return c.text(challenge, 200);
    });

    app.post('/api/clinic/instagram/webhook', async (c) => {
        const body = await c.req.json().catch(() => null);
        const messages = instagramMessagesFromWebhook(body);
        if (!messages.length) return c.json({ ok: true, written: 0 });
        const connStr = serverConnStr();
        if (!connStr) return c.json({ ok: false, error: 'missing_database' }, 503);
        const pool = getPool(connStr);
        let written = 0;
        for (const message of messages) {
            try {
                const found = await pool.query(
                    `SELECT firm_nr
                       FROM beauty.social_channel_accounts
                      WHERE channel = 'instagram'
                        AND (external_account = $1 OR page_id = $1)
                      LIMIT 1`,
                    [message.lookupId],
                );
                const firmNr = safeFirm(found.rows[0]?.firm_nr);
                if (!firmNr) continue;
                await writeMessages(pool, firmNr, [{
                    id: message.externalId,
                    externalId: message.externalId,
                    channel: 'instagram',
                    externalAccount: message.externalAccount,
                    counterparty: message.counterparty,
                    direction: message.direction,
                    body: message.body,
                    occurredAt: message.occurredAt,
                }]);
                written += 1;
            } catch {
                /* eşleşen hesap yoksa satır yazılmaz */
            }
        }
        return c.json({ ok: true, written });
    });
}
