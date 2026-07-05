import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ELLA_ROOT = path.resolve(__dirname, 'eticaret/themes/ella');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function sendStatic(res: import('http').ServerResponse, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  fs.createReadStream(filePath).pipe(res);
}

/** Ella HTML tema dosyalarını `/eticaret-static/ella` altında sunar. */
export function eticaretStaticPlugin(): Plugin {
  const mount = '/eticaret-static/ella';

  const handler = (
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse,
    next: () => void,
  ) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith(mount)) return next();

    const rel = decodeURIComponent(url.slice(mount.length)).replace(/^\/+/, '') || 'index.html';
    const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(ELLA_ROOT, safe);

    if (!filePath.startsWith(ELLA_ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    sendStatic(res, filePath);
  };

  return {
    name: 'retailex-eticaret-static',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
    closeBundle() {
      const out = path.resolve(__dirname, 'build/eticaret-static/ella');
      if (!fs.existsSync(ELLA_ROOT)) return;
      fs.cpSync(ELLA_ROOT, out, { recursive: true });
    },
  };
}
