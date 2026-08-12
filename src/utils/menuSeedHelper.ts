/**
 * Menü Seed Helper
 * Mevcut statik menü yapısını veritabanı formatına dönüştürür
 */

import * as LucideIcons from 'lucide-react';

export interface StaticMenuSection {
  title: string;
  items: StaticMenuItem[];
}

export interface StaticMenuItem {
  id: string;
  label: string;
  icon?: any;
  badge?: string | null;
  children?: StaticMenuItem[];
}

/**
 * Icon component'inden icon ismini çıkarır
 */
export function getIconName(iconComponent: any): string | null {
  if (!iconComponent) return null;
  
  // Lucide icon component'lerinin name property'si var
  if (iconComponent.name) {
    return iconComponent.name;
  }
  
  // String olarak verilmişse direkt döndür
  if (typeof iconComponent === 'string') {
    return iconComponent;
  }
  
  // Component displayName'den çıkar
  if (iconComponent.displayName) {
    return iconComponent.displayName;
  }
  
  // Function name'den çıkar
  if (iconComponent.name || iconComponent.constructor?.name) {
    return iconComponent.name || iconComponent.constructor.name;
  }
  
  return null;
}

/**
 * Statik menü yapısını veritabanı formatına dönüştürür
 */
export function convertStaticMenuToSeedFormat(
  staticMenuSections: StaticMenuSection[]
): any[] {
  return staticMenuSections.map((section, sectionIndex) => {
    const sectionData: any = {
      menu_type: 'section',
      title: section.title,
      label: section.title,
      id: `section_${sectionIndex}`,
      children: convertMenuItems(section.items, sectionIndex)
    };
    
    return sectionData;
  });
}

/**
 * Menü öğelerini recursive olarak dönüştürür
 */
function convertMenuItems(
  items: StaticMenuItem[],
  sectionIndex: number,
  parentId?: string
): any[] {
  return items.map((item, index) => {
    const iconName = getIconName(item.icon);
    
    const itemData: any = {
      menu_type: item.children && item.children.length > 0 ? 'main' : 'sub',
      label: item.label,
      id: item.id,
      screen_id: item.id,
      icon_name: iconName,
      badge: item.badge || null,
      children: item.children ? convertMenuItems(item.children, sectionIndex, item.id) : undefined
    };
    
    return itemData;
  });
}

/**
 * ManagementModule'den statik menü yapısını alır
 * Bu fonksiyon ManagementModule'den export edilmelidir
 */
export async function getStaticMenuFromManagementModule(): Promise<StaticMenuSection[]> {
  // Bu fonksiyon ManagementModule'den çağrılacak
  // Şimdilik boş dizi döndürüyoruz, gerçek implementasyon ManagementModule'de olacak
  return [];
}



