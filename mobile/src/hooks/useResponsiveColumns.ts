import { useWindowDimensions } from 'react-native';

export type ResponsiveColumnsOptions = {
  minCol?: number;
  maxCol?: number;
};

export type ResponsiveColumnsResult = number;

/**
 * Genişliğe göre ızgara kolon sayısı döndürür.
 *
 * | Genişlik | Kolon |
 * |---|---|
 * | ≥ 1200 | `maxCol` (varsayılan 5) |
 * | ≥ 900  | 4 |
 * | ≥ 720  | 3 |
 * | ≥ 480  | 2 |
 * | aksi   | `minCol` (varsayılan 1) |
 *
 * Sonuç her zaman `[minCol, maxCol]` aralığına clamp edilir.
 */
export function useResponsiveColumns({
  minCol = 1,
  maxCol = 5,
}: ResponsiveColumnsOptions = {}): ResponsiveColumnsResult {
  const { width } = useWindowDimensions();

  let cols: number;
  if (width >= 1200) cols = maxCol;
  else if (width >= 900) cols = 4;
  else if (width >= 720) cols = 3;
  else if (width >= 480) cols = 2;
  else cols = minCol;

  const lo = Math.min(minCol, maxCol);
  const hi = Math.max(minCol, maxCol);
  if (cols < lo) return lo;
  if (cols > hi) return hi;
  return cols;
}
