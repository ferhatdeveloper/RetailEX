import { useState, useEffect } from 'react';

export interface Breakpoints {
  isMobile: boolean;      // < 768px
  isTablet: boolean;      // 768px - 1023px
  isDesktop: boolean;    // >= 1024px
  isSmallMobile: boolean; // < 480px
  width: number;
  height: number;
}

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;
const SMALL_MOBILE_BREAKPOINT = 480;

function readEffectiveWidth(): number {
  if (typeof window === 'undefined') return 1024;
  const rawZoom = parseFloat(document.documentElement.style.zoom || '1');
  const zoom = Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1;
  return window.innerWidth / zoom;
}

/**
 * Responsive hook - Tüm ekran boyutlarını takip eder
 * Bootstrap-like breakpoint sistemi
 */
export function useResponsive(): Breakpoints {
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? readEffectiveWidth() : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: readEffectiveWidth(),
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveWidth = dimensions.width;

  return {
    isMobile: effectiveWidth < MOBILE_BREAKPOINT,
    isTablet: effectiveWidth >= MOBILE_BREAKPOINT && effectiveWidth < TABLET_BREAKPOINT,
    isDesktop: effectiveWidth >= TABLET_BREAKPOINT,
    isSmallMobile: effectiveWidth < SMALL_MOBILE_BREAKPOINT,
    width: effectiveWidth,
    height: dimensions.height,
  };
}

/**
 * Responsive grid columns helper
 * Bootstrap-like: 1 col mobile, 2 tablet, 4 desktop
 */
export function useResponsiveColumns(defaultMobile = 1, defaultTablet = 2, defaultDesktop = 4) {
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  if (isMobile) return defaultMobile;
  if (isTablet) return defaultTablet;
  return defaultDesktop;
}

/**
 * Responsive padding helper
 */
export function useResponsivePadding() {
  const { isMobile } = useResponsive();
  return isMobile ? 'p-3 md:p-4' : 'p-4 md:p-6';
}

/**
 * Responsive text size helper
 */
export function useResponsiveTextSize() {
  const { isMobile, isTablet } = useResponsive();
  if (isMobile) return 'text-sm';
  if (isTablet) return 'text-base';
  return 'text-base md:text-lg';
}







