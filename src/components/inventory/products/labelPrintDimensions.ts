export const LABEL_MM_MIN = 8;
export const LABEL_MM_MAX = 420;

export const LS_LABEL_CUSTOM_MM_ENABLED = 'retailex-label-custom-mm-enabled';
export const LS_LABEL_CUSTOM_WIDTH_MM = 'retailex-label-custom-width-mm';
export const LS_LABEL_CUSTOM_HEIGHT_MM = 'retailex-label-custom-height-mm';

export function readLabelCustomMmEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = localStorage.getItem(LS_LABEL_CUSTOM_MM_ENABLED);
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
  } catch {
    /* ignore */
  }
  return false;
}

export function readLabelCustomWidthMm(fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const n = Number(localStorage.getItem(LS_LABEL_CUSTOM_WIDTH_MM));
    if (Number.isFinite(n) && n >= LABEL_MM_MIN && n <= LABEL_MM_MAX) return n;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function readLabelCustomHeightMm(fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const n = Number(localStorage.getItem(LS_LABEL_CUSTOM_HEIGHT_MM));
    if (Number.isFinite(n) && n >= LABEL_MM_MIN && n <= LABEL_MM_MAX) return n;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function clampLabelMm(v: number, fallback: number): number {
  const n = Number.isFinite(v) ? v : fallback;
  return Math.min(LABEL_MM_MAX, Math.max(LABEL_MM_MIN, n));
}

/** Önizleme / yazdırma için gerçek mm boyutu (özel açıksa genişlik-yükseklik ayrı uygulanır). */
export function buildActiveLabelSize<T extends { width: number; height: number; name: string }>(
  selected: T,
  useCustomMm: boolean,
  customWidthMm: number,
  customHeightMm: number
): T {
  if (!useCustomMm) return selected;
  const w = clampLabelMm(customWidthMm, selected.width);
  const h = clampLabelMm(customHeightMm, selected.height);
  return {
    ...selected,
    width: w,
    height: h,
    name: `${w}×${h} mm`,
  } as T;
}
