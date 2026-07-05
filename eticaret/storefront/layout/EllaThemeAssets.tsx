import { useEffect } from 'react';
import { getThemeVariant } from '../../themes/registry';
import { loadEticaretSettings } from '../../core/settings';
import type { EticaretSettings } from '../../core/types';

const STATIC = '/eticaret-static/ella';

const BASE_STYLES = [
  `${STATIC}/lib/bootstrap/bootstrap.min.css`,
  `${STATIC}/lib/bootstrap/bootstrap-grid.min.css`,
  `${STATIC}/lib/slick-carouse/slick.min.css`,
  `${STATIC}/lib/fancybox/fancybox.css`,
  `${STATIC}/assets/sass/style.css`,
  `${STATIC}/assets/sass/base/animation/animation.css`,
  `${STATIC}/assets/sass/base/product/component-product.css`,
  `${STATIC}/assets/sass/popup/popup.css`,
  `${STATIC}/assets/sass/sidebar/sidebar.css`,
];

type Props = {
  variantId?: string;
  settings?: EticaretSettings;
};

export function EllaThemeAssets({ variantId, settings: settingsProp }: Props) {
  const activeVariantId = variantId ?? settingsProp?.activeVariantId ?? loadEticaretSettings().activeVariantId;

  useEffect(() => {
    const resolved = getThemeVariant(activeVariantId);
    const hrefs = [...BASE_STYLES, ...(resolved?.variant.demoCss ?? [])];

    const links: HTMLLinkElement[] = [];
    for (const href of hrefs) {
      if (document.querySelector(`link[data-ella-theme="${href}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-ella-theme', href);
      document.head.appendChild(link);
      links.push(link);
    }

    document.body.classList.add('template-index');
    if (resolved?.variant.skinClass) {
      document.body.classList.add(resolved.variant.skinClass);
    }

    return () => {
      for (const link of links) link.remove();
      document.body.classList.remove('template-index');
      if (resolved?.variant.skinClass) {
        document.body.classList.remove(resolved.variant.skinClass);
      }
    };
  }, [activeVariantId]);

  return null;
}
