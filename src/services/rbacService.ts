/**
 * ExRetailOS - Role-Based Access Control (RBAC) Service
 * 
 * Comprehensive permission and role management:
 * - Role definitions
 * - Permission matrix
 * - User role assignments
 * - Permission checking
 * - Audit logging
 * 
 * @created 2024-12-24
 */

// ===== TYPES =====

export type PermissionAction = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXECUTE';
export type ModuleId = string; // Same as ModuleId from modules.config.ts

export interface Permission {
  module: ModuleId;
  actions: PermissionAction[];
  conditions?: {
    onlyOwnData?: boolean; // Can only access own records
    requireApproval?: boolean; // Needs manager approval
    maxAmount?: number; // Maximum transaction amount
  };
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean; // Cannot be deleted
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy: string;
  assignedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  details: any;
  ipAddress?: string;
  timestamp: string;
}

// ===== PREDEFINED ROLES =====

export const SYSTEM_ROLES: Role[] = [
  {
    id: 'admin',
    name: 'Sistem Yöneticisi',
    description: 'Tüm yetkilere sahip, sistem ayarlarını değiştirebilir',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: '*', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'] }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'accountant',
    name: 'Muhasebeci',
    description: 'Mali işlemler, muhasebe fişleri, raporlar',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: 'dashboard', actions: ['READ'] },
      { module: 'finance', actions: ['CREATE', 'READ', 'UPDATE'] },
      { module: 'accounting', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
      { module: 'mizan', actions: ['READ', 'EXECUTE'] },
      { module: 'income-statement', actions: ['READ', 'EXECUTE'] },
      { module: 'balance-sheet', actions: ['READ', 'EXECUTE'] },
      { module: 'customers', actions: ['READ'] },
      { module: 'suppliers', actions: ['READ'] },
      { module: 'sales-invoices', actions: ['READ'] },
      { module: 'purchase-invoices', actions: ['READ'] },
      { module: 'reports', actions: ['READ', 'EXECUTE'] },
      { module: 'multi-currency', actions: ['READ', 'UPDATE'] }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'cashier',
    name: 'Kasiyer',
    description: 'POS satış, iade, kasa işlemleri',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: 'dashboard', actions: ['READ'] },
      { module: 'products', actions: ['READ'] },
      { module: 'customers', actions: ['READ', 'CREATE', 'UPDATE'] },
      { module: 'sales-invoices', actions: ['CREATE', 'READ'], conditions: { onlyOwnData: true } },
      { module: 'returns', actions: ['CREATE', 'READ'], conditions: { requireApproval: true } },
      { module: 'finance', actions: ['READ'] },
      { module: 'campaigns', actions: ['READ', 'EXECUTE'] },
      { module: 'loyalty', actions: ['READ', 'EXECUTE'] },
      { module: 'gift-cards', actions: ['READ', 'EXECUTE'] }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'warehouse',
    name: 'Depo Sorumlusu',
    description: 'Stok yönetimi, transfer, sayım',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: 'dashboard', actions: ['READ'] },
      { module: 'products', actions: ['READ', 'UPDATE'] },
      { module: 'stock', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
      { module: 'purchase', actions: ['READ'] },
      { module: 'purchase-invoices', actions: ['READ'] },
      { module: 'store-transfer', actions: ['CREATE', 'READ', 'UPDATE'] },
      { module: 'mobile-inventory', actions: ['CREATE', 'READ', 'UPDATE', 'EXECUTE'] },
      { module: 'inter-store-transfers', actions: ['CREATE', 'READ', 'UPDATE'] }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'sales-rep',
    name: 'Satış Temsilcisi',
    description: 'Satış siparişleri, müşteri yönetimi, teklifler',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: 'dashboard', actions: ['READ'] },
      { module: 'products', actions: ['READ'] },
      { module: 'customers', actions: ['CREATE', 'READ', 'UPDATE'] },
      { module: 'sales-orders', actions: ['CREATE', 'READ', 'UPDATE'] },
      { module: 'crm', actions: ['CREATE', 'READ', 'UPDATE'] },
      { module: 'campaigns', actions: ['READ'] },
      { module: 'reports', actions: ['READ'], conditions: { onlyOwnData: true } }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'manager',
    name: 'Mağaza Müdürü',
    description: 'Mağaza operasyonları, onaylar, raporlar',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: 'dashboard', actions: ['READ'] },
      { module: 'unlimitedDashboard', actions: ['READ'] },
      { module: 'profitDashboard', actions: ['READ'] },
      { module: 'products', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
      { module: 'stock', actions: ['READ', 'UPDATE', 'EXECUTE'] },
      { module: 'customers', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
      { module: 'suppliers', actions: ['READ'] },
      { module: 'finance', actions: ['READ'] },
      { module: 'sales-orders', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
      { module: 'sales-invoices', actions: ['READ', 'DELETE'] },
      { module: 'returns', actions: ['CREATE', 'READ', 'UPDATE', 'EXECUTE'] },
      { module: 'campaigns', actions: ['CREATE', 'READ', 'UPDATE', 'DELETE'] },
      { module: 'reports', actions: ['READ', 'EXECUTE'] },
      { module: 'users', actions: ['READ'] }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'report-viewer',
    name: 'Rapor Görüntüleyici',
    description: 'Sadece raporları görüntüleyebilir',
    isSystemRole: true,
    isActive: true,
    permissions: [
      { module: 'dashboard', actions: ['READ'] },
      { module: 'reports', actions: ['READ', 'EXECUTE'] },
      { module: 'bi-dashboard', actions: ['READ'] },
      { module: 'advanced-reporting', actions: ['READ', 'EXECUTE'] },
      { module: 'excel', actions: ['READ', 'EXECUTE'] }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

// ===== PERMISSION CHECKING FUNCTIONS =====

/**
 * Check if user has permission for an action on a module
 */
export function hasPermission(
  userRoles: Role[],
  module: ModuleId,
  action: PermissionAction
): boolean {
  // Admin has all permissions
  if (userRoles.some(role => role.id === 'admin')) {
    return true;
  }

  // Check each role
  for (const role of userRoles) {
    for (const permission of role.permissions) {
      // Wildcard module
      if (permission.module === '*' && permission.actions.includes(action)) {
        return true;
      }

      // Specific module
      if (permission.module === module && permission.actions.includes(action)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get all permissions for a user
 */
export function getUserPermissions(userRoles: Role[]): Permission[] {
  const permissionsMap = new Map<string, Permission>();

  userRoles.forEach(role => {
    role.permissions.forEach(permission => {
      const key = permission.module;
      const existing = permissionsMap.get(key);

      if (existing) {
        // Merge actions
        const mergedActions = Array.from(new Set([...existing.actions, ...permission.actions]));
        permissionsMap.set(key, {
          ...existing,
          actions: mergedActions as PermissionAction[]
        });
      } else {
        permissionsMap.set(key, { ...permission });
      }
    });
  });

  return Array.from(permissionsMap.values());
}

/**
 * Check if user can perform action with conditions
 */
export function canPerformAction(
  userRoles: Role[],
  module: ModuleId,
  action: PermissionAction,
  context?: {
    isOwnData?: boolean;
    amount?: number;
    requiresApproval?: boolean;
  }
): { allowed: boolean; reason?: string } {
  // Check basic permission
  if (!hasPermission(userRoles, module, action)) {
    return { allowed: false, reason: 'Yetkiniz bulunmamaktadır' };
  }

  // Check conditions
  for (const role of userRoles) {
    const permission = role.permissions.find(p => 
      p.module === module || p.module === '*'
    );

    if (permission?.conditions) {
      // Check onlyOwnData condition
      if (permission.conditions.onlyOwnData && !context?.isOwnData) {
        return { allowed: false, reason: 'Sadece kendi kayıtlarınıza erişebilirsiniz' };
      }

      // Check maxAmount condition
      if (permission.conditions.maxAmount && context?.amount) {
        if (context.amount > permission.conditions.maxAmount) {
          return { 
            allowed: false, 
            reason: `Maksimum tutar limiti: ${permission.conditions.maxAmount}` 
          };
        }
      }

      // Check requireApproval condition
      if (permission.conditions.requireApproval && !context?.requiresApproval) {
        return { allowed: false, reason: 'Yönetici onayı gereklidir' };
      }
    }
  }

  return { allowed: true };
}

/**
 * Get role by ID
 */
export function getRoleById(roleId: string): Role | undefined {
  return SYSTEM_ROLES.find(r => r.id === roleId);
}

/**
 * Get all roles
 */
export function getAllRoles(): Role[] {
  return SYSTEM_ROLES;
}

/**
 * Get active roles
 */
export function getActiveRoles(): Role[] {
  return SYSTEM_ROLES.filter(r => r.isActive);
}

// ===== AUDIT LOGGING =====

/**
 * Log user action for audit trail
 */
export function logAction(
  userId: string,
  userName: string,
  action: string,
  module: string,
  details: any,
  ipAddress?: string
): AuditLog {
  const log: AuditLog = {
    id: crypto.randomUUID(),
    userId,
    userName,
    action,
    module,
    details,
    ipAddress,
    timestamp: new Date().toISOString()
  };

  // In production, save to backend
  console.log('[AUDIT]', log);

  return log;
}

/**
 * Check if action should be logged
 */
export function shouldLogAction(module: ModuleId, action: PermissionAction): boolean {
  // Log all CREATE, UPDATE, DELETE actions
  if (['CREATE', 'UPDATE', 'DELETE'].includes(action)) {
    return true;
  }

  // Log EXECUTE actions for sensitive modules
  const sensitiveModules = [
    'accounting',
    'finance',
    'mizan',
    'income-statement',
    'balance-sheet',
    'users',
    'roles'
  ];

  if (action === 'EXECUTE' && sensitiveModules.includes(module)) {
    return true;
  }

  return false;
}

// ===== HELPER FUNCTIONS =====

/**
 * Create permission matrix for UI display
 */
export function createPermissionMatrix(roles: Role[]): {
  modules: string[];
  matrix: { [roleId: string]: { [module: string]: PermissionAction[] } };
} {
  const modules = new Set<string>();
  const matrix: { [roleId: string]: { [module: string]: PermissionAction[] } } = {};

  roles.forEach(role => {
    matrix[role.id] = {};
    role.permissions.forEach(permission => {
      modules.add(permission.module);
      matrix[role.id][permission.module] = permission.actions;
    });
  });

  return {
    modules: Array.from(modules).sort(),
    matrix
  };
}

/**
 * Validate role permissions
 */
export function validateRolePermissions(permissions: Permission[]): { 
  valid: boolean; 
  errors: string[] 
} {
  const errors: string[] = [];

  if (!permissions || permissions.length === 0) {
    errors.push('En az bir yetki tanımlanmalıdır');
  }

  permissions.forEach((permission, index) => {
    if (!permission.module) {
      errors.push(`Yetki ${index + 1}: Modül adı gereklidir`);
    }

    if (!permission.actions || permission.actions.length === 0) {
      errors.push(`Yetki ${index + 1}: En az bir işlem seçilmelidir`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  SYSTEM_ROLES,
  hasPermission,
  getUserPermissions,
  canPerformAction,
  getRoleById,
  getAllRoles,
  getActiveRoles,
  logAction,
  shouldLogAction,
  createPermissionMatrix,
  validateRolePermissions
};

