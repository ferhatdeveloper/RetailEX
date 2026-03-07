import { postgres } from '../postgres';
import * as LucideIcons from 'lucide-react';

export interface DBMenuItem {
    id: number;
    menu_type: string;
    title: string | null;
    label: string;
    label_tr: string | null;
    label_en: string | null;
    label_ar: string | null;
    parent_id: number | null;
    screen_id: string | null;
    icon_name: string | null;
    badge: string | null;
    display_order: number;
}

export interface MenuSection {
    title: string;
    items: MenuItem[];
}

export interface MenuItem {
    id: string;
    label: string;
    screen: string;
    icon: any;
    badge: string | null;
    children?: MenuItem[];
}

/**
 * Get Lucide icon component by name
 */
export const getIconByName = (name: string | null) => {
    if (!name) return LucideIcons.HelpCircle;
    const icon = (LucideIcons as any)[name];
    return icon || LucideIcons.HelpCircle;
};

export const menuService = {
    /**
     * Fetch all active menu items and build the hierarchical structure
     */
    async getMenuStructure(): Promise<MenuSection[]> {
        try {
            const { rows } = await postgres.query<DBMenuItem>(
                `SELECT * FROM public.menu_items 
                 WHERE is_active = true 
                 ORDER BY display_order ASC`
            );

            if (!rows || rows.length === 0) {
                console.warn('No menu items found in database');
                return [];
            }

            const itemMap = new Map<number, any>();
            const sections: MenuSection[] = [];

            // 1. First pass: Create all frontend items and identify sections
            rows.forEach(row => {
                const frontendItem: MenuItem = {
                    id: row.screen_id || row.id.toString(),
                    label: row.label_tr || row.label,
                    screen: row.screen_id || '',
                    icon: getIconByName(row.icon_name),
                    badge: row.badge,
                    children: []
                };

                itemMap.set(row.id, {
                    ...row,
                    frontendItem
                });

                if (row.parent_id === null) {
                    sections.push({
                        title: row.label_tr || row.label,
                        items: []
                    });
                }
            });

            // 2. Second pass: Build hierarchy
            rows.forEach(row => {
                if (row.parent_id !== null) {
                    const currentData = itemMap.get(row.id)!;
                    const parentData = itemMap.get(row.parent_id);

                    if (parentData) {
                        if (parentData.parent_id === null) {
                            // Parent is a section, add to section's items
                            const sectionTitle = parentData.label_tr || parentData.label;
                            const section = sections.find(s => s.title === sectionTitle);
                            if (section) {
                                section.items.push(currentData.frontendItem);
                            }
                        } else {
                            // Parent is a menu item, add to its children
                            if (parentData.frontendItem) {
                                parentData.frontendItem.children.push(currentData.frontendItem);
                            }
                        }
                    }
                }
            });

            return sections.filter(s => s.items.length > 0);
        } catch (error) {
            console.error('Failed to fetch menu structure:', error);
            return [];
        }
    }
};

