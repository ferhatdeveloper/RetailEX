const fs = require('fs');
const path = require('path');

// Try to load iconv-lite from the project
let iconv;
const iconvPaths = [
    '../src/electron/node_modules/iconv-lite',
    '../node_modules/iconv-lite',
    'd:/Exretailosv1/src/electron/node_modules/iconv-lite'
];

for (const p of iconvPaths) {
    try {
        iconv = require(path.resolve(__dirname, p));
        console.log(`Loaded iconv-lite from ${p}`);
        break;
    } catch (e) {
        // continue
    }
}

if (!iconv) {
    console.error('Could not find iconv-lite module. Please ensure dependencies are installed.');
    process.exit(1);
}

// CP1252 characters regex (High ASCII + special CP1252 chars)
// We construct a regex that matches any character that CAN be represented in CP1252 (except strict ASCII which is 00-7F)
const CP1252_EXTENDED = '\u0080-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122';
const SUSPECT_REGEX = new RegExp(`[${CP1252_EXTENDED}]+`, 'g');

function fixText(text) {
    return text.replace(SUSPECT_REGEX, (match) => {
        try {
            // Encode the suspicious characters back to bytes as Windows-1252
            const buffer = iconv.encode(match, 'win1252');

            // Try to decode these bytes as UTF-8
            // If the buffer contains invalid UTF-8 sequences, this might throw or produce replacement chars
            // iconv-lite usually defaults to replacement chars '', so we need to check
            const decoded = iconv.decode(buffer, 'utf8');

            // Check if decoding produced REPLACEMENT CHARACTER (U+FFFD)
            if (decoded.includes('')) {
                return match; // Failed to decode cleanly, likely not mojibake
            }

            // Heuristic: If the length drastically changed (e.g., 2 chars -> 1 char), it's a good sign
            // But sometimes length is same.
            // Also check if the resulting characters are "valid" implies we accept them.
            // Since we are targeting known Mojibake, if we successfully decoded UTF-8, it implies the bytes WERE UTF-8.

            // Log for inspection
            // console.log(`Fixed: "${match}" -> "${decoded}"`);
            return decoded;
        } catch (e) {
            return match;
        }
    });
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const fixed = fixText(content);

        if (content !== fixed) {
            console.log(`Fixing: ${filePath}`);
            fs.writeFileSync(filePath, fixed, 'utf8');
            return true;
        }
    } catch (e) {
        console.error(`Error processing ${filePath}:`, e.message);
    }
    return false;
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build') continue;
            walkDir(fullPath);
        } else {
            if (fullPath.match(/\.(ts|tsx|js|jsx|json|md|sql|txt)$/)) {
                processFile(fullPath);
            }
        }
    }
}

// Start
console.log('Starting Mojibake fix...');
const targetDir = path.resolve(__dirname, '../src');
walkDir(targetDir);
console.log('Done.');
