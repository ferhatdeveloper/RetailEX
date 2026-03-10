const fs = require('fs');
const path = require('path');

const transPath = path.join(__dirname, 'src', 'locales', 'translations.ts');
let content = fs.readFileSync(transPath, 'utf8');

const codes = {
    tr: 'tr-TR',
    en: 'en-US',
    ar: 'ar-SA',
    ku: 'ku-IQ'
};

const names = {
    tr: 'Türkçe',
    en: 'English',
    ar: 'العربية',
    ku: 'کوردی'
};

// Targeted fix for each block
const blocks = ['tr', 'en', 'ar', 'ku'];
let searchStart = 0;

for (const lang of blocks) {
    const blockStartStr = `${lang}: {`;
    const blockStartPos = content.indexOf(blockStartStr, searchStart);
    if (blockStartPos === -1) continue;

    // Find the end of this language block (the matching closing brace for the main object)
    // This is hard, so let's find the NEXT language block or end of object
    let blockEndPos = content.length;
    for (const nextLang of blocks) {
        if (nextLang === lang) continue;
        const nextStart = content.indexOf(`${nextLang}: {`, blockStartPos);
        if (nextStart !== -1 && nextStart < blockEndPos) {
            blockEndPos = nextStart;
        }
    }

    let block = content.substring(blockStartPos, blockEndPos);

    // Replace or Insert localeCode
    if (block.includes('localeCode:')) {
        block = block.replace(/localeCode: ['"].*?['"]/, `localeCode: '${codes[lang]}'`);
    } else {
        // Insert after the first opening brace
        const bracePos = block.indexOf('{');
        block = block.substring(0, bracePos + 1) + `\n    localeCode: '${codes[lang]}',` + block.substring(bracePos + 1);
    }

    // Replace or Insert localeName
    if (block.includes('localeName:')) {
        block = block.replace(/localeName: ['"].*?['"]/, `localeName: '${names[lang]}'`);
    } else {
        const bracePos = block.indexOf('{');
        block = block.substring(0, bracePos + 1) + `\n    localeName: '${names[lang]}',` + block.substring(bracePos + 1);
    }

    content = content.substring(0, blockStartPos) + block + content.substring(blockEndPos);
    searchStart = blockStartPos + block.length;
}

fs.writeFileSync(transPath, content);
console.log("Successfully fixed locale codes per language in translations.ts");
