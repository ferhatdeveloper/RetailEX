-- Function to handle Journal Entry (Accounting Fiche) Save with Lines
-- Accepts a JSON payload containing header and lines
-- Uses Dynamic SQL to route to the correct FN_{FIRM}_{PERIOD}_ tables

CREATE OR REPLACE FUNCTION save_journal_entry(
    payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_firm_nr INTEGER;
    v_period_nr INTEGER;
    v_fiche_no VARCHAR;
    v_doc_no VARCHAR;
    v_date DATE;
    v_description VARCHAR;
    v_fiche_type INTEGER;
    v_total_debit NUMERIC;
    v_total_credit NUMERIC;
    v_branch_id INTEGER;
    v_idempotency_key UUID;
    
    v_table_prefix VARCHAR;
    v_header_table VARCHAR;
    v_lines_table VARCHAR;
    v_header_id INTEGER;
    
    v_lines JSONB;
    v_line JSONB;
    
    v_sql TEXT;
BEGIN
    -- Extract Context & Header Info
    v_firm_nr := (payload->>'firmNr')::INTEGER;
    v_period_nr := (payload->>'periodNr')::INTEGER;
    v_idempotency_key := (payload->>'idempotency_key')::UUID;
    
    -- Extract Header Fields
    v_fiche_no := payload->'header'->>'fiche_no';
    v_doc_no := payload->'header'->>'doc_no';
    v_date := (payload->'header'->>'date')::DATE;
    v_description := payload->'header'->>'description';
    v_fiche_type := (payload->'header'->>'fiche_type')::INTEGER;
    v_total_debit := (payload->'header'->>'total_debit')::NUMERIC;
    v_total_credit := (payload->'header'->>'total_credit')::NUMERIC;
    v_branch_id := (payload->'header'->>'branch_id')::INTEGER;
    
    v_lines := payload->'lines';

    -- Construct Dynamic Table Names
    v_table_prefix := 'FN_' || LPAD(v_firm_nr::TEXT, 3, '0') || '_' || LPAD(v_period_nr::TEXT, 2, '0') || '_';
    v_header_table := v_table_prefix || 'EMUHFICHE';
    v_lines_table := v_table_prefix || 'EMUHLINE';

    -- Check Idempotency (Optional: If table has constraint, we can skip query check, but nice to be explicit)
    -- Assuming idempotency_key column exists on header table as per previous steps
    
    -- Insert Header
    v_sql := format(
        'INSERT INTO %I (fiche_no, date, fiche_type, doc_no, description, total_debit, total_credit, branch_id, idempotency_key) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING logicalref', 
        v_header_table
    );
    
    EXECUTE v_sql 
    INTO v_header_id
    USING v_fiche_no, v_date, v_fiche_type, v_doc_no, v_description, v_total_debit, v_total_credit, v_branch_id, v_idempotency_key;

    -- Insert Lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_sql := format(
            'INSERT INTO %I (account_ref, parent_ref, line_nr, description, amount, sign, date, branch_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            v_lines_table
        );
        
        EXECUTE v_sql 
        USING 
            (v_line->>'account_ref')::INTEGER,
            v_header_id, -- Parent Ref
            (v_line->>'line_nr')::INTEGER,
            v_line->>'description',
            (v_line->>'amount')::NUMERIC,
            (v_line->>'sign')::INTEGER, -- 0 or 1
            v_date,
            v_branch_id;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'logicalref', v_header_id);

EXCEPTION WHEN OTHERS THEN
    -- If unique violation on idempotency_key, we can handle it or let it bubble up
    RAISE;
END;
$$;

