INSERT INTO rex_009_01_cash_lines (
    register_id, fiche_no, date, amount, sign, definition, transaction_type, 
    customer_id, currency_code, exchange_rate, f_amount, transfer_status, special_code
) 
VALUES (
    '5cd58db5-56cc-405e-8a6b-049db4a25b45'::uuid, 
    '', 
    '2026-02-17'::date, 
    50000::numeric, 
    1::integer, 
    '', 
    'CH_TAHSILAT', 
    '2db614df-f6e7-4c19-a60b-d1d7bf686c7e'::uuid, 
    'IQD', 
    1::numeric, 
    0::numeric, 
    0, 
    ''
);
