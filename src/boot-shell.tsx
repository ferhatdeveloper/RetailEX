/**
 * Android/Capacitor: anında #root mount — ağır bootstrap-erp chunk'ı arkada yüklenir.
 * Böylece 90sn "Arayüz yüklenemedi" zaman aşımı tetiklenmez.
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useState, type ComponentType } from 'react';
import { importWithChunkRetry } from './utils/chunkLoadRecovery';

function BootShell() {
  const [ErpRoot, setErpRoot] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const placeholder = document.getElementById('rex-boot-placeholder');
    void importWithChunkRetry(() => import('./bootstrap-erp'))
      .then((mod) => {
        const Comp =
          (mod as { ErpRoot?: ComponentType }).ErpRoot ??
          (mod as { default?: ComponentType }).default;
        if (!Comp) throw new Error('bootstrap-erp ErpRoot export bulunamadı');
        setErpRoot(() => Comp);
        placeholder?.remove();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[boot-shell] bootstrap-erp yüklenemedi:', err);
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
