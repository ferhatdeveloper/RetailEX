-- ============================================================================
-- RetailEx - Migration 009: Material Demo Data
-- ----------------------------------------------------------------------------
-- Adding sample brands and units for demonstration
-- ============================================================================

-- Demo Brands
INSERT INTO brands (code, name, is_active, description) VALUES
  ('APPLE', 'Apple', true, 'Apple Inc. Products'),
  ('SAMSUNG', 'Samsung', true, 'Samsung Electronics'),
  ('DELL', 'Dell', true, 'Dell Compute Solutions'),
  ('LENOVO', 'Lenovo', true, 'Lenovo Global'),
  ('NESTLE', 'Nestlé', true, 'Nestlé Food & Beverage'),
  ('NIKE', 'Nike', true, 'Nike Sporting Goods')
ON CONFLICT (code) DO NOTHING;

-- Demo Units
INSERT INTO units (code, name, is_active, description) VALUES
  ('ADET', 'Adet', true, 'Birim adet'),
  ('KG', 'Kilogram', true, 'Ağırlık birimi (kg)'),
  ('MT', 'Metre', true, 'Uzunluk birimi (m)'),
  ('PKT', 'Paket', true, 'Paketlenmiş ürün birimi'),
  ('KOLI', 'Koli', true, 'Toplu paket birimi')
ON CONFLICT (code) DO NOTHING;

-- Demo Product Groups
INSERT INTO product_groups (code, name, is_active, description) VALUES
  ('ELECTRONIC', 'Elektronik Ürünler', true, 'Tüm elektronik cihazlar'),
  ('FOOD-DRINK', 'Gıda ve İçecek', true, 'Tüketilebilir gıda ürünleri'),
  ('TEXTILE', 'Tekstil ve Giyim', true, 'Giyim ve kumaş ürünleri')
ON CONFLICT (code) DO NOTHING;
