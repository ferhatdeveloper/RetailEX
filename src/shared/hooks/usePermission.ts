// Permission Hook - Unified RBAC System
import { useCallback, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { DISCOUNT_LIMITS, USER_ROLES } from '../../core/config/constants';

export const usePermission = () => {
  const { user, hasPermission: contextHasPermission } = useAuth();

  /**
   * Check if user has permission for an action on a module.
   * Format: hasPermission('pos', 'CREATE') or hasPermission('products', 'READ')
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

    // Legacy support: hasPermission('module.action') or hasPermission('permissionCode')
    if (moduleOrCode.includes('.')) {
      const [module, act] = moduleOrCode.split('.');
      return contextHasPermission(module, act.toUpperCase());
    }

    // Default to READ if only module is provided
    return contextHasPermission(moduleOrCode, 'READ');
  }, [user, contextHasPermission]);

  const getMaxDiscount = useCallback((): number => {
    if (!user) return 0;
    // Map role names/IDs to discount limits
    const roleId = user.roles?.[0]?.id || '';
    const roleName = user.roles?.[0]?.name?.toLowerCase() || '';

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
    needsManagerAuth
  ]);
};
