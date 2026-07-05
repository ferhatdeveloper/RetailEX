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

/** Vitrin üst menü satırı */
export type EticaretMenuItem = {
  id: string;
  label: string;
  /** internal: /magaza/{tenant}/{path} */
  type: 'internal' | 'external' | 'page';
  path?: string;
  pageSlug?: string;
  url?: string;
  enabled: boolean;
  sortOrder: number;
  openInNewTab?: boolean;
};

export type EticaretFooterLink = {
  id: string;
  label: string;
  url: string;
  column: 'shop' | 'info' | 'legal';
  enabled: boolean;
  sortOrder: number;
};

/** CMS sayfa — slug ile vitrinde gösterilir */
export type EticaretStaticPage = {
  id: string;
  slug: string;
  title: string;
  bodyHtml: string;
  enabled: boolean;
  sortOrder: number;
  showInMenu: boolean;
};

export type EticaretContentSettings = {
  banners: EticaretBanner[];
  sliders: EticaretSliderSlide[];
  campaigns: EticaretCampaign[];
  featuredProducts: EticaretFeaturedProduct[];
  menuItems: EticaretMenuItem[];
  footerLinks: EticaretFooterLink[];
  staticPages: EticaretStaticPage[];
};

export const DEFAULT_STOREFRONT_MENU: EticaretMenuItem[] = [
  { id: 'home', label: 'Ana Sayfa', type: 'internal', path: '', enabled: true, sortOrder: 0 },
  { id: 'products', label: 'Ürünler', type: 'internal', path: 'kategori', enabled: true, sortOrder: 1 },
  { id: 'cart', label: 'Sepet', type: 'internal', path: 'sepet', enabled: true, sortOrder: 2 },
  { id: 'checkout', label: 'Ödeme', type: 'internal', path: 'odeme', enabled: false, sortOrder: 3 },
  { id: 'contact', label: 'İletişim', type: 'page', pageSlug: 'iletisim', enabled: true, sortOrder: 4 },
];

export const DEFAULT_FOOTER_LINKS: EticaretFooterLink[] = [
  { id: 'about', label: 'Hakkımızda', url: '/sayfa/hakkimizda', column: 'info', enabled: true, sortOrder: 0 },
  { id: 'contact', label: 'İletişim', url: '/sayfa/iletisim', column: 'info', enabled: true, sortOrder: 1 },
  { id: 'privacy', label: 'Gizlilik', url: '/sayfa/gizlilik', column: 'legal', enabled: true, sortOrder: 0 },
];

export const DEFAULT_STATIC_PAGES: EticaretStaticPage[] = [
  {
    id: 'page_about',
    slug: 'hakkimizda',
    title: 'Hakkımızda',
    bodyHtml: '<p>Online mağazamıza hoş geldiniz.</p>',
    enabled: true,
    sortOrder: 0,
    showInMenu: false,
  },
  {
    id: 'page_contact',
    slug: 'iletisim',
    title: 'İletişim',
    bodyHtml: '<p>Bize ulaşın.</p>',
    enabled: true,
    sortOrder: 1,
    showInMenu: true,
  },
];

export const DEFAULT_ETICARET_CONTENT: EticaretContentSettings = {
  banners: [],
  sliders: [],
  campaigns: [],
  featuredProducts: [],
  menuItems: DEFAULT_STOREFRONT_MENU,
  footerLinks: DEFAULT_FOOTER_LINKS,
  staticPages: DEFAULT_STATIC_PAGES,
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
