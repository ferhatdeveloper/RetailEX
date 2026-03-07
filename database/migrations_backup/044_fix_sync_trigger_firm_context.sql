-- Migration: 044_fix_sync_trigger_firm_context.sql
-- Description: Fixes enqueue_sync_event to handle dynamic tables without firm_nr column.

CREATE OR REPLACE FUNCTION enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
    v_firm_nr VARCHAR;
    v_record_id UUID;
    v_data JSONB;
    v_table_parts TEXT[];
BEGIN
    -- Determine Data and ID
    IF (TG_OP = 'DELETE') THEN
        v_record_id := OLD.id;
        v_data := row_to_json(OLD)::JSONB;
        -- Try to get firm_nr from OLD row safely
        IF v_data ? 'firm_nr' THEN
            v_firm_nr := v_data->>'firm_nr';
        END IF;
    ELSE
        v_record_id := NEW.id;
        v_data := row_to_json(NEW)::JSONB;
        -- Try to get firm_nr from NEW row safely
        IF v_data ? 'firm_nr' THEN
            v_firm_nr := v_data->>'firm_nr';
        END IF;
    END IF;

    -- If firm_nr is still null, extract from table name (e.g., rex_009_01_cash_lines -> 009)
    IF v_firm_nr IS NULL THEN
        v_table_parts := string_to_array(TG_TABLE_NAME, '_');
        -- Check if it matches rex_{firm_nr}_... pattern
        IF array_length(v_table_parts, 1) >= 2 AND v_table_parts[1] = 'rex' THEN
             v_firm_nr := v_table_parts[2];
        ELSE
             v_firm_nr := '001'; -- Default fallback
        END IF;
    END IF;

    -- Update existing PENDING record if exists (Duplicate Prevention)
    UPDATE sync_queue 
    SET data = v_data, action = TG_OP, created_at = NOW(), firm_nr = v_firm_nr
    WHERE table_name = TG_TABLE_NAME 
      AND record_id = v_record_id 
      AND status = 'pending';

    -- If no row updated, insert new
    IF NOT FOUND THEN
        INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data, status)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data, 'pending');
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
