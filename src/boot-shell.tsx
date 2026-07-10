/**
 * Android/Capacitor: anında #root mount — erp-entry (küçük) → erp-app-inner (ağır).
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ComponentType } from 'react';
import { importWithChunkRetry } from './utils/chunkLoadRecovery';

function resolveErpRootComponent(mod: unknown): ComponentType {
  if (typeof mod === 'function') return mod as ComponentType;
  if (!mod || typeof mod !== 'object') {
    throw new Error('ERP modülü boş döndü (bellek veya depolama alanını kontrol edin)');
  }
  const record = mod as Record<string, unknown>;
  const candidate = record.default ?? record.ErpEntry ?? record.ErpRoot;
  if (typeof candidate === 'function') return candidate as ComponentType;
  throw new Error('ERP kök bileşeni (default export) bulunamadı');
}

async function loadErpRootComponent(): Promise<ComponentType> {
  const mod = await import(/* @vite-ignore */ './erp-entry');
  return resolveErpRootComponent(mod);
}

function BootShell() {
  const [ErpRoot, setErpRoot] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const placeholder = document.getElementById('rex-boot-placeholder');
    void importWithChunkRetry(loadErpRootComponent)
      .then((Comp) => {
        setErpRoot(() => Comp);
        placeholder?.remove();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[boot-shell] erp-entry yüklenemedi:', err);
        setError(msg);
        const w = window as Window & { removeLoader?: () => void };
        w.removeLoader?.();
      });
  }, []);

  if (error) {
    return (
      <div
        style={{
          boxSizing: 'border-box',
          maxWidth: 560,
          margin: '10vh auto',
          padding: '28px 24px',
          fontFamily: 'system-ui, sans-serif',
          color: '#e2e8f0',
          textAlign: 'center',
          lineHeight: 1.65,
          background: 'rgba(15,23,42,0.9)',
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.25)',
        }}
      >
        <strong style={{ display: 'block', marginBottom: 12 }}>Modül yüklenemedi</strong>
        <p style={{ fontSize: 13, margin: '0 0 16px' }}>{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 18px',
            border: 0,
            borderRadius: 8,
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          Yeniden dene
        </button>
      </div>
    );
  }

  if (!ErpRoot) {
    return <div id="rex-boot-shell" data-rex-boot-shell aria-busy="true" className="min-h-screen" />;
  }

  return <ErpRoot />;
}

const rootEl = document.getElementById('root');
if (rootEl) {
  try {
    createRoot(rootEl).render(<BootShell />);
  } catch (err) {
    console.error('[boot-shell] createRoot failed:', err);
    const w = window as Window & { removeLoader?: () => void };
    w.removeLoader?.();
  }
}
