/**
 * database/scripts/pg-windows-expose-remote.ps1 → DeskApp/resources (Tauri bundle tek kaynak)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'database', 'scripts', 'pg-windows-expose-remote.ps1');
const dest = path.join(root, 'DeskApp', 'resources', 'pg-windows-expose-remote.ps1');
if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('[sync-pg-expose] copied to DeskApp/resources');
} else {
  console.warn('[sync-pg-expose] skip: source not found', src);
}
