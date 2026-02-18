const fs = require('fs');
const path = 'src-tauri/installer.nsi';
try {
    let content = fs.readFileSync(path);
    // Check for BOM EF BB BF
    if (content[0] === 0xEF && content[1] === 0xBB && content[2] === 0xBF) {
        content = content.slice(3);
        console.log('Removed BOM');
    }
    // Add comment if not present
    const commentStr = '; BOM Buffer\r\n';
    const comment = Buffer.from(commentStr);
    if (content.indexOf(comment) !== 0) {
        const newContent = Buffer.concat([comment, content]);
        fs.writeFileSync(path, newContent);
        console.log('Added buffer comment');
    } else {
        fs.writeFileSync(path, content); // Write back just in case encoding matters
        console.log('Buffer comment already present');
    }
} catch (e) {
    console.error(e);
}
