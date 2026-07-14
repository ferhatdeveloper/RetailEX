/**
 * Ortak kamera / galeri + cihaz OCR pipeline.
 * Parse mantığı ekrana özel (identityCardOcrParse, shelfLabelOcrParse, documentOcrParse).
 */

export type ScanOcrExtractResult = {
  /** Ham metin blokları (satır / blok) */
  blocks: string[];
  ocrAvailable: boolean;
  /** 'ocrUnsupported' | hata mesajı */
  ocrError?: string;
};

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

/** expo-text-extractor ile görüntüden metin blokları */
export async function extractTextFromImageUri(uri: string): Promise<ScanOcrExtractResult> {
  try {
    const mod = await import('expo-text-extractor');
    if (!mod.isSupported) {
      return { blocks: [], ocrAvailable: false, ocrError: 'ocrUnsupported' };
    }
    const blocks = await mod.extractTextFromImage(uri);
    return {
      blocks: Array.isArray(blocks) ? blocks.map((b) => String(b ?? '')) : [],
      ocrAvailable: true,
    };
  } catch (e) {
    return {
      blocks: [],
      ocrAvailable: false,
      ocrError: e instanceof Error ? e.message : 'ocrFailed',
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
