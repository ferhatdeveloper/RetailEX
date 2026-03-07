import { useState, useEffect, memo } from 'react';

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: string;
  width?: number;
  height?: number;
}

/**
 * Optimized Image Component with:
 * - Lazy loading
 * - WebP format support with fallback
 * - Loading placeholder
 * - Error handling
 */
export const OptimizedImage = memo(({
  src,
  alt,
  className = '',
  fallback = '/placeholder.png',
  width,
  height,
}: OptimizedImageProps) => {
  const [imageSrc, setImageSrc] = useState<string>(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setImageSrc(src);
    setIsLoading(true);
    setHasError(false);
  }, [src]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    if (fallback) {
      setImageSrc(fallback);
    }
  };

  // Generate WebP source if the image is not already WebP
  const getWebPSrc = (imgSrc: string) => {
    if (imgSrc.endsWith('.webp')) return null;
    return imgSrc.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  };

  const webpSrc = getWebPSrc(imageSrc);

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {isLoading && !hasError && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      
      <picture>
        {webpSrc && (
          <source srcSet={webpSrc} type="image/webp" />
        )}
        <img
          src={imageSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
          width={width}
          height={height}
        />
      </picture>
    </div>
  );
});

OptimizedImage.displayName = 'OptimizedImage';

/**
 * Background Image Component with lazy loading
 */
export const OptimizedBackgroundImage = memo(({
  src,
  children,
  className = '',
  fallback = '/placeholder.png',
}: {
  src: string;
  children?: React.ReactNode;
  className?: string;
  fallback?: string;
}) => {
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setBgImage(src);
      setIsLoading(false);
    };
    img.onerror = () => {
      setBgImage(fallback);
      setIsLoading(false);
    };
  }, [src, fallback]);

  return (
    <div
      className={`${className} ${isLoading ? 'bg-gray-200 animate-pulse' : ''}`}
      style={{
        backgroundImage: bgImage ? `url(${bgImage})` : undefined,
      }}
    >
      {children}
    </div>
  );
});

OptimizedBackgroundImage.displayName = 'OptimizedBackgroundImage';



