/**
 * Image Utilities for ExRetailOS
 * Handles image compression, WebP conversion and Base64
 */

const DEFAULT_MAX = 1024;
const DEFAULT_WEBP_QUALITY = 0.82;
const DEFAULT_JPEG_QUALITY = 0.7;

function drawImageToCanvas(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number
): { canvas: HTMLCanvasElement; width: number; height: number } {
  let width = img.width;
  let height = img.height;
  if (width > maxWidth || height > maxHeight) {
    const r = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * r);
    height = Math.round(height * r);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context could not be created');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, width, height };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** WebP destekli mi kontrol et (tarayıcı) */
export function isWebPSupported(): boolean {
  const canvas = document.createElement('canvas');
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

/**
 * Dosyayı WebP formatında sıkıştırıp data URL döner (ürün resmi için optimize).
 * Kalite 0.82, max 1024px — iyi görüntü / küçük boyut.
 */
export const compressImageToWebP = (
  file: File,
  maxWidth = DEFAULT_MAX,
  maxHeight = DEFAULT_MAX,
  quality = DEFAULT_WEBP_QUALITY
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async (event) => {
      try {
        const dataUrl = event.target?.result as string;
        const img = await loadImage(dataUrl);
        const { canvas } = drawImageToCanvas(img, maxWidth, maxHeight);
        if (isWebPSupported()) {
          const webpUrl = canvas.toDataURL('image/webp', quality);
          resolve(webpUrl);
        } else {
          const jpegUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(jpegUrl);
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Herhangi bir resim data URL'ini WebP Blob'a çevirir (Supabase yükleme için).
 */
export const dataUrlToWebPBlob = (
  dataUrl: string,
  quality = DEFAULT_WEBP_QUALITY
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const { canvas } = drawImageToCanvas(img, DEFAULT_MAX, DEFAULT_MAX);
        if (isWebPSupported()) {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('WebP blob failed'))),
            'image/webp',
            quality
          );
        } else {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('JPEG blob failed'))),
            'image/jpeg',
            quality
          );
        }
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
};

/**
 * File'ı WebP (veya JPEG fallback) Blob'a çevirir — boyut sınırlı, optimize.
 */
export const fileToWebPBlob = (
  file: File,
  maxWidth = DEFAULT_MAX,
  maxHeight = DEFAULT_MAX,
  quality = DEFAULT_WEBP_QUALITY
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async (event) => {
      try {
        const img = await loadImage(event.target?.result as string);
        const { canvas } = drawImageToCanvas(img, maxWidth, maxHeight);
        const mime = isWebPSupported() ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Blob failed'))),
          mime,
          quality
        );
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

export const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = DEFAULT_JPEG_QUALITY): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const { canvas } = drawImageToCanvas(img, maxWidth, maxHeight);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export const getBase64Size = (base64String: string): number => {
    const padding = base64String.endsWith('==') ? 2 : base64String.endsWith('=') ? 1 : 0;
    return (base64String.length * (3 / 4)) - padding;
};

export const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};


