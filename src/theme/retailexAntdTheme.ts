/**
 * RetailEX — tek kaynak Ant Design tema paketi (flat UI, mor birincil).
 * Tüm uygulama AppRouter üzerindeki ConfigProvider ile bu temayı alır;
 * modül içinde ayrı ConfigProvider yine de token birleştirmek için kullanılabilir.
 */
import type { ThemeConfig } from 'antd/es/config-provider/context';

/** Uygulama birincil rengi — butonlar, linkler, odak halkaları */
export const RETAILEX_PRIMARY = '#722ed1';

/** Sayfa / layout arka planı (antd Layout + liste sayfaları) */
export const RETAILEX_PAGE_BG = '#f5f5f5';

/** İnce kenarlık (kart üst çizgileri, bölücüler) */
export const RETAILEX_BORDER_SUBTLE = '#f0f0f0';

/** Ana metin */
export const RETAILEX_TEXT_PRIMARY = '#262626';

export const RETAILEX_BORDER_CARD = '#d9d9d9';

/** Köşe yarıçapı (px) — tüm antd bileşenleri */
export const RETAILEX_RADIUS = 6;

/**
 * Varsayılan Ant Design tema yapılandırması.
 */
export const retailexAntdTheme: ThemeConfig = {
    token: {
        borderRadius: RETAILEX_RADIUS,
        colorPrimary: RETAILEX_PRIMARY,
        colorBorderSecondary: RETAILEX_BORDER_SUBTLE,
        colorBgLayout: RETAILEX_PAGE_BG,
        colorText: RETAILEX_TEXT_PRIMARY,
    },
    components: {
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
    },
};

/**
 * Raporlar gibi modül-özel birincil renk gerektiğinde taban temanın üzerine yazar.
 */
export function retailexAntdThemeWithPrimary(colorPrimary: string): ThemeConfig {
    return {
        ...retailexAntdTheme,
        token: {
            ...retailexAntdTheme.token,
            colorPrimary,
        },
    };
}
