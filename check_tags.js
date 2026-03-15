const fs = require('fs');
const content = fs.readFileSync('src/components/system/SetupWizard.tsx', 'utf8');

let divCount = 0;
let braceCount = 0;
let parenCount = 0;

const lines = content.split('\n');
lines.forEach((line, i) => {
    const divs = (line.match(/<div/g) || []).length;
    const closingDivs = (line.match(/<\/div/g) || []).length;
    divCount += divs - closingDivs;

    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    braceCount += openBraces - closeBraces;

    const openParens = (line.match(/\(/g) || []).length;
    const closeParens = (line.match(/\)/g) || []).length;
    parenCount += openParens - closeParens;

    if (divCount < 0 || braceCount < 0 || parenCount < 0) {
        console.log(`Negative count at line ${i + 1}: div=${divCount}, brace=${braceCount}, paren=${parenCount}`);
    }
});

console.log(`Final totals: div=${divCount}, brace=${braceCount}, paren=${parenCount}`);
