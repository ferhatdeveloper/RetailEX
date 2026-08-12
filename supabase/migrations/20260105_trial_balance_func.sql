-- Function to get trial balance (Mizan) dynamically
-- Returns a list of all accounts with their total debit, credit, and balances
-- Aggregates data from the dynamic ROS_{firm}_{period}_EMUHLINE table

CREATE OR REPLACE FUNCTION get_trial_balance(firm_nr text, period_nr text)
RETURNS TABLE (
    account_ref integer,
    account_code text,
    account_name text,
    total_debit numeric,
    total_credit numeric,
    balance_debit numeric,
    balance_credit numeric
) AS $$
DECLARE
    acc_table text;
    line_table text;
    query text;
BEGIN
    acc_table := 'ROS_' || firm_nr || '_' || period_nr || '_EMUHACC';
    line_table := 'ROS_' || firm_nr || '_' || period_nr || '_EMUHLINE';

    -- Check if tables exist to avoid errors if period not initialized
    IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = lower(acc_table)) THEN
        RETURN;
    END IF;

    query := '
        WITH AccountTotals AS (
            SELECT 
                account_ref,
                SUM(CASE WHEN sign = 0 THEN amount ELSE 0 END) as deb,
                SUM(CASE WHEN sign = 1 THEN amount ELSE 0 END) as cred
            FROM ' || quote_ident(line_table) || '
            GROUP BY account_ref
        )
        SELECT 
            a.logicalref as account_ref,
            a.code as account_code,
            a.name as account_name,
            COALESCE(t.deb, 0) as total_debit,
            COALESCE(t.cred, 0) as total_credit,
            CASE 
                WHEN COALESCE(t.deb, 0) > COALESCE(t.cred, 0) THEN COALESCE(t.deb, 0) - COALESCE(t.cred, 0) 
                ELSE 0 
            END as balance_debit,
            CASE 
                WHEN COALESCE(t.cred, 0) > COALESCE(t.deb, 0) THEN COALESCE(t.cred, 0) - COALESCE(t.deb, 0) 
                ELSE 0 
            END as balance_credit
        FROM ' || quote_ident(acc_table) || ' a
        LEFT JOIN AccountTotals t ON a.logicalref = t.account_ref
        ORDER BY a.code
    ';

    RETURN QUERY EXECUTE query;
END;
$$ LANGUAGE plpgsql;

