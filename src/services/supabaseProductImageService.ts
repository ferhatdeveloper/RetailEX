/**
 * Supabase ürün resmi servisi
 * - CDN'e (Supabase Storage) WebP formatında optimize yükleme
 * - Public URL alma
 * - CDN'deki resmi base64 olarak indirip locale kullanım
 */

import { supabase } from '../utils/supabase/client';
import { organizationAPI } from './api/organization';
import { ERP_SETTINGS } from './postgres';
import { fileToWebPBlob, dataUrlToWebPBlob } from '../utils/imageUtils';

const BUCKET_NAME = 'product-images';
const WEBP_QUALITY = 0.82;

export const supabaseProductImageService = {
  /**
   * Supabase Storage'a ürün resmini WebP formatında optimize ederek yükler.
   * Path: {supabase_firm_id}/{productId}.webp
   */
  async uploadProductImage(
    file: File,
    productId: string
  ): Promise<{ url: string } | { error: string }> {
    try {
      const firm = await organizationAPI.getFirmByFirmNr(ERP_SETTINGS.firmNr);
      const supabaseFirmId = firm?.supabase_firm_id?.trim();
      if (!supabaseFirmId) {
        return { error: 'Supabase Firma ID tanımlı değil. Kurulum > Firma düzenle > Supabase Firma ID alanını doldurun.' };
      }

      const blob = await fileToWebPBlob(file, 1024, 1024, WEBP_QUALITY);
      const path = `${supabaseFirmId}/${productId}.webp`;

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, blob, { upsert: true, contentType: 'image/webp' });

      if (error) {
        console.error('[supabaseProductImageService] upload error:', error);
        return { error: error.message || 'Yükleme başarısız.' };
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

      return { url: urlData.publicUrl };
    } catch (e: any) {
      console.error('[supabaseProductImageService] upload exception:', e);
      return { error: e?.message || 'Beklenmeyen hata.' };
    }
  },

  /**
   * Base64 data URL'i WebP'ye çevirip Supabase'e yükler (ürün kaydından gelen resim).
   */
  async uploadProductImageFromDataUrl(
    dataUrl: string,
    productId: string
  ): Promise<{ url: string } | { error: string }> {
    try {
      const firm = await organizationAPI.getFirmByFirmNr(ERP_SETTINGS.firmNr);
      const supabaseFirmId = firm?.supabase_firm_id?.trim();
      if (!supabaseFirmId) {
        return { error: 'Supabase Firma ID tanımlı değil.' };
      }

      const blob = await dataUrlToWebPBlob(dataUrl, WEBP_QUALITY);
      const path = `${supabaseFirmId}/${productId}.webp`;

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, blob, { upsert: true, contentType: 'image/webp' });

      if (error) {
        return { error: error.message };
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      return { url: urlData.publicUrl };
    } catch (e: any) {
      return { error: e?.message || 'Yükleme hatası.' };
    }
  },

  /**
   * CDN'deki resmi indirip data URL (base64) olarak döner — "locale'de kullan" için.
   */
  async downloadCdnImageAsBase64(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  },

  /**
   * Storage'dan ürün resmini siler (path: {supabase_firm_id}/{productId}.*).
   */
  async deleteProductImage(productId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const firm = await organizationAPI.getFirmByFirmNr(ERP_SETTINGS.firmNr);
      const supabaseFirmId = firm?.supabase_firm_id?.trim();
      if (!supabaseFirmId) {
        return { ok: false, error: 'Supabase Firma ID tanımlı değil.' };
      }

      const { data: list } = await supabase.storage
        .from(BUCKET_NAME)
        .list(supabaseFirmId);

      const toRemove = (list || []).filter(
        (f) => f.name === productId || f.name.startsWith(`${productId}.`)
      );
      if (toRemove.length === 0) return { ok: true };

      const paths = toRemove.map((f) => `${supabaseFirmId}/${f.name}`);
      const { error } = await supabase.storage.from(BUCKET_NAME).remove(paths);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message };
    }
  },
};
