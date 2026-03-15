"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var postgres_1 = require("./src/services/postgres");
var postgres_2 = require("./src/services/postgres");
postgres_1.ERP_SETTINGS.firmNr = '001';
// Try setting '2026' first to see how it acts
postgres_1.ERP_SETTINGS.periodNr = '2026';
var conn = postgres_2.PostgresConnection.getInstance();
console.log('Testing with period 2026:');
console.log('sales table mapping:', conn.getMovementTableName('sales'));
console.log('invoices table mapping:', conn.getMovementTableName('invoices'));
postgres_1.ERP_SETTINGS.periodNr = '1';
console.log('\nTesting with period 1:');
console.log('sales table mapping:', conn.getMovementTableName('sales'));
