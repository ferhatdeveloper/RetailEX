import type { EticaretThemeDefinition } from '../core/types';

const STATIC = '/eticaret-static/ella';

/** Ella HTML Template — 10 ana sayfa demosu (index … index-10). */
export const ELLA_THEME: EticaretThemeDefinition = {
  id: 'ella',
  name: 'Ella',
  description: 'HaloThemes çok amaçlı e-ticaret teması — 10 ana sayfa varyantı',
  vendor: 'HaloThemes',
  variants: [
    {
      id: 'ella-classic',
      themeId: 'ella',
      name: 'Classic',
      description: 'Klasik moda vitrin',
      skinClass: 'skin-1',
      demoCss: [`${STATIC}/assets/sass/demos/demo-1/demo-1.css`],
      homeHtml: 'index.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-1/banner-fullwith-t.jpg`,
    },
    {
      id: 'ella-fashion',
      themeId: 'ella',
      name: 'High Fashion',
      description: 'Yüksek moda düzeni',
      skinClass: 'skin-2',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-2/skin-2.css`,
        `${STATIC}/assets/sass/demos/demo-2/demo-2.css`,
        `${STATIC}/assets/sass/base/header/header-2/header-2.css`,
        `${STATIC}/assets/sass/base/footer/footer-2/footer-2.css`,
      ],
      homeHtml: 'index-2.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-2/banner-amber.gif`,
    },
    {
      id: 'ella-trendy',
      themeId: 'ella',
      name: 'Trendy',
      description: 'Trend stil',
      skinClass: 'skin-3',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-3/skin-3.css`,
        `${STATIC}/assets/sass/demos/demo-3/demo-3.css`,
      ],
      homeHtml: 'index-3.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-3/about-icon-1.jpg`,
    },
    {
      id: 'ella-beauty',
      themeId: 'ella',
      name: 'Health & Beauty',
      description: 'Kozmetik ve güzellik',
      skinClass: 'skin-4',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-4/skin-4.css`,
        `${STATIC}/assets/sass/demos/demo-4/demo-4.css`,
      ],
      homeHtml: 'index-4.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-4/banner-1.jpg`,
    },
    {
      id: 'ella-jewelry',
      themeId: 'ella',
      name: 'Jewelry',
      description: 'Mücevher vitrin',
      skinClass: 'skin-5',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-5/skin-5.css`,
        `${STATIC}/assets/sass/demos/demo-5/demo-5.css`,
      ],
      homeHtml: 'index-5.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-5/banner-1.jpg`,
    },
    {
      id: 'ella-shoes',
      themeId: 'ella',
      name: 'Shoes',
      description: 'Ayakkabı mağazası',
      skinClass: 'skin-6',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-6/skin-6.css`,
        `${STATIC}/assets/sass/demos/demo-6/demo-6.css`,
      ],
      homeHtml: 'index-6.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-6/banner-1.jpg`,
    },
    {
      id: 'ella-auto',
      themeId: 'ella',
      name: 'Automotive',
      description: 'Otomotiv ve endüstri',
      skinClass: 'skin-7',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-7/skin-7.css`,
        `${STATIC}/assets/sass/demos/demo-7/demo-7.css`,
      ],
      homeHtml: 'index-7.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-7/banner-1.jpg`,
    },
    {
      id: 'ella-pet',
      themeId: 'ella',
      name: 'Pet Supplies',
      description: 'Evcil hayvan ürünleri',
      skinClass: 'skin-8',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-8/skin-8.css`,
        `${STATIC}/assets/sass/demos/demo-8/demo-8.css`,
      ],
      homeHtml: 'index-8.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-8/banner-1.jpg`,
    },
    {
      id: 'ella-surf',
      themeId: 'ella',
      name: 'Surfing',
      description: 'Sörf ve outdoor',
      skinClass: 'skin-9',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-9/skin-9.css`,
        `${STATIC}/assets/sass/demos/demo-9/demo-9.css`,
      ],
      homeHtml: 'index-9.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-9/banner-10.jpg`,
    },
    {
      id: 'ella-electronic',
      themeId: 'ella',
      name: 'Electronic',
      description: 'Elektronik ve bilgisayar',
      skinClass: 'skin-10',
      demoCss: [
        `${STATIC}/assets/sass/skins/skin-10/skin-10.css`,
        `${STATIC}/assets/sass/demos/demo-10/demo-10.css`,
      ],
      homeHtml: 'index-10.html',
      previewImage: `${STATIC}/assets/images/banners/home/home-10/banner06.jpg`,
    },
  ],
};

export const ETICARET_THEMES: EticaretThemeDefinition[] = [ELLA_THEME];

export function getThemeById(themeId: string): EticaretThemeDefinition | undefined {
  return ETICARET_THEMES.find((t) => t.id === themeId);
}

export function getThemeVariant(variantId: string) {
  for (const theme of ETICARET_THEMES) {
    const v = theme.variants.find((x) => x.id === variantId);
    if (v) return { theme, variant: v };
  }
  return undefined;
}

export function listAllThemeVariants() {
  return ETICARET_THEMES.flatMap((theme) =>
    theme.variants.map((variant) => ({ theme, variant })),
  );
}
