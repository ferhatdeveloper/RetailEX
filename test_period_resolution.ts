import { ERP_SETTINGS } from './src/services/postgres';
import { PostgresConnection } from './src/services/postgres';

ERP_SETTINGS.firmNr = '001';
// Try setting '2026' first to see how it acts
ERP_SETTINGS.periodNr = '2026';

const conn = (PostgresConnection as any).getInstance();

console.log('Testing with period 2026:');
console.log('sales table mapping:', conn.getMovementTableName('sales'));
console.log('invoices table mapping:', conn.getMovementTableName('invoices'));

ERP_SETTINGS.periodNr = '1';
console.log('\nTesting with period 1:');
console.log('sales table mapping:', conn.getMovementTableName('sales'));
