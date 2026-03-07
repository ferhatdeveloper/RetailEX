// Permission Hook - DB Connected
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store';
import { supabase } from '../../utils/supabase/client';
import { DISCOUNT_LIMITS, USER_ROLES } from '../../core/config/constants';

export const usePermission = () => {
  const user = useAuthStore((state) => state.user);

  // Fetch permissions for the user's role
  const { data: permissions } = useQuery({
    queryKey: ['permissions', user?.role],
    queryFn: async () => {
      if (!user?.role) return [];

      const { data, error } = await supabase
        .from('role_permissions')
        .select(`
          permission:permissions(code)
        `)
        .eq('role', user.role);

      if (error) {
        console.error('Error fetching permissions:', error);
        return [];
      }

      // Flatten the structure: [{permission: {code: 'X'}}] -> ['X']
      return data.map((item: any) => item.permission?.code).filter(Boolean);
    },
    enabled: !!user?.role,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const hasPermission = (permissionCode: string): boolean => {
    // Admin always has logic or specific override
    if (user?.role === USER_ROLES.ADMIN) return true;
    return permissions?.includes(permissionCode) || false;
  };

  const getMaxDiscount = (): number => {
    if (!user) return 0;
    // Ideally this also comes from DB, but keeping constant for now as per task scope
    return DISCOUNT_LIMITS[user.role as keyof typeof DISCOUNT_LIMITS] || 0;
  };

  const canApplyDiscount = (discountPercentage: number): boolean => {
    const maxDiscount = getMaxDiscount();
    return discountPercentage <= maxDiscount;
  };

  const isRole = (role: string): boolean => {
    return user?.role === role;
  };

  const isCashier = (): boolean => {
    return user?.role === USER_ROLES.CASHIER;
  };

  const isManager = (): boolean => {
    return user?.role === USER_ROLES.MANAGER;
  };

  const isAdmin = (): boolean => {
    return user?.role === USER_ROLES.ADMIN;
  };

  const needsManagerAuth = (discountPercentage: number): boolean => {
    if (!user) return true;
    const userMaxDiscount = getMaxDiscount();
    return discountPercentage > userMaxDiscount;
  };

  return {
    user,
    permissions,
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


