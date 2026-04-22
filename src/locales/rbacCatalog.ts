/**
 * RBAC modül ağacı — RoleManagement & RoleForm ortak.
 */
import type { PermissionAction } from '../services/rbacService';

export interface RbacModuleConfig {
  id: string;
  name: string;
  description: string;
  availableActions: PermissionAction[];
}

export interface RbacModuleGroup {
  id: string;
  name: string;
  icon: string;
  color: string;
  modules: RbacModuleConfig[];
}

export const RBAC_ACTION_TM_KEYS: Record<PermissionAction, string> = {
  READ: 'rbacActionRead',
  CREATE: 'rbacActionCreate',
  UPDATE: 'rbacActionUpdate',
  DELETE: 'rbacActionDelete',
  EXECUTE: 'rbacActionExecute',
};

function rbacNameKey(moduleId: string) {
  return `rbac_nm_${moduleId.replace(/\./g, '_')}`;
}
function rbacDescKey(moduleId: string) {
  return `rbac_ds_${moduleId.replace(/\./g, '_')}`;
}

export function buildRbacModuleGroups(tm: (k: string) => string): RbacModuleGroup[] {
  const m = (id: string, actions: PermissionAction[]): RbacModuleConfig => ({
    id,
    name: tm(rbacNameKey(id)),
    description: tm(rbacDescKey(id)),
    availableActions: actions,
  });
  return [
    {
      id: 'rest',
      name: tm('rbacGroupRest'),
      icon: '🍽️',
      color: 'rose',
      modules: [
        m('restaurant.pos', ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
        m('restaurant.delivery', ['READ', 'CREATE', 'UPDATE', 'EXECUTE']),
        m('restaurant.takeaway', ['READ', 'CREATE', 'UPDATE', 'EXECUTE']),
        m('restaurant.kds', ['READ', 'UPDATE', 'EXECUTE']),
        m('restaurant.recipes', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('restaurant.reservations', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('restaurant.reports', ['READ', 'EXECUTE']),
        m('restaurant.settings', ['READ', 'UPDATE']),
      ],
    },
    {
      id: 'pos',
      name: tm('rbacGroupRetail'),
      icon: '🛒',
      color: 'emerald',
      modules: [
        m('pos', ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
        m('sales-returns', ['READ', 'CREATE', 'EXECUTE']),
        m('campaigns', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('loyalty', ['READ', 'CREATE', 'UPDATE']),
        m('gift-cards', ['READ', 'CREATE', 'UPDATE', 'EXECUTE']),
      ],
    },
    {
      id: 'wms',
      name: tm('rbacGroupWms'),
      icon: '📦',
      color: 'blue',
      modules: [
        m('products', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('stock', ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
        m('store-transfer', ['READ', 'CREATE', 'UPDATE', 'EXECUTE']),
        m('purchase', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('inventory-check', ['READ', 'CREATE', 'UPDATE', 'EXECUTE']),
      ],
    },
    {
      id: 'finance',
      name: tm('rbacGroupFinance'),
      icon: '💰',
      color: 'orange',
      modules: [
        m('finance.cash', ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
        m('finance.bank', ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
        m('accounting', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('customers', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('suppliers', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('invoices', ['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE']),
        m('mizan', ['READ', 'EXECUTE']),
      ],
    },
    {
      id: 'backoffice',
      name: tm('rbacGroupAdmin'),
      icon: '🛡️',
      color: 'purple',
      modules: [
        m('dashboard', ['READ']),
        m('management', ['READ']),
        m('users.roles', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
        m('reports.advanced', ['READ', 'EXECUTE']),
        m('settings.system', ['READ', 'UPDATE']),
        m('crm', ['READ', 'CREATE', 'UPDATE', 'DELETE']),
      ],
    },
  ];
}
