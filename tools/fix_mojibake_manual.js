const fs = require('fs');
const path = require('path');

// Unicode to CP1252 Byte Map (for 0x80-0x9F range)
const UNICODE_TO_CP1252 = {
    '\u20AC': 0x80, // €
    '\u201A': 0x82, // ‚
    '\u0192': 0x83, // ƒ
    '\u201E': 0x84, // „
    '\u2026': 0x85, // …
    '\u2020': 0x86, // †
    '\u2021': 0x87, // ‡
    '\u02C6': 0x88, // ˆ
    '\u2030': 0x89, // ‰
    '\u0160': 0x8A, // Š
    '\u2039': 0x8B, // ‹
    '\u0152': 0x8C, // Œ
    '\u017D': 0x8E, // Ž
    '\u2018': 0x91, // ‘
    '\u2019': 0x92, // ’
    '\u201C': 0x93, // “
    '\u201D': 0x94, // ”
    '\u2022': 0x95, // •
    '\u2013': 0x96, // –
    '\u2014': 0x97, // —
    '\u02DC': 0x98, // ˜
    '\u2122': 0x99, // ™
    '\u0161': 0x9A, // š
    '\u203A': 0x9B, // ›
    '\u0153': 0x9C, // œ
    '\u017E': 0x9E, // ž
    '\u0178': 0x9F  // Ÿ
};

// Populate C1 Control codes (u0080-u009F) mapping to same bytes
for (let c = 0x80; c <= 0x9F; c++) {
    const char = String.fromCharCode(c);
    if (!UNICODE_TO_CP1252[char]) {
        UNICODE_TO_CP1252[char] = c;
    }
}

// Build Regex Character Class
const specialChars = Object.keys(UNICODE_TO_CP1252).join('');
// Range \u00A0-\u00FF covers standard Latin1 widely used in Mojibake (e.g. Ã, Å, etc)
// We treat ASCII (00-7F) as safe context delimiters.
// We also include \u0080-\u009F explicitly via UNICODE_TO_CP1252 map additions
const SUSPECT_REGEX = new RegExp(`[${specialChars}\\u00A0-\\u00FF]+`, 'g');

function fixMojibake(text) {
    return text.replace(SUSPECT_REGEX, (match) => {
        // 1. Convert match (string) to Bytes (CP1252)
        const bytes = [];
        for (let i = 0; i < match.length; i++) {
            const char = match[i];
            const code = char.charCodeAt(0);

            if (code >= 0x00A0 && code <= 0x00FF) {
                bytes.push(code); // Identity map for Latin1 part
            } else if (UNICODE_TO_CP1252[char]) {
                bytes.push(UNICODE_TO_CP1252[char]);
            } else {
                // Should not happen due to Regex, but if it does, abort this match
                return match;
            }
        }

        // 2. Decode Bytes as UTF-8
        try {
            const buffer = Buffer.from(bytes);
            // Verify if valid UTF-8
            // isUtf8 implementation: 
            // We can rely on toString('utf8') replacing invalid sequences with replacement char \uFFFD
            const decoded = buffer.toString('utf8');

            if (decoded.includes('\uFFFD')) {
                // Invalid UTF-8 sequence, likely NOT Mojibake (or at least not this type)
                return match;
            }

            // Heuristic: accepted
            return decoded;
        } catch (e) {
            return match;
        }
    });
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fixed = fixMojibake(content);

        if (content !== fixed) {
            console.log(`Fixing: ${filePath}`);
            // Log a snippet
            // const diffIdx = content.split('').findIndex((c, i) => c !== fixed[i]);
            // console.log(`   At ${diffIdx}: "${content.substring(diffIdx, diffIdx+20)}" -> "${fixed.substring(diffIdx, diffIdx+20)}"`);

            fs.writeFileSync(filePath, fixed, 'utf8');
            return true;
        }
    } catch (e) {
        console.error(`Error processing ${filePath}:`, e.message);
    }
}

function walkDir(dir) {
    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (e) { return; }

    for (const file of files) {
        const fullPath = path.join(dir, file);
        let stat;
        try { stat = fs.statSync(fullPath); } catch (e) { continue; }

        if (stat.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', '.vite', 'coverage'].includes(file)) continue;
            walkDir(fullPath);
        } else {
            if (fullPath.match(/\.(ts|tsx|js|jsx|json|md|sql|txt)$/)) {
                processFile(fullPath);
            }
        }
    }
}

console.log('Starting Manual Mojibake fix...');
const targetDir = path.resolve(__dirname, '../src');
walkDir(targetDir);
console.log('Done.');
