/**
 * 001_demo_data.sql ile yüklenen demo kayıt kodları — sağ tık "demo toplu sil" ile eşleşir.
 */

export const DEMO_PRODUCT_CODES = new Set([
  'PHONE-001', 'PHONE-002', 'PHONE-003', 'PC-001', 'PC-002',
  'SNACK-001', 'SNACK-002', 'SNACK-003', 'DRINK-001', 'DRINK-002',
  'BEAUTY-001', 'BEAUTY-002', 'CLOTH-001', 'CLOTH-002', 'CLOTH-003',
  'TSHIRT-VAR', 'PHONE-VAR',
  'MENU-001', 'MENU-002', 'MENU-003', 'MENU-004', 'MENU-005', 'MENU-006', 'MENU-007'
]);

/** rex_001_customers — genel + güzellik (BCust-*) */
export const DEMO_CUSTOMER_CODES = new Set([
  'CUST-001', 'CUST-002', 'CUST-003', 'CUST-004', 'CUST-005',
  'CORP-001', 'CORP-002', 'CORP-003',
  'BCust-001', 'BCust-002', 'BCust-003'
]);

/** rex_001_suppliers */
export const DEMO_SUPPLIER_CODES = new Set([
  'SUP-001', 'SUP-002', 'SUP-003', 'SUP-004', 'SUP-005'
]);
