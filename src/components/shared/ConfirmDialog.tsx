/**
 * Asin - ConfirmDialog
 *
 * Radix AlertDialog tabanlı, projedeki tema (Tailwind + dark mode) ile uyumlu
 * onay diyaloğu. Hem JSX olarak (state-tabanlı `open`/`onOpenChange`) hem de
 * imperative `confirm()` fonksiyonu olarak kullanılabilir.
 *
 * Örnek (JSX):
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="İşlemi sil"
 *     description="Bu işlemi silmek istediğinize emin misiniz?"
 *     variant="danger"
 *     confirmLabel="Sil"
 *     onConfirm={async () => { await api.delete(...); }}
 *   />
 *
 * Örnek (imperative):
 *   const ok = await confirm({ title: 'Sil', description: '...', variant: 'danger' });
 *   if (ok) { ... }
 */

import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { AlertTriangle, Info, Loader2, ShieldAlert, Trash2 } from 'lucide-react';

export type ConfirmVariant = 'default' | 'danger' | 'warning' | 'info';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ek bilgi/uyarı kutusu (ör. "Bakiyeler tersine alınacak"). */
  meta?: React.ReactNode;
  /** Buton tipi/renkleri */
  variant?: ConfirmVariant;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** Onayda çalışacak fonksiyon. Promise döndürebilir; bittiğinde dialog otomatik kapanır. */
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  /** Onay butonunu kullanıcı yazana kadar disable et (örn. ürün kodu yaz). */
  requireText?: string;
}

const variantStyles: Record<ConfirmVariant, {
  iconBg: string;
  iconColor: string;
  Icon: React.ComponentType<{ className?: string }>;
  confirmClass: string;
}> = {
  default: {
    iconBg: 'bg-[var(--asin-accent-muted,#D5F0EE)] dark:bg-[var(--asin-accent,#1FA8A0)]/20',
    iconColor: 'text-[var(--asin-accent,#1FA8A0)] dark:text-[var(--asin-accent,#1FA8A0)]',
    Icon: Info,
    confirmClass: 'bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] text-white',
  },
  info: {
    iconBg: 'bg-[var(--asin-accent-muted,#D5F0EE)] dark:bg-[var(--asin-accent,#1FA8A0)]/20',
    iconColor: 'text-[var(--asin-accent,#1FA8A0)] dark:text-[var(--asin-accent,#1FA8A0)]',
    Icon: Info,
    confirmClass: 'bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] text-white',
  },
  warning: {
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-300',
    Icon: AlertTriangle,
    confirmClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    iconBg: 'bg-red-50 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-300',
    Icon: ShieldAlert,
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  meta,
  variant = 'default',
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  requireText,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setBusy(false);
      setTyped('');
    }
  }, [open]);

  const confirmDisabled = busy || (requireText ? typed.trim() !== requireText.trim() : false);

  const handleConfirm = async (e: React.MouseEvent) => {
    if (busy) {
      e.preventDefault();
      return;
    }
    if (!onConfirm) {
      onOpenChange(false);
      return;
    }
    e.preventDefault();
    try {
      setBusy(true);
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error('[ConfirmDialog] onConfirm error:', err);
    } finally {
      setBusy(false);
    }
  };

  const Icon = variant === 'danger' && confirmLabel && /sil|delete/i.test(String(confirmLabel))
    ? Trash2
    : styles.Icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-white dark:bg-gray-900 dark:border-gray-700">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${styles.iconBg}`}>
              <Icon className={`w-5 h-5 ${styles.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <AlertDialogTitle className="text-gray-900 dark:text-gray-100">
                {title}
              </AlertDialogTitle>
              {description && (
                <AlertDialogDescription className="text-gray-600 dark:text-gray-300 mt-1">
                  {description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
        </AlertDialogHeader>

        {meta && (
          <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${
            variant === 'danger'
              ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
              : variant === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200'
              : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
          }`}>
            {meta}
          </div>
        )}

        {requireText && (
          <div className="mt-3 space-y-1.5">
            <label className="block text-xs text-gray-600 dark:text-gray-400">
              Onaylamak için <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{requireText}</span> yazın
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)] dark:text-gray-100"
              placeholder={requireText}
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={busy}
            onClick={() => onCancel?.()}
            className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {cancelLabel ?? 'İptal'}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className={`${styles.confirmClass} disabled:opacity-60`}
          >
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {confirmLabel ?? 'Onayla'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ===== Imperative API: confirm() =====

interface ConfirmOptions extends Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm' | 'onCancel'> {
  /** Onayda çalışacak iş; reject ederse dialog kapanmaz, false döner. */
  onConfirm?: () => void | Promise<void>;
}

let pendingRoot: Root | null = null;
let pendingContainer: HTMLDivElement | null = null;

function cleanup() {
  // React 18: unmount'u microtask sonrası yap, "synchronously unmount" uyarısını engelle
  const root = pendingRoot;
  const container = pendingContainer;
  pendingRoot = null;
  pendingContainer = null;
  if (root) {
    Promise.resolve().then(() => {
      try { root.unmount(); } catch { /* ignore */ }
      if (container && container.parentNode) container.parentNode.removeChild(container);
    });
  }
}

/**
 * Imperative onay diyaloğu. Promise<boolean> döner — kullanıcı onaylarsa `true`.
 *
 * `onConfirm` verilirse: iş başarılı tamamlanırsa `true` döner, hata fırlatırsa
 * dialog açık kalır ve hata caller'a iletilir.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    cleanup();
    const container = document.createElement('div');
    container.setAttribute('data-retailex-confirm-root', '');
    document.body.appendChild(container);
    const root = createRoot(container);
    pendingRoot = root;
    pendingContainer = container;

    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
      cleanup();
    };

    const Wrapper: React.FC = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <ConfirmDialog
          {...opts}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) settle(false);
          }}
          onConfirm={async () => {
            try {
              if (opts.onConfirm) await opts.onConfirm();
              setOpen(false);
              settle(true);
            } catch (err) {
              // Hata olursa dialog açık kalsın, caller yakalasın
              if (!settled) {
                settled = true;
                reject(err);
                cleanup();
              }
              throw err;
            }
          }}
          onCancel={() => {
            setOpen(false);
            settle(false);
          }}
        />
      );
    };

    root.render(<Wrapper />);
  });
}
