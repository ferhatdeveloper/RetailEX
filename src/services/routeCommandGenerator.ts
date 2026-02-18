import { staticMenuSections } from '../config/staticMenuConfig';
import { CommandDefinition, SupportedLanguage } from '../config/voiceCommandDefinitions';

/**
 * Identify all available routes from the app menu
 */
export interface RouteDefinition {
    id: string;
    screen: string;
    label: string; // Initially Turkish
    path: string;
    keywords: Record<SupportedLanguage, string[]>;
}

/**
 * Flatten the menu tree into a list of routes
 */
function flattenMenu(): RouteDefinition[] {
    const routes: RouteDefinition[] = [];

    staticMenuSections.forEach(section => {
        section.items.forEach(item => {
            processMenuItem(item, routes);
        });
    });

    return routes;
}

// Translation map for common menu items
const MENU_TRANSLATIONS: Record<string, { ar: string; ckb: string }> = {
    // POS & Sales
    'Satış Ekranı': { ar: 'Xalla-y Frotin', ckb: 'Xalla-y Frotin' }, // Phonetic/Common
    'Satış Faturası': { ar: 'Fatûra Frotin', ckb: 'Fatûra Frotin' },
    'Hızlı Satış': { ar: 'Frotina Lezgin', ckb: 'Frotina Lezgin' },
    'İade Faturası': { ar: 'Fatûra Vegerandin', ckb: 'Fatûra Vegerandin' },

    // Purchase
    'Alış Faturası': { ar: 'Fatûra Kirîn', ckb: 'Fatûra Kirîn' },
    'Tedarikçiler': { ar: 'Dabînker', ckb: 'Dabînker' },

    // Inventory
    'Stok Kartları': { ar: 'Kartên Stokê', ckb: 'Kartên Stokê' },
    'Ürün Listesi': { ar: 'Lîsteya Hilberan', ckb: 'Lîsteya Hilberan' },
    'Stok Sayım': { ar: 'Hejartina Stokê', ckb: 'Hejartina Stokê' },

    // Cash & Finance
    'Kasa İşlemleri': { ar: 'Markaz', ckb: 'Markaz' }, // Often called Markaz locally
    'Cari Hesaplar': { ar: 'Hesabên Carî', ckb: 'Hesabên Carî' },
    'Mizan Raporu': { ar: 'Mîzan', ckb: 'Mîzan' },

    // System
    'Ayarlar': { ar: 'Mîheng', ckb: 'Mîheng' },
    'Kullanıcılar': { ar: 'Bikarhêner', ckb: 'Bikarhêner' },
    'Raporlar': { ar: 'Rapor', ckb: 'Rapor' }
};

function processMenuItem(item: any, routes: RouteDefinition[]) {
    if (!item || !item.label) return;

    // Generate keywords based on label and screen ID
    const trKeywords = [item.label.toLowerCase(), item.label.toLowerCase() + ' aç', 'aç ' + item.label.toLowerCase()];

    // Attempt to generate English from screen ID (e.g., "sales-invoice" -> "sales invoice")
    const enLabel = item.screen.replace(/-/g, ' ');
    const enKeywords = [enLabel, 'open ' + enLabel, 'show ' + enLabel];

    // AR/CKB Translations
    let arKeywords = [item.label.toLowerCase()]; // Fallback
    let ckbKeywords = [item.label.toLowerCase()]; // Fallback

    const translation = MENU_TRANSLATIONS[item.label];
    if (translation) {
        arKeywords = [translation.ar.toLowerCase(), 'fatah ' + translation.ar.toLowerCase()];
        ckbKeywords = [translation.ckb.toLowerCase(), 'krdnawa ' + translation.ckb.toLowerCase()];
    }

    routes.push({
        id: item.screen,
        screen: item.screen,
        label: item.label,
        path: '/' + item.screen, // Assuming simple mapping
        keywords: {
            tr: trKeywords,
            en: enKeywords,
            ar: arKeywords,
            ckb: ckbKeywords
        }
    });

    if (item.children) {
        item.children.forEach((child: any) => processMenuItem(child, routes));
    }
}

/**
 * Generate CommandDefinitions for all routes
 */
export function generateRouteCommands(): CommandDefinition[] {
    const routes = flattenMenu();

    return routes.map(route => ({
        intent: 'nav_' + route.screen.replace(/-/g, '_'),
        category: 'navigation',
        examples: {
            tr: route.keywords.tr,
            en: route.keywords.en,
            ar: route.keywords.ar,
            ckb: route.keywords.ckb
        },
        description: {
            tr: `${route.label} ekranını açar`,
            en: `Opens the ${route.screen} screen`,
            ar: `يفتح شاشة ${route.label}`,
            ckb: `شاشەی ${route.label} دەکاتەوە`
        },
        // Custom property to link back to the route (not in strict CommandDefinition yet, but useful)
        _route: route.path
    } as any)); // Type cast to allow custom property or extend interface
}

/**
 * Global list of dynamic route commands
 */
export const DYNAMIC_ROUTE_COMMANDS = generateRouteCommands();

/**
 * Find a route command by fuzzy matching user input
 */
export function findRouteCommand(transcript: string, language: SupportedLanguage): CommandDefinition | undefined {
    const lower = transcript.toLowerCase();

    // Simple inclusion check
    return DYNAMIC_ROUTE_COMMANDS.find(cmd =>
        cmd.examples[language].some(ex => lower.includes(ex.toLowerCase()))
    );
}

