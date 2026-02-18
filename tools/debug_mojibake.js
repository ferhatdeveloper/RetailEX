const fs = require('fs');
const path = require('path');
const iconv = require('../src/electron/node_modules/iconv-lite');

const CP1252_EXTENDED = '\u0080-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122';
const SUSPECT_REGEX = new RegExp(`[${CP1252_EXTENDED}]+`, 'g');

const filePath = path.resolve(__dirname, '../src/shared/i18n/translations.ts');
console.log('Checking:', filePath);

const content = fs.readFileSync(filePath, 'utf8');

// Test specifically for the Arabic string we saw
// ar: 'ØºÙŠØ± نشط'
// In the file viewer it was: ØºÙŠØ±
const snippet = 'ØºÙŠØ±';
console.log('Snippet in content?', content.includes(snippet));

let matchCount = 0;
const fixed = content.replace(SUSPECT_REGEX, (match) => {
    matchCount++;
    try {
        const buffer = iconv.encode(match, 'win1252');
        const decoded = iconv.decode(buffer, 'utf8');

        if (decoded.includes('')) {
            console.log(`[${matchCount}] Failed to decode cleanly: "${match.substring(0, 10)}..."`);
            return match;
        }

        if (decoded !== match) {
            console.log(`[${matchCount}] Fixed: "${match}" -> "${decoded}"`);
            return decoded;
        }
        return match;
    } catch (e) {
        console.log(`[${matchCount}] Error: ${e.message}`);
        return match;
    }
});

if (content !== fixed) {
    console.log('File would be changed.');
} else {
    console.log('No changes detected.');
}
