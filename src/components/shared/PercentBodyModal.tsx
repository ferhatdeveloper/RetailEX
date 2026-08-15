import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from './FullscreenBodyPortal';

export const PERCENT_BODY_MODAL_PORTAL_CLASS =
  'overflow-hidden bg-black/60 backdrop-blur-sm flex items-center justify-center p-4';

export const PERCENT_BODY_MODAL_SIZES = {
  list: {
    width: 'min(92vw, 56rem)',
    height: 'min(85vh, calc(100dvh - 2rem))',
    maxHeight: 'calc(100dvh - 2rem)',
  },
  wide: {
    width: 'min(94vw, 72rem)',
    height: 'min(88vh, calc(100dvh - 2rem))',
    maxHeight: 'calc(100dvh - 2rem)',
  },
  compact: {
    width: 'min(92vw, 28rem)',
    maxHeight: 'calc(100dvh - 2rem)',
  },
} as const satisfies Record<string, CSSProperties>;

export type PercentBodyModalSize = keyof typeof PERCENT_BODY_MODAL_SIZES;

type PercentBodyModalProps = {
  children: ReactNode;
  onClose?: () => void;
  size?: PercentBodyModalSize;
  shellClassName?: string;
  ariaLabel?: string;
};

export function PercentBodyModal({
  children,
  onClose,
  size = 'list',
  shellClassName = '',
  ariaLabel,
}: PercentBodyModalProps) {
  /** Satır tıklamasıyla açılınca aynı click overlay’e “düşüp” hemen kapanmasın. */
  const [overlayCloseArmed, setOverlayCloseArmed] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const arm = window.setTimeout(() => setOverlayCloseArmed(true), 80);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(arm);
    };
  }, []);

  return (
    <FullscreenBodyPortal
      zIndex={MODAL_OVERLAY_Z}
      className={PERCENT_BODY_MODAL_PORTAL_CLASS}
      role="dialog"
      aria-modal
      aria-label={ariaLabel}
      onClick={overlayCloseArmed ? onClose : undefined}
    >
      <div
        className={`flex flex-col shadow-2xl overflow-hidden rounded-xl isolate bg-white text-gray-900 min-h-0 [&>form]:flex [&>form]:h-full [&>form]:min-h-0 [&>form]:flex-col [&>form]:overflow-hidden ${shellClassName}`}
        style={PERCENT_BODY_MODAL_SIZES[size]}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </FullscreenBodyPortal>
  );
}

/** Sabit kabuk içinde kaydırılabilir liste alanı */
export function PercentBodyModalScrollBody({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] ${className}`}
    >
      {children}
    </div>
  );
}
