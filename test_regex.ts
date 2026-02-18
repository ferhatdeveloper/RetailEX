const table = 'cash_registers';
const firmNr = '009';
const prefix = `rex_${firmNr}_`;
const regex = new RegExp(`(?<!\\.)\\b${table}\\b`, 'gi');

const testCases = [
    'SELECT * FROM cash_registers',
    'SELECT * FROM public.cash_registers',
    'SELECT * FROM public.rex_009_cash_registers',
    'SELECT * FROM logic.cash_registers'
];

testCases.forEach(sql => {
    const resolved = sql.replace(regex, `${prefix}${table}`);
    console.log(`Original: ${sql}`);
    console.log(`Resolved: ${resolved}`);
    console.log('---');
});
