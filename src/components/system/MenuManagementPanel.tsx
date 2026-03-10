import React, { useState, useEffect, useCallback } from 'react';
import {
  GripVertical, Plus, Edit2, Trash2, Save, X,
  ChevronDown, ChevronRight, Menu as MenuIcon, Settings,
  RefreshCw, Eye, EyeOff, Download
} from 'lucide-react';
import { supabase } from '../../utils/supabase/client';
import { logger } from '../../services/loggingService';

interface MenuItem {
  id: number;
  menu_type: 'section' | 'main' | 'sub';
  title?: string;
  label: string;
  label_tr?: string;
  label_en?: string;
  label_ar?: string;
  parent_id?: number;
  section_id?: number;
  screen_id?: string;
  icon_name?: string;
  badge?: string;
  display_order: number;
  is_active: boolean;
  is_visible: boolean;
  children?: MenuItem[];
}

interface MenuManagementPanelProps {
  onClose?: () => void;
}

export function MenuManagementPanel({ onClose }: MenuManagementPanelProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [draggedItem, setDraggedItem] = useState<MenuItem | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [menuSource, setMenuSource] = useState<'supabase' | 'static'>('static');
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);
  const [newItem, setNewItem] = useState<Partial<MenuItem>>({
    menu_type: 'main',
    label: '',
    display_order: 0,
    is_active: true,
    is_visible: true
  });

  // Yerel config'den hidden_modules yükle
  const loadLocalConfig = useCallback(async () => {
    try {
      // @ts-ignore
      const { invoke } = await import('@tauri-apps/api/core');
      const config: any = await invoke('get_app_config');
      if (config && Array.isArray(config.hidden_modules)) {
        setHiddenModules(config.hidden_modules);
      }
    } catch (err) {
      console.warn('Tauri config yüklenemedi (Web ortamı olabilir):', err);
    }
  }, []);

  // Menü öğelerini yükle
  const loadMenuItems = useCallback(async () => {
    try {
      setLoading(true);
      await loadLocalConfig();

      if (menuSource === 'static') {
        const staticData = await fetchStaticMenuStructure();
        // Statik menüyü MenuItem formatına dönüştür
        const convertStaticToMenuItem = (item: any, idCounter: { val: number }, parentId?: number, sectionId?: number): MenuItem => {
          const currentId = idCounter.val++;
          const screenId = item.screen_id || item.screen || `static_${currentId}`;

          return {
            id: currentId,
            menu_type: item.menu_type || (parentId ? 'main' : 'section'),
            label: item.label || item.title || 'İsimsiz',
            label_tr: item.label_tr || item.label || item.title,
            label_en: item.label_en,
            label_ar: item.label_ar,
            screen_id: screenId as string,
            parent_id: parentId,
            section_id: sectionId,
            is_active: true,
            is_visible: !hiddenModules.includes(screenId as string),
            display_order: item.display_order || 0,
            icon_name: item.icon_name || (typeof item.icon === 'string' ? item.icon : null),
            children: item.items ? item.items.map((c: any) => convertStaticToMenuItem(c, idCounter, currentId, sectionId || currentId)) :
              item.children ? item.children.map((c: any) => convertStaticToMenuItem(c, idCounter, currentId, sectionId || currentId)) : []
          };
        };

        const idCounter = { val: 10000 };
        const tree = (Array.isArray(staticData) ? staticData : []).map(section => convertStaticToMenuItem(section, idCounter));
        setMenuItems(tree);

        const sectionIds = tree.map(t => t.id);
        setExpandedSections(new Set(sectionIds));
        setLoading(false);
        return;
      }

      // Supabase'den tüm menü öğelerini çek
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Supabase menü yükleme hatası:', error);
        setMenuItems([]);
        return;
      }

      if (!data || data.length === 0) {
        setMenuItems([]);
        return;
      }

      const tree = buildMenuTree(data);
      setMenuItems(tree);

      const sectionIds = data
        .filter((item: MenuItem) => item.menu_type === 'section')
        .map((item: MenuItem) => item.id);
      setExpandedSections(new Set(sectionIds));
    } catch (error: any) {
      console.error('Menü yüklenirken hata:', error);
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  }, [menuSource, hiddenModules, loadLocalConfig]);

  // Mevcut statik menü yapısını veritabanına aktar
  const seedCurrentMenu = async () => {
    if (!confirm('Mevcut menü yapısını veritabanına aktarmak istediğinizden emin misiniz? Bu işlem mevcut menü öğelerini silebilir.')) {
      return;
    }

    try {
      setSaving(true);
      // ManagementModule'den statik menü yapısını al
      const staticMenuSections = await fetchStaticMenuStructure();

      if (!staticMenuSections || staticMenuSections.length === 0) {
        alert('Statik menü yapısı alınamadı. Lütfen sayfayı yenileyin ve tekrar deneyin.');
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout

      let response;
      try {
        response = await fetch(`${apiUrl}/api/v1/menu/seed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(staticMenuSections),
          signal: controller.signal
        });
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Backend yanıt vermiyor. Backend\'in çalıştığından emin olun.');
        }
        if (error.message?.includes('ERR_CONNECTION_REFUSED') || error.message?.includes('Failed to fetch')) {
          throw new Error('Backend bağlantı hatası. Backend\'i başlatmak için:\n\nWindows: BASLAT_BACKEND.bat\nLinux/Mac: ./BASLAT_BACKEND.sh\n\nBackend çalıştıktan sonra tekrar deneyin.');
        }
        throw error;
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend hatası: ${response.status} - ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const result = await response.json();

        if (result.success) {
          alert(`Başarılı! ${result.count} menü öğesi oluşturuldu.`);
          await loadMenuItems();
        } else {
          alert(result.message || 'Menü yapısı aktarılırken hata oluştu!');
        }
      } else {
        throw new Error('Backend JSON döndürmedi. Backend çalışıyor mu?');
      }
    } catch (error: any) {
      logger.crudError('MenuManagement', 'seedMenu', error);
      const errorMessage = error.message || 'Bilinmeyen hata';
      alert(`Menü yapısı aktarılırken hata oluştu:\n\n${errorMessage}\n\nBackend'i başlatmak için:\n\nWindows: BASLAT_BACKEND.bat dosyasını çalıştırın\nLinux/Mac: ./BASLAT_BACKEND.sh komutunu çalıştırın\n\nBackend çalıştıktan sonra tekrar deneyin.`);
    } finally {
      setSaving(false);
    }
  };

  // Statik menü yapısını al (ManagementModule'den)
  const fetchStaticMenuStructure = async (): Promise<any[]> => {
    try {
      // ManagementModule'den statik menü yapısını almak için bir event gönder
      return new Promise((resolve) => {
        const handler = (e: CustomEvent) => {
          window.removeEventListener('staticMenuRequested', handler as EventListener);
          resolve(e.detail || []);
        };
        window.addEventListener('staticMenuRequested', handler as EventListener);

        // ManagementModule'e istek gönder
        window.dispatchEvent(new CustomEvent('requestStaticMenu'));

        // Timeout - eğer 2 saniye içinde cevap gelmezse boş dizi döndür
        setTimeout(() => {
          window.removeEventListener('staticMenuRequested', handler as EventListener);
          resolve([]);
        }, 2000);
      });
    } catch (error) {
      console.error('Statik menü yapısı alınırken hata:', error);
      return [];
    }
  };

  // Faturalar menüsünü geri ekle
  const restoreFaturalarMenu = async () => {
    if (!confirm('Faturalar menüsünü ve tüm alt menülerini geri eklemek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      setSaving(true);

      // Önce faturalar section'ının var olup olmadığını kontrol et
      const { data: existingSection } = await supabase
        .from('menu_items')
        .select('id')
        .eq('title', 'Faturalar')
        .eq('menu_type', 'section')
        .single();

      let sectionId: number;

      if (existingSection) {
        sectionId = existingSection.id;
      } else {
        // Faturalar section'ını oluştur
        const { data: newSection, error: sectionError } = await supabase
          .from('menu_items')
          .insert({
            menu_type: 'section',
            title: 'Faturalar',
            label: 'Faturalar',
            label_tr: 'Faturalar',
            label_en: 'Invoices',
            label_ar: 'الفواتير',
            display_order: 1,
            is_active: true,
            is_visible: true
          })
          .select()
          .single();

        if (sectionError) throw sectionError;
        sectionId = newSection.id;
      }

      // Ana menü öğelerini ekle
      const mainItems = [
        { screen_id: 'salesinvoice', label: 'Satış Faturaları', label_en: 'Sales Invoices', label_ar: 'فواتير المبيعات', icon_name: 'FileText', order: 0 },
        { screen_id: 'purchaseinvoice', label: 'Alış & Satın alma', label_en: 'Purchase & Procurement', label_ar: 'الشراء والمشتريات', icon_name: 'FileCheck', order: 1 },
        { screen_id: 'serviceinvoice', label: 'Hizmet Faturaları', label_en: 'Service Invoices', label_ar: 'فواتير الخدمات', icon_name: 'FileText', order: 2 },
        { screen_id: 'waybill', label: 'İrsaliyeler', label_en: 'Waybills', label_ar: 'إيصالات النقل', icon_name: 'Truck', order: 3 },
        { screen_id: 'orders', label: 'Siparişler', label_en: 'Orders', label_ar: 'الطلبات', icon_name: 'ShoppingBag', order: 4 },
        { screen_id: 'offers', label: 'Teklifler', label_en: 'Offers', label_ar: 'العروض', icon_name: 'FileSignature', order: 5 }
      ];

      const mainItemIds: Record<string, number> = {};

      for (const mainItem of mainItems) {
        // Ana menü öğesinin var olup olmadığını kontrol et
        const { data: existingMain } = await supabase
          .from('menu_items')
          .select('id')
          .eq('screen_id', mainItem.screen_id)
          .eq('menu_type', 'main')
          .eq('section_id', sectionId)
          .single();

        if (existingMain) {
          mainItemIds[mainItem.screen_id] = existingMain.id;
        } else {
          const { data: newMain, error: mainError } = await supabase
            .from('menu_items')
            .insert({
              menu_type: 'main',
              label: mainItem.label,
              label_tr: mainItem.label,
              label_en: mainItem.label_en,
              label_ar: mainItem.label_ar,
              section_id: sectionId,
              screen_id: mainItem.screen_id,
              icon_name: mainItem.icon_name,
              display_order: mainItem.order,
              is_active: true,
              is_visible: true
            })
            .select()
            .single();

          if (mainError) throw mainError;
          mainItemIds[mainItem.screen_id] = newMain.id;
        }
      }

      // Alt menüleri ekle
      const subItems = [
        // Satış Faturaları alt menüleri
        { parent_screen_id: 'salesinvoice', screen_id: 'salesinvoice', label: 'Satış Faturası', label_en: 'Sales Invoice', label_ar: 'فاتورة المبيعات', icon_name: 'FileText', order: 0 },
        { parent_screen_id: 'salesinvoice', screen_id: 'salesinvoice', label: 'Perakende Satış', label_en: 'Retail Sale', label_ar: 'بيع التجزئة', icon_name: 'FileText', order: 1 },
        { parent_screen_id: 'salesinvoice', screen_id: 'salesinvoice', label: 'Toptan Satış', label_en: 'Wholesale Sale', label_ar: 'بيع الجملة', icon_name: 'FileText', order: 2 },
        { parent_screen_id: 'salesinvoice', screen_id: 'salesinvoice', label: 'Satış İade', label_en: 'Sales Return', label_ar: 'إرجاع المبيعات', icon_name: 'FileMinus', order: 3 },
        { parent_screen_id: 'salesinvoice', screen_id: 'salesinvoice', label: 'Konsinye Satış', label_en: 'Consignment Sale', label_ar: 'بيع بالعمولة', icon_name: 'FileText', order: 4 },

        // Alış & Satın alma alt menüleri
        { parent_screen_id: 'purchaseinvoice', screen_id: 'purchaseinvoice', label: 'Alış Faturası', label_en: 'Purchase Invoice', label_ar: 'فاتورة الشراء', icon_name: 'FileCheck', order: 0 },
        { parent_screen_id: 'purchaseinvoice', screen_id: 'purchaseinvoice', label: 'Alış İade', label_en: 'Purchase Return', label_ar: 'إرجاع الشراء', icon_name: 'FileMinus', order: 1 },
        { parent_screen_id: 'purchaseinvoice', screen_id: 'purchase', label: 'Satın Alma Siparişleri', label_en: 'Purchase Orders', label_ar: 'طلبات الشراء', icon_name: 'ShoppingBag', order: 2 },
        { parent_screen_id: 'purchaseinvoice', screen_id: 'purchaserequest', label: 'Satın Alma Talepleri', label_en: 'Purchase Requests', label_ar: 'طلبات الشراء', icon_name: 'ClipboardList', order: 3 },
        { parent_screen_id: 'purchaseinvoice', screen_id: 'suppliers', label: 'Tedarikçi Kartları', label_en: 'Supplier Cards', label_ar: 'بطاقات الموردين', icon_name: 'Truck', order: 4 },

        // Hizmet Faturaları alt menüleri
        { parent_screen_id: 'serviceinvoice', screen_id: 'serviceinvoice-given', label: 'Verilen Hizmet Faturası', label_en: 'Service Invoice Given', label_ar: 'فاتورة الخدمة المقدمة', icon_name: 'FileText', order: 0 },
        { parent_screen_id: 'serviceinvoice', screen_id: 'serviceinvoice-received', label: 'Alınan Hizmet Faturası', label_en: 'Service Invoice Received', label_ar: 'فاتورة الخدمة المستلمة', icon_name: 'FileCheck', order: 1 },

        // İrsaliyeler alt menüleri
        { parent_screen_id: 'waybill', screen_id: 'waybill-sales', label: 'Satış İrsaliyesi', label_en: 'Sales Waybill', label_ar: 'إيصال نقل المبيعات', icon_name: 'Truck', order: 0 },
        { parent_screen_id: 'waybill', screen_id: 'waybill-purchase', label: 'Alış İrsaliyesi', label_en: 'Purchase Waybill', label_ar: 'إيصال نقل الشراء', icon_name: 'Truck', order: 1 },
        { parent_screen_id: 'waybill', screen_id: 'waybill-transfer', label: 'Depo Transfer İrsaliyesi', label_en: 'Warehouse Transfer Waybill', label_ar: 'إيصال نقل المستودع', icon_name: 'Truck', order: 2 },
        { parent_screen_id: 'waybill', screen_id: 'waybill-fire', label: 'Fire İrsaliyesi', label_en: 'Fire Waybill', label_ar: 'إيصال النقل الناري', icon_name: 'Truck', order: 3 },

        // Siparişler alt menüleri
        { parent_screen_id: 'orders', screen_id: 'sales-order', label: 'Satış Siparişi', label_en: 'Sales Order', label_ar: 'طلب المبيعات', icon_name: 'ShoppingBag', order: 0 },
        { parent_screen_id: 'orders', screen_id: 'purchase-order', label: 'Alış Siparişi', label_en: 'Purchase Order', label_ar: 'طلب الشراء', icon_name: 'ShoppingBag', order: 1 },

        // Teklifler alt menüleri
        { parent_screen_id: 'offers', screen_id: 'sales-offer', label: 'Satış Teklifi', label_en: 'Sales Offer', label_ar: 'عرض المبيعات', icon_name: 'FileSignature', order: 0 },
        { parent_screen_id: 'offers', screen_id: 'purchase-offer', label: 'Alış Teklifi', label_en: 'Purchase Offer', label_ar: 'عرض الشراء', icon_name: 'FileSignature', order: 1 }
      ];

      for (const subItem of subItems) {
        const parentId = mainItemIds[subItem.parent_screen_id];
        if (!parentId) continue;

        // Alt menü öğesinin var olup olmadığını kontrol et
        const { data: existingSub } = await supabase
          .from('menu_items')
          .select('id')
          .eq('screen_id', subItem.screen_id)
          .eq('menu_type', 'sub')
          .eq('parent_id', parentId)
          .eq('section_id', sectionId)
          .single();

        if (!existingSub) {
          const { error: subError } = await supabase
            .from('menu_items')
            .insert({
              menu_type: 'sub',
              label: subItem.label,
              label_tr: subItem.label,
              label_en: subItem.label_en,
              label_ar: subItem.label_ar,
              parent_id: parentId,
              section_id: sectionId,
              screen_id: subItem.screen_id,
              icon_name: subItem.icon_name,
              display_order: subItem.order,
              is_active: true,
              is_visible: true
            });

          if (subError) {
            console.warn(`Alt menü eklenirken hata (${subItem.label}):`, subError);
          }
        }
      }

      alert('✅ Faturalar menüsü başarıyla geri eklendi!');
      await loadMenuItems();
      // Kısa bir gecikme ekle (Supabase'in güncellemeyi işlemesi için)
      await new Promise(resolve => setTimeout(resolve, 300));
      // Menü güncellendiğini bildir - force reload ile
      window.dispatchEvent(new CustomEvent('menuUpdated', { detail: { forceReload: true } }));
    } catch (error: any) {
      logger.crudError('MenuManagement', 'restoreFaturalarMenu', error);
      alert(`❌ Faturalar menüsü eklenirken hata oluştu:\n\n${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Menüyü statik TypeScript koduna dışa aktar
  const exportMenuToStatic = async () => {
    try {
      if (menuItems.length === 0) {
        alert('Dışa aktarılacak menü öğesi yok. Önce menüyü yükleyin.');
        return;
      }

      // Menü yapısını TypeScript koduna dönüştür
      const generateStaticCode = (items: MenuItem[], indent: string = '    '): string => {
        return items.map(item => {
          const lines: string[] = [];

          if (item.menu_type === 'section') {
            lines.push(`${indent}{`);
            lines.push(`${indent}  title: '${item.title || item.label}',`);
            if (item.children && item.children.length > 0) {
              lines.push(`${indent}  items: [`);
              lines.push(generateStaticCode(item.children, indent + '    '));
              lines.push(`${indent}  ]`);
            }
            lines.push(`${indent}}`);
          } else if (item.menu_type === 'main') {
            lines.push(`${indent}{`);
            lines.push(`${indent}  label: '${item.label}',`);
            if (item.label_tr) lines.push(`${indent}  label_tr: '${item.label_tr}',`);
            if (item.label_en) lines.push(`${indent}  label_en: '${item.label_en}',`);
            if (item.label_ar) lines.push(`${indent}  label_ar: '${item.label_ar}',`);
            if (item.screen_id) lines.push(`${indent}  screen: '${item.screen_id}' as ManagementScreen,`);
            if (item.icon_name) lines.push(`${indent}  icon: ${item.icon_name},`);
            if (item.badge) lines.push(`${indent}  badge: '${item.badge}',`);

            if (item.children && item.children.length > 0) {
              lines.push(`${indent}  items: [`);
              lines.push(generateStaticCode(item.children, indent + '    '));
              lines.push(`${indent}  ]`);
            }
            lines.push(`${indent}}`);
          } else if (item.menu_type === 'sub') {
            lines.push(`${indent}{`);
            lines.push(`${indent}  label: '${item.label}',`);
            if (item.label_tr) lines.push(`${indent}  label_tr: '${item.label_tr}',`);
            if (item.label_en) lines.push(`${indent}  label_en: '${item.label_en}',`);
            if (item.label_ar) lines.push(`${indent}  label_ar: '${item.label_ar}',`);
            if (item.screen_id) lines.push(`${indent}  screen: '${item.screen_id}' as ManagementScreen,`);
            if (item.icon_name) lines.push(`${indent}  icon: ${item.icon_name},`);
            lines.push(`${indent}}`);
          }

          return lines.join('\n');
        }).join(',\n');
      };

      const staticCode = `// Statik Menü Yapısı - ${new Date().toLocaleString('tr-TR')}
// Bu dosya MenuManagementPanel'den otomatik olarak oluşturulmuştur

const staticMenuSections = [
${generateStaticCode(menuItems)}
];

export default staticMenuSections;
`;

      // Dosyayı indir
      const blob = new Blob([staticCode], { type: 'text/typescript' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `static-menu-${new Date().getTime()}.ts`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('✅ Menü yapısı başarıyla dışa aktarıldı!\n\nİndirilen dosyayı ManagementModule.tsx içinde kullanabilirsiniz.');
    } catch (error: any) {
      console.error('Dışa aktarma hatası:', error);
      alert(`❌ Menü dışa aktarılırken hata oluştu:\n\n${error.message}`);
    }
  };

  useEffect(() => {
    loadMenuItems();
  }, [loadMenuItems]);

  // Menü öğelerini düzleştirilmiş liste haline getir (global sıralama ile)
  const flattenMenuItems = (items: MenuItem[], parentId?: number, sectionId?: number, globalIndex = { value: 0 }): MenuItem[] => {
    const result: MenuItem[] = [];
    items.forEach((item) => {
      const flatItem = {
        ...item,
        parent_id: parentId,
        section_id: sectionId || item.section_id,
        display_order: globalIndex.value++
      };
      result.push(flatItem);
      if (item.children && item.children.length > 0) {
        const childSectionId = item.menu_type === 'section' ? item.id : sectionId;
        result.push(...flattenMenuItems(item.children, item.id, childSectionId, globalIndex));
      }
    });
    return result;
  };

  // Menü öğelerini hiyerarşik yapıya dönüştür
  const buildMenuTree = (items: MenuItem[]): MenuItem[] => {
    const itemMap = new Map<number, MenuItem>();
    const rootItems: MenuItem[] = [];

    // Tüm öğeleri map'e ekle
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Hiyerarşiyi oluştur
    items.forEach(item => {
      const menuItem = itemMap.get(item.id)!;

      // Section'lar her zaman root'ta
      if (item.menu_type === 'section') {
        rootItems.push(menuItem);
      } else if (item.parent_id && itemMap.has(item.parent_id)) {
        // Parent'ı olan öğeler parent'ın children'ına ekle
        const parent = itemMap.get(item.parent_id)!;
        if (!parent.children) parent.children = [];
        parent.children.push(menuItem);
      } else if (item.section_id && itemMap.has(item.section_id)) {
        // Section_id'si olan ama parent_id'si olmayan öğeler section'ın children'ına ekle
        const section = itemMap.get(item.section_id)!;
        if (!section.children) section.children = [];
        section.children.push(menuItem);
      } else {
        // Hiçbir bağlantısı yoksa root'a ekle
        rootItems.push(menuItem);
      }
    });

    // Sıralama
    const sortItems = (items: MenuItem[]): MenuItem[] => {
      return items
        .sort((a, b) => a.display_order - b.display_order)
        .map(item => ({
          ...item,
          children: item.children ? sortItems(item.children) : []
        }));
    };

    return sortItems(rootItems);
  };

  // Sürükle başlat
  const handleDragStart = (e: React.DragEvent, item: MenuItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', item.id.toString());
    // Drag görselini iyileştir
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  // Sürükle üzerine gel
  const handleDragOver = (e: React.DragEvent, item: MenuItem) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverItem(item.id);
  };

  // Sürükle bırak
  const handleDrop = async (e: React.DragEvent, targetItem: MenuItem) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    // Önce tüm öğeleri düzleştir
    const flatItems = flattenMenuItems(menuItems);

    // Dragged item'ı listeden çıkar
    const draggedIndex = flatItems.findIndex(item => item.id === draggedItem.id);
    if (draggedIndex === -1) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const [dragged] = flatItems.splice(draggedIndex, 1);

    // Target item'ın index'ini bul
    const targetIndex = flatItems.findIndex(item => item.id === targetItem.id);
    if (targetIndex === -1) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    // Yeni parent ve section belirle
    let newParentId: number | undefined;
    let newSectionId: number | undefined;

    if (targetItem.menu_type === 'section') {
      newSectionId = targetItem.id;
      newParentId = undefined;
    } else if (targetItem.menu_type === 'main') {
      newParentId = targetItem.id;
      newSectionId = targetItem.section_id;
    } else {
      newParentId = targetItem.parent_id;
      newSectionId = targetItem.section_id;
    }

    // Dragged item'ı yeni konumuna ekle
    dragged.parent_id = newParentId;
    dragged.section_id = newSectionId;
    flatItems.splice(targetIndex, 0, dragged);

    // Tüm öğelerin display_order'ını güncelle
    flatItems.forEach((item, index) => {
      item.display_order = index;
    });

    // Hiyerarşik yapıyı yeniden oluştur
    const updatedTree = buildMenuTree(flatItems);
    setMenuItems(updatedTree);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  // Menüyü kaydet
  const saveMenuOrder = async () => {
    try {
      setSaving(true);

      if (menuSource === 'static') {
        const flatItems = flattenMenuItems(menuItems);
        const newHiddenModules = flatItems
          .filter(item => !item.is_visible && item.screen_id)
          .map(item => item.screen_id as string);

        try {
          // @ts-ignore
          const { invoke } = await import('@tauri-apps/api/core');
          const config: any = await invoke('get_app_config');
          config.hidden_modules = newHiddenModules;
          await invoke('save_app_config', { config });

          setHiddenModules(newHiddenModules);
          alert('Statik menü görünürlük ayarları yerel veritabanına kaydedildi!');
        } catch (e) {
          logger.crudError('MenuManagement', 'saveStaticConfig', e);
          alert('Yerel konfigürasyon kaydedilemedi.');
        }
      } else {
        const flatItems = flattenMenuItems(menuItems);
        const updates = flatItems.map((item) => ({
          id: item.id,
          display_order: item.display_order,
          parent_id: item.parent_id || null,
          section_id: item.section_id || null
        }));

        const updatePromises = updates.map(update =>
          supabase
            .from('menu_items')
            .update({
              display_order: update.display_order,
              parent_id: update.parent_id,
              section_id: update.section_id
            })
            .eq('id', update.id)
        );

        const results = await Promise.all(updatePromises);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) throw new Error('Bazı öğeler güncellenemedi');
        alert('Dinamik menü kaydedildi!');
      }

      await loadMenuItems();
      await new Promise(resolve => setTimeout(resolve, 500));
      window.dispatchEvent(new CustomEvent('menuUpdated', { detail: { forceReload: true } }));
    } catch (error) {
      logger.crudError('MenuManagement', 'saveMenu', error);
      alert('Menü kaydedilirken hata oluştu!');
    } finally {
      setSaving(false);
    }
  };

  // Menü öğesini sil - Supabase'den direkt
  const deleteMenuItem = async (id: number) => {
    if (!confirm('Bu menü öğesini silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      await loadMenuItems();
      // Kısa bir gecikme ekle (Supabase'in güncellemeyi işlemesi için)
      await new Promise(resolve => setTimeout(resolve, 300));
      // Menü güncellendiğini bildir - force reload ile
      window.dispatchEvent(new CustomEvent('menuUpdated', { detail: { forceReload: true } }));
    } catch (error) {
      logger.crudError('MenuManagement', 'deleteMenuItem', error);
      alert('Menü öğesi silinirken hata oluştu!');
    }
  };

  // Menü öğesini güncelle
  const updateMenuItem = async (item: MenuItem) => {
    if (menuSource === 'static') {
      // Statik mönüde sadece yerel state güncelle
      setMenuItems(prev => {
        const updateInTree = (items: MenuItem[]): MenuItem[] => {
          return items.map(i => {
            if (i.id === item.id) return { ...i, ...item };
            if (i.children) return { ...i, children: updateInTree(i.children) };
            return i;
          });
        };
        return updateInTree(prev);
      });
      setEditingItem(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('menu_items')
        .update({
          label: item.label,
          label_tr: item.label_tr,
          label_en: item.label_en,
          label_ar: item.label_ar,
          screen_id: item.screen_id,
          icon_name: item.icon_name,
          badge: item.badge,
          is_active: item.is_active,
          is_visible: item.is_visible,
          display_order: item.display_order,
          parent_id: item.parent_id || null,
          section_id: item.section_id || null
        })
        .eq('id', item.id);

      if (error) throw error;

      await loadMenuItems();
      setEditingItem(null);
      await new Promise(resolve => setTimeout(resolve, 300));
      window.dispatchEvent(new CustomEvent('menuUpdated', { detail: { forceReload: true } }));
    } catch (error) {
      logger.crudError('MenuManagement', 'updateMenuItem', error);
      alert('Menü öğesi güncellenirken hata oluştu!');
    }
  };

  // Yeni menü öğesi ekle - Supabase'e direkt
  const addMenuItem = async () => {
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .insert({
          menu_type: newItem.menu_type,
          label: newItem.label,
          label_tr: newItem.label,
          label_en: newItem.label,
          label_ar: newItem.label,
          screen_id: newItem.screen_id || null,
          icon_name: newItem.icon_name || null,
          badge: newItem.badge || null,
          display_order: newItem.display_order || 0,
          is_active: newItem.is_active ?? true,
          is_visible: newItem.is_visible ?? true,
          parent_id: newItem.parent_id || null,
          section_id: newItem.section_id || null
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      await loadMenuItems();
      setShowAddModal(false);
      setNewItem({
        menu_type: 'main',
        label: '',
        display_order: 0,
        is_active: true,
        is_visible: true
      });
      // Kısa bir gecikme ekle (Supabase'in güncellemeyi işlemesi için)
      await new Promise(resolve => setTimeout(resolve, 300));
      // Menü güncellendiğini bildir - force reload ile
      window.dispatchEvent(new CustomEvent('menuUpdated', { detail: { forceReload: true } }));
    } catch (error) {
      logger.crudError('MenuManagement', 'addMenuItem', error);
      alert('Menü öğesi eklenirken hata oluştu!');
    }
  };

  // Section genişlet/daralt
  const toggleSection = (sectionId: number) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Menü öğesi render
  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const isExpanded = expandedSections.has(item.id);
    const isDragging = draggedItem?.id === item.id;
    const isDragOver = dragOverItem === item.id;
    const isSection = item.menu_type === 'section';
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div
        key={item.id}
        className={`mb-2 ${isDragging ? 'opacity-50' : ''}`}
        style={{ marginLeft: `${level * 24}px` }}
      >
        <div
          draggable={true}
          onDragStart={(e) => handleDragStart(e, item)}
          onDragOver={(e) => handleDragOver(e, item)}
          onDrop={(e) => handleDrop(e, item)}
          onDragEnd={() => {
            setDraggedItem(null);
            setDragOverItem(null);
          }}
          onDragLeave={() => {
            // Sadece başka bir öğenin üzerine geçildiğinde temizle
            if (dragOverItem === item.id) {
              setDragOverItem(null);
            }
          }}
          className={`
            flex items-center gap-2 p-3 rounded-lg border-2 transition-all
            ${isDragOver ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white'}
            ${isSection ? 'bg-gray-50 font-semibold' : ''}
            ${isDragging ? 'opacity-30' : ''}
            hover:border-blue-300 hover:shadow-sm cursor-move
          `}
        >
          {/* Drag Handle */}
          <GripVertical className="w-5 h-5 text-gray-400 cursor-grab" />

          {/* Expand/Collapse Button */}
          {hasChildren && (
            <button
              onClick={() => toggleSection(item.id)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Icon */}
          {item.icon_name && (
            <MenuIcon className="w-4 h-4 text-gray-500" />
          )}

          {/* Label */}
          <span className="flex-1 text-sm">
            {item.title || item.label}
            {item.badge && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                {item.badge}
              </span>
            )}
          </span>

          {/* Type Badge */}
          <span className={`px-2 py-1 text-xs rounded ${item.menu_type === 'section' ? 'bg-purple-100 text-purple-700' :
            item.menu_type === 'main' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
            {item.menu_type === 'section' ? 'Ana Menu' :
              item.menu_type === 'main' ? 'Alt Menu' : 'Sub Menu'}
          </span>

          {/* Visibility Toggle */}
          <button
            onClick={() => updateMenuItem({ ...item, is_visible: !item.is_visible })}
            className="p-1 hover:bg-gray-200 rounded"
            title={item.is_visible ? 'Gizle' : 'Göster'}
          >
            {item.is_visible ? (
              <Eye className="w-4 h-4 text-green-600" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {/* Edit Button */}
          <button
            onClick={() => setEditingItem(item)}
            className="p-1 hover:bg-blue-100 rounded text-blue-600"
            title="Düzenle"
          >
            <Edit2 className="w-4 h-4" />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => deleteMenuItem(item.id)}
            className="p-1 hover:bg-red-100 rounded text-red-600"
            title="Sil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-2">
            {item.children!.map(child => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-blue-600" />
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold text-gray-900">Menü Yönetimi</h2>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setMenuSource('supabase')}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${menuSource === 'supabase' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                Dinamik (Supabase)
              </button>
              <button
                onClick={() => setMenuSource('static')}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${menuSource === 'static' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'}`}
              >
                Statik (Yerel Config)
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadMenuItems}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
          <button
            onClick={exportMenuToStatic}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            title="Menü yapısını statik TypeScript koduna dışa aktar"
          >
            <Download className="w-4 h-4" />
            Dışa Aktar
          </button>
          <button
            onClick={restoreFaturalarMenu}
            disabled={saving}
            className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
            title="Faturalar menüsünü ve tüm alt menülerini geri ekle"
          >
            <RefreshCw className="w-4 h-4" />
            Faturalar Menüsünü Geri Ekle
          </button>
          <button
            onClick={seedCurrentMenu}
            disabled={saving}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            title="Mevcut statik menü yapısını veritabanına aktar"
          >
            <MenuIcon className="w-4 h-4" />
            Mevcut Menüyü Yükle
          </button>
          <button
            onClick={saveMenuOrder}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Yeni Ekle
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Menu Items List */}
      <div className="flex-1 overflow-auto p-4">
        {menuItems.length === 0 ? (
          <div className="text-center py-12">
            <MenuIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">Henüz menü öğesi yok</p>
            <p className="text-sm text-gray-500 mb-4">
              Backend çalışmıyor olabilir. Mevcut menüyü yüklemek için "Mevcut Menüyü Yükle" butonunu kullanın.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                İlk Menü Öğesini Ekle
              </button>
              <button
                onClick={seedCurrentMenu}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Mevcut Menüyü Yükle
              </button>
            </div>
          </div>
        ) : (
          <div>
            {menuItems.map(item => renderMenuItem(item))}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Yeni Menü Öğesi</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Menü Tipi</label>
                <select
                  value={newItem.menu_type}
                  onChange={(e) => setNewItem({ ...newItem, menu_type: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="section">Ana Menu (Section)</option>
                  <option value="main">Alt Menu (Main)</option>
                  <option value="sub">Sub Menu</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Etiket (TR)</label>
                <input
                  type="text"
                  value={newItem.label || ''}
                  onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Menü adı"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ekran ID</label>
                <input
                  type="text"
                  value={newItem.screen_id || ''}
                  onChange={(e) => setNewItem({ ...newItem, screen_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="dashboard, products, vb."
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  onClick={addMenuItem}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Ekle
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Menü Öğesini Düzenle</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Etiket (TR)</label>
                <input
                  type="text"
                  value={editingItem.label}
                  onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ekran ID</label>
                <input
                  type="text"
                  value={editingItem.screen_id || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, screen_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingItem.is_active}
                  onChange={(e) => setEditingItem({ ...editingItem, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm">Aktif</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingItem.is_visible}
                  onChange={(e) => setEditingItem({ ...editingItem, is_visible: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm">Görünür</label>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => updateMenuItem(editingItem)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Kaydet
                </button>
                <button
                  onClick={() => setEditingItem(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


