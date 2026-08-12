-- merkez_db.tenant_registry: kiracı varsayılan terazi köprüsü (mağaza PC)
-- Mağaza bazlı override için kiracı DB stores.scale_bridge_url kullanılır.

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS scale_bridge_url TEXT;

ALTER TABLE tenant_registry
  ADD COLUMN IF NOT EXISTS scale_bridge_token TEXT;

COMMENT ON COLUMN tenant_registry.scale_bridge_url IS
  'Kiracı varsayılan terazi köprü URL (tek mağaza veya merkezden gönderim).';

COMMENT ON COLUMN tenant_registry.scale_bridge_token IS
  'Köprü Bearer token (scale-bridge.json authToken).';
