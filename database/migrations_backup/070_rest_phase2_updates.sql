-- Phase 2: Operations & Kitchen Updates

-- 1. Add void and complementary tracking to order items
ALTER TABLE rest_order_items ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT FALSE;
ALTER TABLE rest_order_items ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE rest_order_items ADD COLUMN IF NOT EXISTS is_complementary BOOLEAN DEFAULT FALSE;
ALTER TABLE rest_order_items ADD COLUMN IF NOT EXISTS served_at TIMESTAMP WITH TIME ZONE;

-- 2. Add kitchen notes to kitchen orders
ALTER TABLE rest_kitchen_orders ADD COLUMN IF NOT EXISTS kitchen_note TEXT;

-- 3. Function to void an order item and update order total
CREATE OR REPLACE FUNCTION rest_void_order_item(
    p_item_id UUID,
    p_reason TEXT
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
    v_item_total DECIMAL;
BEGIN
    -- Get item info
    SELECT order_id, (unit_price * quantity * (1 - COALESCE(discount_pct, 0) / 100))
    INTO v_order_id, v_item_total
    FROM rest_order_items
    WHERE id = p_item_id;

    -- Mark as void
    UPDATE rest_order_items
    SET is_void = TRUE,
        void_reason = p_reason
    WHERE id = p_item_id;

    -- Update order total (subtract voided amount)
    UPDATE rest_orders
    SET total_amount = total_amount - v_item_total,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_order_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Function to mark item as complementary
CREATE OR REPLACE FUNCTION rest_mark_complementary(
    p_item_id UUID
) RETURNS VOID AS $$
DECLARE
    v_order_id UUID;
    v_item_total DECIMAL;
BEGIN
    -- Get item info
    SELECT order_id, (unit_price * quantity * (1 - COALESCE(discount_pct, 0) / 100))
    INTO v_order_id, v_item_total
    FROM rest_order_items
    WHERE id = p_item_id AND is_complementary = FALSE;

    IF FOUND THEN
        -- Mark as complementary
        UPDATE rest_order_items
        SET is_complementary = TRUE
        WHERE id = p_item_id;

        -- Update order total (subtract amount)
        UPDATE rest_orders
        SET total_amount = total_amount - v_item_total,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_order_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
