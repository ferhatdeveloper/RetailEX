// Permission Hook - Unified RBAC System
import { useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DISCOUNT_LIMITS, USER_ROLES } from '../../core/config/constants';

export const usePermission = () => {
  const { user, hasPermission: contextHasPermission } = useAuth();

  /**
   * Check if user has permission for an action on a module.
   * Format: hasPermission('pos', 'CREATE') or hasPermission('products', 'READ')
   * Granüler: hasPermission('pos.discount') → önce tam modül id, sonra üst pos EXECUTE.
   */
  const hasPermission = useCallback((moduleOrCode: string, action?: string): boolean => {
    // Admin bypass
    if (user?.roles?.some(r => r.id === 'admin' || r.name?.toLowerCase() === 'admin')) {
      return true;
    }

    // If second argument is provided, use the new rbac system: hasPermission('module', 'ACTION')
    if (action) {
      return contextHasPermission(moduleOrCode, action);
    }

    // Legacy / granüler: hasPermission('pos.discount')
    if (moduleOrCode.includes('.')) {
      if (contextHasPermission(moduleOrCode, 'EXECUTE')) return true;
      if (contextHasPermission(moduleOrCode, 'READ')) return true;
      const [module, act] = moduleOrCode.split('.');
      return contextHasPermission(module, act.toUpperCase());
    }

    // Default to READ if only module is provided
    return contextHasPermission(moduleOrCode, 'READ');
  }, [user, contextHasPermission]);

  const getMaxDiscount = useCallback((): number => {
    if (!user) return 0;
    const roleId = user.roles?.[0]?.id || '';
    const roleName = user.roles?.[0]?.name?.toLowerCase() || '';

    // Rol JSONB conditions.maxAmount → indirim tavanı (%)
    for (const role of user.roles || []) {
      for (const p of role.permissions || []) {
        if (typeof p !== 'object' || !p) continue;
        const mod = String((p as any).module || '');
        const max = Number((p as any).conditions?.maxAmount);
        if (
          Number.isFinite(max) &&
          max >= 0 &&
          (mod === 'pos.discount' || mod === 'pos')
        ) {
          return max;
        }
      }
    }

    if (roleId === 'admin' || roleName === 'admin') return DISCOUNT_LIMITS.admin;
    if (roleId === 'manager' || roleName === 'manager') return DISCOUNT_LIMITS.manager;
    return DISCOUNT_LIMITS.cashier;
  }, [user]);

  const canApplyDiscount = useCallback((discountPercentage: number): boolean => {
    const maxDiscount = getMaxDiscount();
    return discountPercentage <= maxDiscount;
  }, [getMaxDiscount]);

  const isRole = useCallback((roleName: string): boolean => {
    return user?.roles?.some(r => r.name?.toLowerCase() === roleName.toLowerCase() || r.id === roleName.toLowerCase()) || false;
  }, [user]);

  const isCashier = useCallback(() => isRole(USER_ROLES.CASHIER), [isRole]);
  const isManager = useCallback(() => isRole(USER_ROLES.MANAGER), [isRole]);
  const isAdmin = useCallback(() => isRole(USER_ROLES.ADMIN), [isRole]);

  /** Resepsiyon / reception rol adı (özel tenant rolleri dahil) */
  const isReception = useCallback((): boolean => {
    return (
      user?.roles?.some((r) => {
        const raw = `${r.name ?? ''} ${r.id ?? ''}`.toLocaleLowerCase('tr');
        return (
          raw.includes('resepsiyon') ||
          raw.includes('reception') ||
          raw.includes('receptionist')
        );
      }) ?? false
    );
  }, [user]);

  /**
   * Güzellik randevu işlem tutarı / sepet hizmet fiyatı düzenleme.
   * Randevu & ödeme ekranında varsayılan: herkese açık (ekran zaten beauty yetkisiyle açılır).
   * Admin / resepsiyon / manager / pos.change_price — hepsi true; aksi halde de true.
   */
  const canEditBeautyAppointmentPrice = useCallback((): boolean => {
    return true;
  }, []);

  /** Alış maliyeti, birim alış, satır kârı / marj */
  const canViewPurchasePricing = useCallback(
    () => hasPermission('purchase-pricing', 'READ'),
    [hasPermission]
  );

  /** Malzeme listesi Satış/Alış Toplam dip satırı (sistem parametresi ile birlikte) */
  const canViewProductListSalesPurchaseTotals = useCallback(
    () => hasPermission('product-list-sales-purchase-totals', 'READ'),
    [hasPermission]
  );

  const needsManagerAuth = useCallback((discountPercentage: number): boolean => {
    if (!user) return true;
    const userMaxDiscount = getMaxDiscount();
    return discountPercentage > userMaxDiscount;
  }, [user, getMaxDiscount]);

  return useMemo(() => ({
    user,
    permissions: user?.roles?.flatMap(r => r.permissions) || [],
    hasPermission,
    getMaxDiscount,
    canApplyDiscount,
    isRole,
    isCashier,
    isManager,
    isAdmin,
    isReception,
    canEditBeautyAppointmentPrice,
    canViewPurchasePricing,
    canViewProductListSalesPurchaseTotals,
    needsManagerAuth,
  }), [
    user,
    hasPermission,
    getMaxDiscount,
    canApplyDiscount,
    isRole,
    isCashier,
    isManager,
    isAdmin,
    isReception,
    canEditBeautyAppointmentPrice,
    canViewPurchasePricing,
    canViewProductListSalesPurchaseTotals,
    needsManagerAuth
  ]);
};
