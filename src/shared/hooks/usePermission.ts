// Permission Hook - Unified RBAC System
import { useAuth } from '../../contexts/AuthContext';
import { DISCOUNT_LIMITS, USER_ROLES } from '../../core/config/constants';

export const usePermission = () => {
  const { user, hasPermission: contextHasPermission } = useAuth();

  /**
   * Check if user has permission for an action on a module.
   * Format: hasPermission('pos', 'CREATE') or hasPermission('products', 'READ')
   */
  const hasPermission = (moduleOrCode: string, action?: string): boolean => {
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
  };

  const getMaxDiscount = (): number => {
    if (!user) return 0;
    // Map role names/IDs to discount limits
    const roleId = user.roles?.[0]?.id || '';
    const roleName = user.roles?.[0]?.name?.toLowerCase() || '';

    if (roleId === 'admin' || roleName === 'admin') return DISCOUNT_LIMITS.admin;
    if (roleId === 'manager' || roleName === 'manager') return DISCOUNT_LIMITS.manager;
    return DISCOUNT_LIMITS.cashier;
  };

  const canApplyDiscount = (discountPercentage: number): boolean => {
    const maxDiscount = getMaxDiscount();
    return discountPercentage <= maxDiscount;
  };

  const isRole = (roleName: string): boolean => {
    return user?.roles?.some(r => r.name?.toLowerCase() === roleName.toLowerCase() || r.id === roleName.toLowerCase()) || false;
  };

  const isCashier = (): boolean => {
    return isRole(USER_ROLES.CASHIER);
  };

  const isManager = (): boolean => {
    return isRole(USER_ROLES.MANAGER);
  };

  const isAdmin = (): boolean => {
    return isRole(USER_ROLES.ADMIN);
  };

  const needsManagerAuth = (discountPercentage: number): boolean => {
    if (!user) return true;
    const userMaxDiscount = getMaxDiscount();
    return discountPercentage > userMaxDiscount;
  };

  return {
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
  };
};
