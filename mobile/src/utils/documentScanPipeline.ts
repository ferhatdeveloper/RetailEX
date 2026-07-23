/**
 * Adobe Scan tarzı belge tarama pipeline:
 * 1) Native kenar bulma / perspektif (VisionKit / ML Kit) — dev client / EAS
 * 2) Expo Go fallback: kamera + kırpma + kalite artırımı
 * 3) OCR (scanOcr / expo-text-extractor)
 * 4) İsteğe bağlı galeriye kayıt (expo-media-library)
 */

import {
  extractTextFromImageUri,
  loadImagePicker,
  type ScanOcrExtractResult,
} from './scanOcr';

export type DocumentCaptureMode = 'native' | 'fallback';

export type DocumentCaptureResult =
  | { canceled: true }
  | { canceled: false; uri: string; mode: DocumentCaptureMode }
  | { canceled: false; permissionDenied: 'camera' | 'gallery' };

export type DocumentScanPipelineResult = {
  uri: string;
  mode: DocumentCaptureMode;
  ocr: ScanOcrExtractResult;
  savedToGallery: boolean;
  saveError?: string;
};

/** file:// / content:// yoksa ekle (Android ML Kit bazen ham yol döner) */
export function normalizeScanUri(path: string): string {
  const p = String(path || '').trim();
  if (!p) return p;
  if (
    p.startsWith('file://') ||
    p.startsWith('content://') ||
    p.startsWith('ph://') ||
    p.startsWith('assets-library://') ||
    p.startsWith('data:') ||
    p.startsWith('http://') ||
    p.startsWith('https://')
  ) {
    return p;
  }
  return `file://${p}`;
}

function hasNativeDocumentScanner(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { TurboModuleRegistry, NativeModules } = require('react-native') as {
      TurboModuleRegistry?: { get?: (name: string) => unknown };
      NativeModules?: Record<string, unknown>;
    };
    // getEnforcing kullanma — Expo Go'da patlar; get/null güvenli
    return !!(
      TurboModuleRegistry?.get?.('DocumentScanner') ||
      NativeModules?.DocumentScanner
    );
  } catch {
    return false;
  }
}

/** Native belge tarayıcı (Expo Go'da false) */
export function isNativeDocumentScannerAvailable(): boolean {
  return hasNativeDocumentScanner();
}

/**
 * Tarama kalitesi için sıkıştırma / boyut sınırlama.
 * Expo Go'da kontrast filtresi yok; OCR için net JPEG üretmeye çalışır.
 */
export async function enhanceScanImage(uri: string): Promise<string> {
  const safe = normalizeScanUri(uri);
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      safe,
      [{ resize: { width: 2200 } }],
      {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return result?.uri ? normalizeScanUri(result.uri) : safe;
  } catch {
    return safe;
  }
}

/** Taranmış belgeyi cihaz galerisine kaydet (izin + onay kullanıcıda) */
export async function saveScanToGallery(
  uri: string,
  albumName = 'Asin',
): Promise<{ ok: boolean; error?: string }> {
  const safe = normalizeScanUri(uri);
  try {
    const MediaLibrary = await import('expo-media-library');
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      return { ok: false, error: 'galleryPermissionDenied' };
    }
    const asset = await MediaLibrary.createAssetAsync(safe);
    try {
      const albums = await MediaLibrary.getAlbumsAsync();
      const existing = albums.find((a) => a.title === albumName);
      if (existing) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], existing, false);
      } else {
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
      }
    } catch {
      // Albüm başarısız olsa bile asset galeride olabilir
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'saveFailed',
    };
  }
}

/**
 * Native ML Kit / VisionKit belge tarayıcı.
 * Kenar bulma + perspektif düzeltme + kırpma.
 */
async function captureWithNativeScanner(maxPages = 1): Promise<DocumentCaptureResult> {
  try {
    const DocumentScanner = (await import('react-native-document-scanner-plugin')).default;
    const response = await DocumentScanner.scanDocument({
      maxNumDocuments: Math.max(1, Math.min(maxPages, 5)),
      croppedImageQuality: 95,
    });
    if (response?.status === 'cancel') {
      return { canceled: true };
    }
    const first = response?.scannedImages?.[0];
    if (!first) return { canceled: true };
    const enhanced = await enhanceScanImage(first);
    return { canceled: false, uri: enhanced, mode: 'native' };
  } catch {
    // Native yok / Expo Go — fallback'e düş
    return captureWithCameraFallback();
  }
}

/** Expo Go / native yok: kamera + kullanıcı kırpması + kalite */
async function captureWithCameraFallback(): Promise<DocumentCaptureResult> {
  const ImagePicker = await loadImagePicker();
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return { canceled: false, permissionDenied: 'camera' };
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: true,
    aspect: [3, 4],
  });
  if (res.canceled || !res.assets?.[0]?.uri) return { canceled: true };
  const enhanced = await enhanceScanImage(res.assets[0].uri);
  return { canceled: false, uri: enhanced, mode: 'fallback' };
}

/** Galeriden seç → enhance (tarama sonrası düzenlenmiş görsel de olabilir) */
export async function pickGalleryForScan(): Promise<DocumentCaptureResult> {
  const ImagePicker = await loadImagePicker();
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { canceled: false, permissionDenied: 'gallery' };
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: true,
    aspect: [3, 4],
  });
  if (res.canceled || !res.assets?.[0]?.uri) return { canceled: true };
  const enhanced = await enhanceScanImage(res.assets[0].uri);
  return { canceled: false, uri: enhanced, mode: 'fallback' };
}

/**
 * Adobe Scan tarzı yakalama: native varsa kenar+perspektif, yoksa kırpmalı kamera.
 */
export async function captureDocumentScan(options?: {
  maxPages?: number;
}): Promise<DocumentCaptureResult> {
  if (hasNativeDocumentScanner()) {
    return captureWithNativeScanner(options?.maxPages ?? 1);
  }
  return captureWithCameraFallback();
}

/**
 * Tam pipeline: belge tara → OCR → isteğe bağlı galeriye kaydet.
 */
export async function runDocumentScanPipeline(options?: {
  maxPages?: number;
  saveToGallery?: boolean;
  albumName?: string;
  /** true ise galeri seçimi */
  fromGallery?: boolean;
}): Promise<
  | { canceled: true }
  | { canceled: false; permissionDenied: 'camera' | 'gallery' }
  | ({ canceled: false } & DocumentScanPipelineResult)
> {
  const capture = options?.fromGallery
    ? await pickGalleryForScan()
    : await captureDocumentScan({ maxPages: options?.maxPages });

  if (capture.canceled) return { canceled: true };
  if ('permissionDenied' in capture && capture.permissionDenied) {
    return { canceled: false, permissionDenied: capture.permissionDenied };
  }
  if (!('uri' in capture)) return { canceled: true };

  const uri = capture.uri;
  const ocr = await extractTextFromImageUri(uri);

  let savedToGallery = false;
  let saveError: string | undefined;
  if (options?.saveToGallery) {
    const saved = await saveScanToGallery(uri, options.albumName ?? 'Asin');
    savedToGallery = saved.ok;
    if (!saved.ok) saveError = saved.error;
  }

  return {
    canceled: false,
    uri,
    mode: capture.mode,
    ocr,
    savedToGallery,
    saveError,
  };
}
