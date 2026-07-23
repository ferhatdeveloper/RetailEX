/**
 * Asin (RetailEX) — tek kaynak Ant Design tema paketi (flat UI, teal accent).
 * Tüm uygulama AppRouter üzerindeki ConfigProvider ile bu temayı alır;
 * modül içinde ayrı ConfigProvider yine de token birleştirmek için kullanılabilir.
 */
import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd/es/config-provider/context';

/** Uygulama birincil rengi — butonlar, linkler, odak halkaları (Asin accent teal) */
export const RETAILEX_PRIMARY = '#1FA8A0';

/** Sayfa / layout arka planı (antd Layout + liste sayfaları) — Asin surface */
export const RETAILEX_PAGE_BG = '#F3F5F7';

/** İnce kenarlık (kart üst çizgileri, bölücüler) */
export const RETAILEX_BORDER_SUBTLE = '#f0f0f0';

/** Ana metin */
export const RETAILEX_TEXT_PRIMARY = '#262626';

export const RETAILEX_BORDER_CARD = '#d9d9d9';

/** Köşe yarıçapı (px) — tüm antd bileşenleri */
export const RETAILEX_RADIUS = 6;

const lightComponents: ThemeConfig['components'] = {
    Table: {
        headerBg: '#fafafa',
        headerColor: RETAILEX_TEXT_PRIMARY,
        rowHoverBg: '#fafafa',
        borderColor: RETAILEX_BORDER_SUBTLE,
    },
    Card: {
        colorBorderSecondary: RETAILEX_BORDER_CARD,
    },
    Layout: {
        bodyBg: RETAILEX_PAGE_BG,
    },
    Tabs: {
        horizontalMargin: '0',
    },
    Modal: {
        borderRadiusLG: RETAILEX_RADIUS,
    },
};

/**
 * Açık/koyu moda göre Ant Design tema yapılandırması.
 */
export function getRetailexAntdTheme(darkMode: boolean, colorPrimary?: string): ThemeConfig {
    const primary = colorPrimary ?? RETAILEX_PRIMARY;

    if (darkMode) {
        return {
            algorithm: antdTheme.darkAlgorithm,
            token: {
                borderRadius: RETAILEX_RADIUS,
                colorPrimary: primary,
            },
            components: {
                Tabs: { horizontalMargin: '0' },
                Modal: { borderRadiusLG: RETAILEX_RADIUS },
            },
        };
    }

    return {
        token: {
            borderRadius: RETAILEX_RADIUS,
            colorPrimary: primary,
            colorBorderSecondary: RETAILEX_BORDER_SUBTLE,
            colorBgLayout: RETAILEX_PAGE_BG,
            colorText: RETAILEX_TEXT_PRIMARY,
        },
        components: lightComponents,
    };
}

/**
 * Varsayılan Ant Design tema yapılandırması (açık mod).
 */
export const retailexAntdTheme: ThemeConfig = getRetailexAntdTheme(false);

/**
 * Raporlar gibi modül-özel birincil renk gerektiğinde taban temanın üzerine yazar.
 */
export function retailexAntdThemeWithPrimary(colorPrimary: string, darkMode = false): ThemeConfig {
    return getRetailexAntdTheme(darkMode, colorPrimary);
}
