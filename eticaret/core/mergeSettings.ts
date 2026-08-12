import type { EticaretSettings } from './types';
import type { PaymentProviderConfig } from './payments/types';
import { DEFAULT_STOREFRONT_FEATURES } from './contentTypes';
import { DEFAULT_ETICARET_SETTINGS } from './settings';

/** Registry + kiracı DB + yerel önbellek birleştirme */
export function mergeEticaretSettings(
  ...layers: Array<Partial<EticaretSettings> | null | undefined>
): EticaretSettings {
  let merged: EticaretSettings = { ...DEFAULT_ETICARET_SETTINGS };
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    merged = {
      ...merged,
      ...layer,
      paymentProviders: layer.paymentProviders ?? merged.paymentProviders,
      banners: layer.banners ?? merged.banners,
      sliders: layer.sliders ?? merged.sliders,
      campaigns: layer.campaigns ?? merged.campaigns,
      featuredProducts: layer.featuredProducts ?? merged.featuredProducts,
      menuItems: layer.menuItems ?? merged.menuItems,
      footerLinks: layer.footerLinks ?? merged.footerLinks,
      staticPages: layer.staticPages ?? merged.staticPages,
      storefrontFeatures: {
        ...merged.storefrontFeatures,
        ...(layer.storefrontFeatures || {}),
      },
      searchSuggestions: layer.searchSuggestions ?? merged.searchSuggestions,
      lookbookScenes: layer.lookbookScenes ?? merged.lookbookScenes,
      freeShippingThreshold: layer.freeShippingThreshold ?? merged.freeShippingThreshold,
      askExpertEmail: layer.askExpertEmail ?? merged.askExpertEmail,
      gdprCookieText: layer.gdprCookieText ?? merged.gdprCookieText,
      catalogFirmNr: layer.catalogFirmNr ?? merged.catalogFirmNr,
      socialLinks: layer.socialLinks ?? merged.socialLinks,
      contactInfo: { ...merged.contactInfo, ...(layer.contactInfo || {}) },
      newsletter: { ...merged.newsletter, ...(layer.newsletter || {}) },
      beforeYouLeave: { ...merged.beforeYouLeave, ...(layer.beforeYouLeave || {}) },
      recentSales: { ...merged.recentSales, ...(layer.recentSales || {}) },
      themeBranding: { ...merged.themeBranding, ...(layer.themeBranding || {}) },
      layout: { ...merged.layout, ...(layer.layout || {}) },
      homepageSections: layer.homepageSections ?? merged.homepageSections,
      seoDescription: layer.seoDescription ?? merged.seoDescription,
      faviconUrl: layer.faviconUrl ?? merged.faviconUrl,
    };
  }
  if (!merged.storefrontFeatures) {
    merged.storefrontFeatures = { ...DEFAULT_STOREFRONT_FEATURES };
  }
  return merged;
}

export function storefrontConfigToSettings(
  raw: Record<string, unknown>,
): EticaretSettings {
  const providers = Array.isArray(raw.providers) ? raw.providers : [];
  const paymentProviders = (raw.paymentProviders as PaymentProviderConfig[] | undefined) ?? undefined;
  return mergeEticaretSettings({
    activeThemeId: String(raw.activeThemeId || 'ella'),
    activeVariantId: String(raw.activeVariantId || 'ella-classic'),
    demoMode: Boolean(raw.demoMode),
    demoTenantCode: String(raw.demoTenantCode || ''),
    storeTitle: String(raw.storeTitle || ''),
    announcementText: String(raw.announcementText || ''),
    enabled: raw.enabled !== false,
    defaultPaymentProvider: raw.defaultPaymentProvider as EticaretSettings['defaultPaymentProvider'],
    paymentProviders,
    banners: raw.banners as EticaretSettings['banners'],
    sliders: raw.sliders as EticaretSettings['sliders'],
    campaigns: raw.campaigns as EticaretSettings['campaigns'],
    featuredProducts: raw.featuredProducts as EticaretSettings['featuredProducts'],
    menuItems: raw.menuItems as EticaretSettings['menuItems'],
    footerLinks: raw.footerLinks as EticaretSettings['footerLinks'],
    staticPages: raw.staticPages as EticaretSettings['staticPages'],
    logoUrl: raw.logoUrl ? String(raw.logoUrl) : undefined,
    seoTitle: raw.seoTitle ? String(raw.seoTitle) : undefined,
    productSectionTitle: raw.productSectionTitle ? String(raw.productSectionTitle) : undefined,
    footerCopyright: raw.footerCopyright ? String(raw.footerCopyright) : undefined,
    storefrontFeatures: raw.storefrontFeatures as EticaretSettings['storefrontFeatures'],
    freeShippingThreshold: raw.freeShippingThreshold != null ? Number(raw.freeShippingThreshold) : undefined,
    searchSuggestions: raw.searchSuggestions as string[] | undefined,
    lookbookScenes: raw.lookbookScenes as EticaretSettings['lookbookScenes'],
    askExpertEmail: raw.askExpertEmail ? String(raw.askExpertEmail) : undefined,
    gdprCookieText: raw.gdprCookieText ? String(raw.gdprCookieText) : undefined,
    catalogFirmNr: raw.catalogFirmNr ? String(raw.catalogFirmNr).trim() : undefined,
    socialLinks: raw.socialLinks as EticaretSettings['socialLinks'],
    contactInfo: raw.contactInfo as EticaretSettings['contactInfo'],
    newsletter: raw.newsletter as EticaretSettings['newsletter'],
    beforeYouLeave: raw.beforeYouLeave as EticaretSettings['beforeYouLeave'],
    recentSales: raw.recentSales as EticaretSettings['recentSales'],
    themeBranding: raw.themeBranding as EticaretSettings['themeBranding'],
    layout: raw.layout as EticaretSettings['layout'],
    homepageSections: raw.homepageSections as EticaretSettings['homepageSections'],
    seoDescription: raw.seoDescription ? String(raw.seoDescription) : undefined,
    faviconUrl: raw.faviconUrl ? String(raw.faviconUrl) : undefined,
  });
}
