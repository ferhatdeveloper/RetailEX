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
