-- Instagram sayfa belirteci kiracı satırında. Değer günlüklenmez.
-- Koparma hesap satırını siler; gelen kutu mesajları durur.
-- Tauri uyumu: DO $$ yok. Demo satır yok.

ALTER TABLE beauty.social_channel_accounts
    ADD COLUMN IF NOT EXISTS page_id TEXT NOT NULL DEFAULT '';

ALTER TABLE beauty.social_channel_accounts
    ADD COLUMN IF NOT EXISTS page_access_token TEXT;

ALTER TABLE beauty.social_inbox_messages
    ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS social_inbox_messages_firm_channel_external_uq
    ON beauty.social_inbox_messages (firm_nr, channel, external_id)
    WHERE external_id <> '';
