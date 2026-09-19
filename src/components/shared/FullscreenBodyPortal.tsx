import { createPortal } from 'react-dom';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../ui/utils';

/**
 * Yönetim modülü mobil ana alan `z-[10]`; MainLayout üst çubuk `z-[100]`.
 * `fixed` tam ekran içerik bu bağlamda üst çubuğun altında kalır; `document.body` portalı ile üstte çizilir.
 *
 * Katman sırası (yüksek → düşük): GRID_POPOVER_Z > MODAL_OVERLAY_NESTED_Z > MODAL_OVERLAY_Z.
 * Analiz / PercentBodyModal içindeki DevExDataGrid FilterMenu ve Kolonlar menüsü
 * modalın altında kalmamalı — bu yüzden grid popover en üstte.
 * CSS z-index pratik üst sınırı ~2147483647.
 */
/** Tablo huni / kolon seçici — `document.body` portalı; modal içi grid’lerde de tıklanabilir. */
export const GRID_POPOVER_Z = 2147483647;

/** Tam ekran modal / ekstre — güzellik takvimi ve üst layout’un üstünde (inline style zorunlu). */
export const MODAL_OVERLAY_Z = 2147483645;

/** Hafif tam ekran katmanlar (mobil aksiyon sheet vb.) */
export const FULLSCREEN_BODY_PORTAL_Z = 25200;

/** İç içe modal (detay, onay) — ana modalın üstünde; grid popover altında */
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
  zIndex = MODAL_OVERLAY_Z,
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

/** Ortalanmış diyalog overlay — her zaman document.body + en üst z-index. */
export function ModalLayer({
  nested = false,
  zIndex,
  className,
  ...rest
}: FullscreenBodyPortalProps & { nested?: boolean }) {
  return (
    <FullscreenBodyPortal
      zIndex={zIndex ?? (nested ? MODAL_OVERLAY_NESTED_Z : MODAL_OVERLAY_Z)}
      className={className}
      {...rest}
    />
  );
}
