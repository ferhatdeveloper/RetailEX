
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { eticaretStaticPlugin } from './vite.eticaret-static';

export default defineConfig({
  base: '/',
  plugins: [react(), eticaretStaticPlugin()],
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
    rollupOptions: {
      // Dokploy/VPS: rendering chunks bellek zirvesi — paralel dosya işlemini kıs
      ...(process.env.DOCKER_BUILD === '1' ? { maxParallelFileOps: 1 } : {}),
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('/react/') || id.includes('react-router')) {
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
    host: 'localhost',
    port: 6173,
    open: false,
    proxy: {
      /** pg_bridge — tarayıcı aynı origin (Vite) üzerinden; köprü yine :3001'de çalışmalı */
      '/api/status': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/pg_query': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/logo': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/erp-logo-proxy': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/caller_id': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/api/delivery_order': {
        target: 'http://localhost:3001',
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

