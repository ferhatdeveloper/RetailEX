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
