-- Klinik gelen kutu: Instagram ve WhatsApp mesajları.
-- Kolonlar: kanal, dış hesap, karşı taraf, yön, metin, zaman.
-- Tauri uyumu: DO $$ yok. Demo satır yok. Belirteç kolonu yok.

CREATE TABLE IF NOT EXISTS beauty.social_inbox_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_nr VARCHAR(10) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    external_account TEXT NOT NULL DEFAULT '',
    counterparty TEXT NOT NULL DEFAULT '',
    direction VARCHAR(8) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT social_inbox_messages_channel_ck CHECK (channel IN ('instagram', 'whatsapp')),
    CONSTRAINT social_inbox_messages_direction_ck CHECK (direction IN ('in', 'out'))
);

CREATE INDEX IF NOT EXISTS social_inbox_messages_firm_channel_time_idx
    ON beauty.social_inbox_messages (firm_nr, channel, occurred_at DESC);

CREATE TABLE IF NOT EXISTS beauty.social_channel_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_nr VARCHAR(10) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    external_account TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    connected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT social_channel_accounts_channel_ck CHECK (channel IN ('instagram', 'whatsapp')),
    CONSTRAINT social_channel_accounts_firm_channel_uq UNIQUE (firm_nr, channel)
);
