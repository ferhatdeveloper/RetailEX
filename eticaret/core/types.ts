export type EticaretTenantSource = 'subdomain' | 'path' | 'demo' | 'settings' | 'default';

export type ResolvedEticaretTenant = {
  tenantCode: string;
  source: EticaretTenantSource;
  displayName?: string;
};

export type EticaretSettings = {
  activeThemeId: string;
  activeVariantId: string;
  demoMode: boolean;
  demoTenantCode: string;
  storeTitle: string;
  announcementText: string;
  enabled: boolean;
  paymentProviders?: import('./payments/types').PaymentProviderConfig[];
  defaultPaymentProvider?: import('./payments/types').PaymentProviderId;
  storefrontPath?: string;
  banners?: import('./contentTypes').EticaretBanner[];
  sliders?: import('./contentTypes').EticaretSliderSlide[];
  campaigns?: import('./contentTypes').EticaretCampaign[];
  featuredProducts?: import('./contentTypes').EticaretFeaturedProduct[];
  menuItems?: import('./contentTypes').EticaretMenuItem[];
  footerLinks?: import('./contentTypes').EticaretFooterLink[];
  staticPages?: import('./contentTypes').EticaretStaticPage[];
  logoUrl?: string;
  seoTitle?: string;
  productSectionTitle?: string;
  footerCopyright?: string;
  storefrontFeatures?: import('./contentTypes').EticaretStorefrontFeatures;
  /** Ücretsiz kargo eşiği (para birimi tutarı) */
  freeShippingThreshold?: number;
  searchSuggestions?: string[];
  lookbookScenes?: import('./contentTypes').EticaretLookbookScene[];
  askExpertEmail?: string;
  gdprCookieText?: string;
  /** Online vitrinde ürün/sipariş için kullanılacak firma no (boşsa system_settings.primary_firm_nr) */
  catalogFirmNr?: string;
  socialLinks?: import('./contentTypes').EticaretSocialLink[];
  contactInfo?: import('./contentTypes').EticaretContactInfo;
  newsletter?: import('./contentTypes').EticaretNewsletterConfig;
  beforeYouLeave?: import('./contentTypes').EticaretBeforeYouLeaveConfig;
  recentSales?: import('./contentTypes').EticaretRecentSalesConfig;
  themeBranding?: import('./contentTypes').EticaretThemeBranding;
  layout?: import('./contentTypes').EticaretLayoutSettings;
  homepageSections?: import('./contentTypes').EticaretHomepageSection[];
  seoDescription?: string;
  faviconUrl?: string;
};

export type EticaretWebOrder = {
  id: string;
  tenant_code: string;
  order_no: string;
  status: string;
  demo_mode: boolean;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  payment_provider?: string;
  payment_status: string;
  currency: string;
  subtotal: number;
  total: number;
  items: unknown[];
  sales_fiche_id?: string;
  sales_fiche_no?: string;
  created_at: string;
};

export type EticaretThemeVariant = {
  id: string;
  themeId: string;
  name: string;
  description: string;
  skinClass: string;
  demoCss: string[];
  extraCss?: string[];
  homeHtml: string;
  previewImage: string;
};

export type EticaretThemeDefinition = {
  id: string;
  name: string;
  description: string;
  vendor: string;
  variants: EticaretThemeVariant[];
};

export type StorefrontProduct = {
  id: string;
  code: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  imageUrl?: string;
  hoverImageUrl?: string;
  vendor?: string;
  badge?: string;
  inStock: boolean;
};

/** merkez_db.tenant_registry.eticaret_settings ile uyumlu */
export type TenantEticaretRegistrySettings = Partial<EticaretSettings>;
