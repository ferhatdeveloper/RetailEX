-- ============================================================================
-- RetailEx - DEMO CONTENT (v3.1)
-- ----------------------------------------------------------------------------
-- Sample categories and products for testing
-- ============================================================================

-- 1. CATEGORIES
INSERT INTO categories (id, code, name) VALUES
  ('c1111111-1111-4111-d111-111111111111', 'CAT-ELI', 'Electronics'),
  ('c2222222-2222-4222-d222-222222222222', 'CAT-FOD', 'Food & Beverage');

-- 2. PRODUCTS
INSERT INTO products (name, barcode, category_id, price, cost, stock, is_active) VALUES
  ('Smartphone Pro Max', '86900010001', 'c1111111-1111-4111-d111-111111111111', 1200.00, 950.00, 50, true),
  ('Laptop Enterprise X', '86900010002', 'c1111111-1111-4111-d111-111111111111', 2500.00, 1800.00, 20, true),
  ('Mineral Water 0.5L', '86900020001', 'c2222222-2222-4222-d222-222222222222', 0.50, 0.20, 1000, true);
