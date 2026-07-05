/** Vitrin içerik yönetimi — eticaret_settings JSONB içinde saklanır */

export type EticaretBanner = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
  buttonText?: string;
  /** hero: tam genişlik üst banner; strip: alt şerit kartları */
  placement: 'hero' | 'strip';
  enabled: boolean;
  sortOrder: number;
  textColor?: string;
};

export type EticaretSliderSlide = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
  buttonText?: string;
  enabled: boolean;
  sortOrder: number;
};

export type EticaretCampaign = {
  id: string;
  name: string;
  badge?: string;
  discountPercent?: number;
  startDate?: string;
  endDate?: string;
  enabled: boolean;
  productCodes: string[];
  bannerImageUrl?: string;
  linkUrl?: string;
  description?: string;
};

export type EticaretFeaturedProduct = {
  id: string;
  productCode: string;
  productName?: string;
  badge?: string;
  sortOrder: number;
  enabled: boolean;
};

export type EticaretContentSettings = {
  banners: EticaretBanner[];
  sliders: EticaretSliderSlide[];
  campaigns: EticaretCampaign[];
  featuredProducts: EticaretFeaturedProduct[];
};

export const DEFAULT_ETICARET_CONTENT: EticaretContentSettings = {
  banners: [],
  sliders: [],
  campaigns: [],
  featuredProducts: [],
};

export function createContentId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}

export function sortByOrder<T extends { sortOrder: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder);
}
