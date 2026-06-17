import { createPortal } from 'react-dom';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../ui/utils';

/**
 * Yönetim modülü mobil ana alan `z-[10]`; MainLayout üst çubuk `z-[100]`.
 * `fixed` tam ekran içerik bu bağlamda üst çubuğun altında kalır; `document.body` portalı ile üstte çizilir.
 */
/** Tam ekran modal / ekstre — güzellik takvimi ve üst layout’un üstünde (inline style zorunlu). */
export const MODAL_OVERLAY_Z = 2147483646;

/** Hafif tam ekran katmanlar (mobil aksiyon sheet vb.) */
export const FULLSCREEN_BODY_PORTAL_Z = 25200;

/** İç içe modal (detay, onay) — ana tam ekran modalın üstünde */
export const MODAL_OVERLAY_NESTED_Z = MODAL_OVERLAY_Z + 1;

export type FullscreenBodyPortalProps = {
  children: ReactNode;
  /** `fixed inset-0` dışındaki sınıflar (flex, bg, padding, …) */
  className?: string;
  style?: CSSProperties;
  zIndex?: number;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'>;

export function FullscreenBodyPortal({
  children,
  className,
  style,
  zIndex = FULLSCREEN_BODY_PORTAL_Z,
  ...rest
}: FullscreenBodyPortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={cn('fixed inset-0', className)} style={{ zIndex, ...style }} {...rest}>
      {children}
    </div>,
    document.body,
  );
}
