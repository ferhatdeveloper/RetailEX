import { Platform, useWindowDimensions } from 'react-native';

export type DeviceLayout = {
  width: number;
  height: number;
  aspectRatio: number;
  isTablet: boolean;
  isLandscape: boolean;
  isLandscapeTablet: boolean;
};

/**
 * Saf hesaplama — hook kullanmadan (örn. component dışı util) çağrılabilir.
 * Android'de `Platform.isPad` yok; yalnızca iOS'ta kullanılır.
 */
export function getDeviceLayout(
  width: number,
  height: number,
  isPad?: boolean,
): DeviceLayout {
  const safeWidth = width > 0 ? width : 0;
  const safeHeight = height > 0 ? height : 1;
  const aspectRatio = safeHeight > 0 ? safeWidth / safeHeight : 0;
  const isLandscape = safeWidth > safeHeight;

  const iosPadFlag =
    Platform.OS === 'ios' ? Boolean(isPad ?? (Platform as { isPad?: boolean }).isPad) : false;

  const isTablet =
    safeWidth >= 720 || (Platform.OS === 'ios' && iosPadFlag && Math.min(safeWidth, safeHeight) >= 600);

  return {
    width: safeWidth,
    height: safeHeight,
    aspectRatio,
    isTablet,
    isLandscape,
    isLandscapeTablet: isTablet && isLandscape,
  };
}

/**
 * Cihazın mevcut boyutlarına göre layout kararlarını döndürür.
 * - `isTablet`: genişlik ≥ 720pt veya iPad (Math.min ≥ 600pt).
 * - `isLandscape`: genişlik > yükseklik.
 * - `isLandscapeTablet`: tablet + yatay (restoran/dashboard için sık kullanılır).
 */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  return getDeviceLayout(width, height);
}
