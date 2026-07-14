/**
 * Ortak kamera / galeri + cihaz OCR pipeline.
 * Parse mantığı ekrana özel (identityCardOcrParse, shelfLabelOcrParse, documentOcrParse).
 *
 * OCR motoru: expo-text-extractor (ML Kit / Vision) — Expo Go'da native modül yoktur;
 * geliştirme build / EAS client gerekir. Expo Go'da graceful fallback (manuel alanlar).
 */

export type ScanOcrExtractResult = {
  /** Ham metin blokları (satır / blok) */
  blocks: string[];
  ocrAvailable: boolean;
  /**
   * 'ocrUnsupported' — Expo Go / native yok / cihaz desteklemiyor
   * 'ocrFailed' — native var ama okuma patladı
   */
  ocrError?: 'ocrUnsupported' | 'ocrFailed';
};

/** Native ExpoTextExtractor yüklü mü? (Expo Go → genelde false) */
function hasNativeTextExtractor(): boolean {
  try {
    // Metro sync resolve — dinamik import burada await istemeden ön kontrol için
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => { isSupported?: boolean } | null;
    };
    const native = core.requireOptionalNativeModule?.('ExpoTextExtractor') ?? null;
    if (!native) return false;
    if (native.isSupported === false) return false;
    return true;
  } catch {
    return false;
  }
}

/** Ham JS/native hata mesajını kullanıcıya sızdırmadan sınıflandır */
function classifyOcrThrowable(e: unknown): 'ocrUnsupported' | 'ocrFailed' {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (
    !msg ||
    /Cannot find native module|ExpoTextExtractor|native module|is not a function|undefined|null|reload|not supported|Expo Go|TurboModule|NativeModules/i.test(
      msg,
    )
  ) {
    return 'ocrUnsupported';
  }
  return 'ocrFailed';
}

export async function loadImagePicker() {
  try {
    return await import('expo-image-picker');
  } catch (e) {
    throw new Error(
      e instanceof Error
        ? `expo-image-picker yüklenemedi: ${e.message}`
        : 'expo-image-picker yüklenemedi',
    );
  }
}

/**
 * expo-text-extractor ile görüntüden metin blokları.
 * Expo Go / eksik native → ocrUnsupported (exception fırlatmaz).
 */
export async function extractTextFromImageUri(uri: string): Promise<ScanOcrExtractResult> {
  const safeUri = typeof uri === 'string' ? uri.trim() : '';
  if (!safeUri) {
    return { blocks: [], ocrAvailable: false, ocrError: 'ocrUnsupported' };
  }

  // Ön kontrol: JS paketini bile yüklemeden native varlığını doğrula
  if (!hasNativeTextExtractor()) {
    return { blocks: [], ocrAvailable: false, ocrError: 'ocrUnsupported' };
  }

  try {
    const mod = await import('expo-text-extractor');
    if (!mod || mod.isSupported !== true || typeof mod.extractTextFromImage !== 'function') {
      return { blocks: [], ocrAvailable: false, ocrError: 'ocrUnsupported' };
    }
    const blocks = await mod.extractTextFromImage(safeUri);
    return {
      blocks: Array.isArray(blocks) ? blocks.map((b) => String(b ?? '')).filter(Boolean) : [],
      ocrAvailable: true,
    };
  } catch (e) {
    return {
      blocks: [],
      ocrAvailable: false,
      ocrError: classifyOcrThrowable(e),
    };
  }
}

export type PickImageResult =
  | { canceled: true }
  | { canceled: false; uri: string }
  | { canceled: false; permissionDenied: 'camera' | 'gallery' };

/** Kamera ile tek fotoğraf; izin yoksa permissionDenied */
export async function pickImageFromCamera(quality = 0.9): Promise<PickImageResult> {
  const ImagePicker = await loadImagePicker();
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return { canceled: false, permissionDenied: 'camera' };
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]?.uri) return { canceled: true };
  return { canceled: false, uri: res.assets[0].uri };
}

/** Galeriden tek görsel */
export async function pickImageFromGallery(quality = 0.9): Promise<PickImageResult> {
  const ImagePicker = await loadImagePicker();
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { canceled: false, permissionDenied: 'gallery' };
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality,
    allowsEditing: false,
  });
  if (res.canceled || !res.assets?.[0]?.uri) return { canceled: true };
  return { canceled: false, uri: res.assets[0].uri };
}
