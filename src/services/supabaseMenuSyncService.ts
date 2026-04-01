/**
 * Supabase menu_items / menu_categories senkron servisi
 * - Yerel ürün adı/kodu ile menu_items eşleştirip resim önerisi
 * - Yerelde eklenen/güncellenen ürünleri Supabase menu_items'a yansıtma
 */

import { supabase } from '../utils/supabase/client';
import { organizationAPI } from './api/organization';
import { ERP_SETTINGS } from './postgres';
import type { Product } from '../core/types';

export interface MenuCategory {
  id: string;
  company_id: string;
  name_tr: string;
  name_en: string;
  display_order: number | null;
  is_visible: boolean | null;
}

export interface MenuItem {
  id: string;
  company_id: string;
  category_id: string;
  product_code: string | null;
  sku: string | null;
  name_tr: string;
  name_en: string;
  name_ar: string | null;
  name_ku: string | null;
  name_fa: string | null;
  description_tr: string | null;
  description_en: string | null;
  price: number;
  cost_price: number | null;
  currency: string | null;
  image_url: string | null;
  gallery_urls: string[] | null;
  unit: string | null;
  is_available: boolean | null;
  is_visible: boolean | null;
  display_order: number | null;
  deleted_at: string | null;
}

const DEFAULT_CATEGORY_NAME_TR = 'Genel';
const DEFAULT_CATEGORY_NAME_EN = 'General';

export const supabaseMenuSyncService = {
  /**
   * Firma için Supabase company_id (firms.supabase_firm_id) döner.
   */
  async getCompanyId(): Promise<string | null> {
    const firm = await organizationAPI.getFirmByFirmNr(ERP_SETTINGS.firmNr);
    const id = firm?.supabase_firm_id?.trim();
    return id || null;
  },

  /**
   * Şirketin menü kategorilerini getirir.
   */
  async getCategories(companyId: string): Promise<MenuCategory[]> {
    const { data, error } = await supabase
      .from('menu_categories')
      .select('id, company_id, name_tr, name_en, display_order, is_visible')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });
    if (error) {
      console.error('[supabaseMenuSyncService] getCategories:', error);
      return [];
    }
    return (data || []) as MenuCategory[];
  },

  /**
   * Varsa ilk kategoriyi, yoksa "Genel" kategorisini oluşturup döner.
   */
  async getOrCreateDefaultCategory(companyId: string): Promise<string | null> {
    const categories = await this.getCategories(companyId);
    if (categories.length > 0) return categories[0].id;
    const { data: inserted, error } = await supabase
      .from('menu_categories')
      .insert({
        company_id: companyId,
        name_tr: DEFAULT_CATEGORY_NAME_TR,
        name_en: DEFAULT_CATEGORY_NAME_EN,
        display_order: 0,
        is_visible: true,
      })
      .select('id')
      .single();
    if (error) {
      console.error('[supabaseMenuSyncService] getOrCreateDefaultCategory:', error);
      return null;
    }
    return inserted?.id ?? null;
  },

  /**
   * Şirketin menü ürünlerini getirir.
   */
  async getMenuItems(companyId: string): Promise<MenuItem[]> {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });
    if (error) {
      console.error('[supabaseMenuSyncService] getMenuItems:', error);
      return [];
    }
    return (data || []) as MenuItem[];
  },

  /** CDN galerisi için kullanılan Storage bucket adı */
  STORAGE_BUCKET: 'product-images',

  /**
   * Supabase Storage bucket'tan şirket klasöründeki resimleri listeler (menu_items boş/erişilemezse kullanılır).
   * Hata durumunda mesaj döner ki CDN galerisi boşken kullanıcıya gösterilebilsin.
   */
  async getStorageImagesForGallery(companyId: string): Promise<{ images: { url: string; label: string }[]; error?: string }> {
    const result: { url: string; label: string }[] = [];
    try {
      const { data: files, error } = await supabase.storage
        .from(this.STORAGE_BUCKET)
        .list(companyId, { limit: 500 });
      if (error) {
        console.warn('[supabaseMenuSyncService] Storage list error:', error.message);
        return { images: [], error: error.message };
      }
      if (!files?.length) return { images: [] };
      for (const file of files) {
        if (!file.name || file.name.endsWith('/')) continue;
        const path = `${companyId}/${file.name}`;
        const { data: urlData } = supabase.storage.from(this.STORAGE_BUCKET).getPublicUrl(path);
        const label = file.name.replace(/\.[^.]+$/, ''); // dosya adından uzantı çıkar
        result.push({ url: urlData.publicUrl, label });
      }
      return { images: result };
    } catch (e: any) {
      console.warn('[supabaseMenuSyncService] getStorageImagesForGallery:', e);
      return { images: [], error: e?.message || 'Storage listesi alınamadı.' };
    }
  },

  /**
   * Şirketin tüm menü resimlerini galeri için döner (menu_items + gerekirse Storage fallback).
   * Boş ve hata durumunda storageError ile neden boş olduğu iletilebilir.
   */
  async getAllImagesForGallery(companyId: string): Promise<{ images: { url: string; label: string }[]; storageError?: string }> {
    const result: { url: string; label: string }[] = [];
    try {
      const items = await this.getMenuItems(companyId);
      for (const item of items) {
        const label = [item.name_tr, item.name_en, item.product_code].filter(Boolean).join(' ') || '';
        if (item.image_url) {
          result.push({ url: item.image_url, label });
        }
        if (item.gallery_urls?.length) {
          for (const url of item.gallery_urls) {
            if (url) result.push({ url, label });
          }
        }
      }
      if (result.length === 0) {
        const { images: fromStorage, error: storageErr } = await this.getStorageImagesForGallery(companyId);
        return { images: fromStorage, storageError: storageErr };
      }
      return { images: result };
    } catch (e) {
      console.error('[supabaseMenuSyncService] getAllImagesForGallery:', e);
      const { images: fromStorage, error: storageErr } = await this.getStorageImagesForGallery(companyId);
      return { images: fromStorage, storageError: storageErr };
    }
  },

  /**
   * Ürün adı veya product_code ile eşleşen menu_item'ları bulur; resim önerisi için kullanılır.
   */
  async suggestImageForProduct(
    companyId: string,
    productName: string,
    productCode?: string
  ): Promise<{ image_url: string | null; gallery_urls: string[]; menu_item: MenuItem }[]> {
    const items = await this.getMenuItems(companyId);
    const name = (productName || '').trim().toLowerCase();
    const code = (productCode || '').trim().toLowerCase();
    const suggestions: { image_url: string | null; gallery_urls: string[]; menu_item: MenuItem }[] = [];

    for (const item of items) {
      const hasImage = !!(item.image_url || (item.gallery_urls && item.gallery_urls.length > 0));
      if (!hasImage) continue;

      const matchCode = code && item.product_code && item.product_code.trim().toLowerCase() === code;
      const nameTr = (item.name_tr || '').trim().toLowerCase();
      const nameEn = (item.name_en || '').trim().toLowerCase();
      const matchName =
        name &&
        (nameTr === name ||
          nameEn === name ||
          nameTr.includes(name) ||
          nameEn.includes(name) ||
          name.includes(nameTr) ||
          name.includes(nameEn));

      if (matchCode || matchName) {
        suggestions.push({
          image_url: item.image_url || null,
          gallery_urls: item.gallery_urls || [],
          menu_item: item,
        });
      }
    }
    return suggestions;
  },

  /**
   * Yerel ürünü Supabase menu_items'a yansıtır (varsa günceller, yoksa ekler).
   * Eşleşme: company_id + product_code (veya code yoksa name_tr ile bulup güncelleme).
   */
  async upsertMenuItem(product: Product): Promise<{ ok: boolean; error?: string; id?: string }> {
    const companyId = await this.getCompanyId();
    if (!companyId) {
      return { ok: false, error: 'Supabase Firma ID tanımlı değil. Kurulum > Firma düzenle > Supabase Firma ID.' };
    }

    const categoryId = await this.getOrCreateDefaultCategory(companyId);
    if (!categoryId) {
      return { ok: false, error: 'Menü kategorisi alınamadı veya oluşturulamadı.' };
    }

    const code = (product.code || '').trim() || null;
    const nameTr = product.name || '';
    const nameEn = (product.description_en || product.name || '').trim() || nameTr;
    const imageUrl = (product as any).image_url_cdn || product.image_url || null;
    const payload = {
      company_id: companyId,
      category_id: categoryId,
      product_code: code,
      name_tr: nameTr,
      name_en: nameEn,
      name_ar: product.description_ar || null,
      name_ku: product.description_ku || null,
      description_tr: product.description_tr || product.description || null,
      description_en: product.description_en || null,
      description_ar: product.description_ar || null,
      description_ku: product.description_ku || null,
      cost_price: product.cost ?? 0,
      price: product.price ?? 0,
      currency: product.currency || 'TRY',
      image_url: imageUrl && imageUrl.startsWith('http') ? imageUrl : null,
      unit: product.unit || 'adet',
      is_available: product.isActive !== false,
      is_visible: true,
      display_order: 0,
      updated_at: new Date().toISOString(),
    };

    if (code) {
      const { data: existing } = await supabase
        .from('menu_items')
        .select('id')
        .eq('company_id', companyId)
        .eq('product_code', code)
        .is('deleted_at', null)
        .maybeSingle();

      if (existing?.id) {
        const { error: updateErr } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', existing.id);
        if (updateErr) {
          console.error('[supabaseMenuSyncService] update menu_items:', updateErr);
          return { ok: false, error: updateErr.message };
        }
        return { ok: true, id: existing.id };
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('menu_items')
      .insert({ ...payload, deleted_at: null })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[supabaseMenuSyncService] insert menu_items:', insertErr);
      return { ok: false, error: insertErr.message };
    }
    return { ok: true, id: inserted?.id };
  },
};
