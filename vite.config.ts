
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eticaretStaticPlugin } from './vite.eticaret-static';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));

/**
 * 14.10.2026 — Cache buster: build edilen index.html'lerdeki
 * <script type="module" src="..."> ve <link rel="stylesheet" href="...">
 * öğelerinin src/href'ine `?v={gitSha}` query ekler. Amaç:
 * CDN veya tarayıcı cache'inde eski HTML kalsa bile, yeni build
 * deploy edildiğinde farklı SHA ile yeni HTML gelir → yeni JS
 * hash'leri zorla çekilir, eski immutable JS'ler bypass edilir.
 *
 * SHA kaynak önceliği:
 *   1) `RETAILEX_BUILD_SHA` ortam değişkeni (CI script'leri tarafından set edilir)
 *   2) `git rev-parse --short HEAD` (lokalde build alınırken)
 *   3) `package.json` version + `Date.now()` (her build'de farklı)
 *   4) `dev` (son çare — cache buster etkisiz)
 */
function htmlCacheBusterPlugin(): Plugin {
  let sha: string;
  const envSha = process.env.RETAILEX_BUILD_SHA?.trim();
  if (envSha) {
    sha = envSha;
  } else {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      try {
        const pkg = JSON.parse(
          readFileSync(path.resolve(__dirnameLocal, 'package.json'), 'utf-8'),
        ) as { version?: string };
        sha = `${pkg.version || 'v0'}-${Date.now().toString(36)}`;
      } catch {
        sha = 'dev';
      }
    }
  }
  return {
    name: 'html-cache-buster',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const v = `?v=${sha}`;
        return html
          .replace(/<script([^>]*?)\bsrc="([^"]+)"/g, (_m, attrs, src) => {
            if (/[?&]v=/.test(src)) return _m;
            return `<script${attrs} src="${src}${v}"`;
          })
          .replace(/<link([^>]*?)\bhref="(\/assets\/[^"]+\.css)"/g, (_m, attrs, href) => {
            if (/[?&]v=/.test(href)) return _m;
            return `<link${attrs} href="${href}${v}"`;
          });
      },
    },
  };
}

export default defineConfig({
  base: '/',
  // META_APP_ID genel kimliktir. META_APP_SECRET bu önekle eşleşmez, pakete girmez.
  envPrefix: ['VITE_', 'META_APP_ID'],
  plugins: [react(), eticaretStaticPlugin(), htmlCacheBusterPlugin()],
  publicDir: 'src/public',
  resolve: {
    /** Aksi halde bazı paketler ikinci bir React kopyası çeker; useContext(Auth) undefined kalır. */
    dedupe: ['react', 'react-dom'],
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      'vaul@1.1.2': 'vaul',
      'sonner@2.0.3': 'sonner',
      'recharts@2.15.2': 'recharts',
      'react-resizable-panels@2.1.7': 'react-resizable-panels',
      'react-hook-form@7.55.0': 'react-hook-form',
      'react-day-picker@8.10.1': 'react-day-picker',
      'next-themes@0.4.6': 'next-themes',
      'lucide-react@0.487.0': 'lucide-react',
      'input-otp@1.4.2': 'input-otp',
      'hono@4.0.0': 'hono',
      'embla-carousel-react@8.6.0': 'embla-carousel-react',
      'cmdk@1.1.1': 'cmdk',
      'class-variance-authority@0.7.1': 'class-variance-authority',
      '@supabase/supabase-js@2.39.3': '@supabase/supabase-js',
      '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
      '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
      '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
      '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
      '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
      '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
      '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
      '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
      '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
      '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
      '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
      '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
      '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
      '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
      '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
      '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
      '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
      '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
      '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
      '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
      '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
      '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
      '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
      '@jsr/supabase__supabase-js@2.49.8': '@jsr/supabase__supabase-js',
      '@jsr/supabase__supabase-js@2': '@jsr/supabase__supabase-js',
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: true,
    chunkSizeWarningLimit: 1000,
    /**
     * 14.10.2026 — Cache buster: HTML script src'lerine `?v={gitSha}`
     * query ekler. CDN/tarayıcı cache'inde eski HTML kalsa bile yeni
     * build deploy edildiğinde farklı SHA ile yeni HTML gelir → yeni
     * JS hash'leri zorla çekilir. Public dosya; SHA bulunamazsa
     * `dev` (development) kullanılır.
     */
    assetsInlineLimit: 4096,
    rollupOptions: {
      // Dokploy/VPS: rendering chunks bellek zirvesi — paralel dosya işlemini kıs
      ...(process.env.DOCKER_BUILD === '1' ? { maxParallelFileOps: 1 } : {}),
      output: {
        manualChunks(id) {
          // Geniş '/react/' eşlemesi (@emotion/react vb.) yanlış chunk birleşmesine yol açmasın
          if (
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'react-vendor';
          }
          if (
            id.includes('@radix-ui/react-dialog') ||
            id.includes('@radix-ui/react-dropdown-menu') ||
            id.includes('@radix-ui/react-select') ||
            id.includes('@radix-ui/react-tabs') ||
            id.includes('@radix-ui/react-tooltip')
          ) {
            return 'ui-vendor';
          }
          if (id.includes('@supabase/supabase-js') || id.includes('@jsr/supabase__supabase-js')) {
            return 'supabase-vendor';
          }
          // recharts'i ayrı chart-vendor chunk'ına alma: d3/lodash ile circular + TDZ
          // ("Cannot access 'S' before initialization" — production web)
          if (id.includes('@tanstack/react-table')) return 'table-vendor';
          if (id.includes('/src/utils/chunkLoadRecovery')) return 'chunk-recovery';
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js'
      }
    },
    reportCompressedSize: false,
    assetsInlineLimit: 4096,
  },
  server: {
    host: '0.0.0.0',
    port: 6173,
    open: false,
    allowedHosts: true, // tünel/host başlıklarına izin ver (cloudflared, ngrok vb.)
    cors: true,
    proxy: {
      /** pg_bridge — Vite proxy üzerinden köprüye yönlendir.
       *  Port: BRIDGE_PORT env (varsayılan 3001). 3001 Colima/ssh tarafından
       *  tutuluyorsa BRIDGE_PORT=3002 ile çalıştırın. */
      '/api/status': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/api/pg_query': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/api/logo': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/api/erp-logo-proxy': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/api/caller_id': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/api/delivery_order': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      '/api/grafana': {
        target: `http://localhost:${process.env.BRIDGE_PORT || '3001'}`,
        changeOrigin: true,
      },
      /** whatshapp Next (varsayılan :3000) — tarayıcıda CORS / mixed content olmadan köprü */
      '/__wa_bridge': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__wa_bridge/, '') || '/',
      },
      /**
       * api.retailex.app (merkez /merkez, kiracı /aqua, …): üretim CORS yalnızca retailex.app;
       * localhost’ta tüm PostgREST çağrıları `rewriteRetailexAppUrlForViteDev` ile buraya yönlendirilir.
       */
      '/__retailex-api': {
        target: 'https://api.retailex.app',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__retailex-api/, ''),
      },
    }
  },
});

