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

const REX_STOREFRONT_SCRIPT =
  '<script src="./assets/js/retailex-storefront.js" defer></script>';

function injectStorefrontScript(html: string): string {
  if (html.includes('retailex-storefront.js')) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', `    ${REX_STOREFRONT_SCRIPT}\n</body>`);
  }
  return html + REX_STOREFRONT_SCRIPT;
}

function walkHtmlFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtmlFiles(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
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

    if (filePath.endsWith('.html')) {
      const html = injectStorefrontScript(fs.readFileSync(filePath, 'utf8'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
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
      for (const file of walkHtmlFiles(out)) {
        const html = fs.readFileSync(file, 'utf8');
        const next = injectStorefrontScript(html);
        if (next !== html) fs.writeFileSync(file, next, 'utf8');
      }
    },
  };
}
