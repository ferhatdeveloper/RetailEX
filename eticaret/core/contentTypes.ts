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

/** Alt menü / mega menü bağlantısı */
export type EticaretMenuLink = {
  id: string;
  label: string;
  type: 'internal' | 'external' | 'page';
  path?: string;
  pageSlug?: string;
  url?: string;
  enabled: boolean;
  sortOrder: number;
};

/** Mega menü sütunu (Ella megamenu_style_2) */
export type EticaretMegaMenuColumn = {
  id: string;
  title: string;
  links: EticaretMenuLink[];
  sortOrder: number;
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
  /** simple: tek link; dropdown: alt menü; mega: çok sütunlu mega menü */
  menuStyle?: 'simple' | 'dropdown' | 'mega';
  badge?: string;
  badgeStyle?: 'new' | 'hot' | 'sale';
  children?: EticaretMenuLink[];
  megaColumns?: EticaretMegaMenuColumn[];
  megaLayout?: 'style_2' | 'style_3';
};

/** Ella tema özellikleri — vitrinde aç/kapa */
export type EticaretStorefrontFeatures = {
  megaMenu: boolean;
  quickShop: boolean;
  instantSearch: boolean;
  sideCart: boolean;
  mobileToolbar: boolean;
  gdprCookie: boolean;
  askExpert: boolean;
  recentSalesPopup: boolean;
  newsletterPopup: boolean;
  beforeYouLeave: boolean;
  lookbook: boolean;
  shippingThreshold: boolean;
  quickView: boolean;
  stickyHeader: boolean;
};

export const DEFAULT_STOREFRONT_FEATURES: EticaretStorefrontFeatures = {
  megaMenu: true,
  quickShop: true,
  instantSearch: true,
  sideCart: true,
  mobileToolbar: true,
  gdprCookie: true,
  askExpert: false,
  recentSalesPopup: false,
  newsletterPopup: false,
  beforeYouLeave: false,
  lookbook: true,
  shippingThreshold: true,
  quickView: true,
  stickyHeader: true,
};

export type EticaretFooterLink = {
  id: string;
  label: string;
  url: string;
  column: 'shop' | 'info' | 'legal';
  enabled: boolean;
  sortOrder: number;
};

/** Lookbook sahne — görsel üzerinde ürün hotspot */
export type EticaretLookbookHotspot = {
  id: string;
  productCode: string;
  topPercent: number;
  leftPercent: number;
  popupTopPercent?: number;
  popupLeftPercent?: number;
  enabled: boolean;
};

export type EticaretLookbookScene = {
  id: string;
  title?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  hotspots: EticaretLookbookHotspot[];
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

export type EticaretSocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'youtube'
  | 'tiktok'
  | 'whatsapp'
  | 'linkedin'
  | 'other';

export type EticaretSocialLink = {
  id: string;
  platform: EticaretSocialPlatform;
  label?: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
};

export type EticaretContactInfo = {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
  whatsapp?: string;
};

export type EticaretNewsletterConfig = {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  delayMs?: number;
  buttonText?: string;
  footerTitle?: string;
  footerSubtitle?: string;
};

export type EticaretBeforeYouLeaveConfig = {
  title?: string;
  body?: string;
  couponCode?: string;
  buttonText?: string;
  imageUrl?: string;
};

export type EticaretRecentSalesConfig = {
  delayMs?: number;
  messageTemplate?: string;
};

export type EticaretThemeBranding = {
  primaryColor?: string;
  accentColor?: string;
  customCss?: string;
};

export type EticaretLayoutSettings = {
  catalogLimit?: number;
  productGridColumns?: 2 | 3 | 4;
  categoryLayoutId?: string;
  productLayoutId?: string;
};

export type EticaretHomepageSectionType =
  | 'slider'
  | 'hero_banner'
  | 'strip_banners'
  | 'campaign_promo'
  | 'products'
  | 'lookbook_teaser'
  | 'custom_html';

export type EticaretHomepageSection = {
  id: string;
  type: EticaretHomepageSectionType;
  enabled: boolean;
  sortOrder: number;
  title?: string;
  customHtml?: string;
};

export type EticaretContentSettings = {
  banners: EticaretBanner[];
  sliders: EticaretSliderSlide[];
  campaigns: EticaretCampaign[];
  featuredProducts: EticaretFeaturedProduct[];
  menuItems: EticaretMenuItem[];
  footerLinks: EticaretFooterLink[];
  staticPages: EticaretStaticPage[];
  lookbookScenes: EticaretLookbookScene[];
  socialLinks?: EticaretSocialLink[];
  contactInfo?: EticaretContactInfo;
  newsletter?: EticaretNewsletterConfig;
  beforeYouLeave?: EticaretBeforeYouLeaveConfig;
  recentSales?: EticaretRecentSalesConfig;
  themeBranding?: EticaretThemeBranding;
  layout?: EticaretLayoutSettings;
  homepageSections?: EticaretHomepageSection[];
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

export const DEFAULT_HOMEPAGE_SECTIONS: EticaretHomepageSection[] = [
  { id: 'hp_slider', type: 'slider', enabled: true, sortOrder: 0 },
  { id: 'hp_hero', type: 'hero_banner', enabled: true, sortOrder: 1 },
  { id: 'hp_strips', type: 'strip_banners', enabled: true, sortOrder: 2 },
  { id: 'hp_campaigns', type: 'campaign_promo', enabled: true, sortOrder: 3 },
  { id: 'hp_products', type: 'products', enabled: true, sortOrder: 4 },
  { id: 'hp_custom', type: 'custom_html', enabled: false, sortOrder: 5, title: 'Özel HTML', customHtml: '' },
];

export const DEFAULT_ETICARET_CONTENT: EticaretContentSettings = {
  banners: [],
  sliders: [],
  campaigns: [],
  featuredProducts: [],
  menuItems: DEFAULT_STOREFRONT_MENU,
  footerLinks: DEFAULT_FOOTER_LINKS,
  staticPages: DEFAULT_STATIC_PAGES,
  lookbookScenes: [],
  socialLinks: [],
  contactInfo: {},
  newsletter: {},
  beforeYouLeave: {},
  recentSales: { delayMs: 8000, messageTemplate: '{customer} az önce satın aldı' },
  themeBranding: {},
  layout: { catalogLimit: 24, productGridColumns: 4, categoryLayoutId: 'category-right-sidebar', productLayoutId: 'product-layout-default' },
  homepageSections: DEFAULT_HOMEPAGE_SECTIONS,
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
