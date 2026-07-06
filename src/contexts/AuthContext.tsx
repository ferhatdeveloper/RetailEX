import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import type { Language } from '../locales/translations';
import rbacService, { Role } from '../services/rbacService';
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../services/postgres';
import { logger } from '../services/loggingService';
import { useAuthStore } from '../store';
import {
  verifyLoginUser,
  normalizeLoginFirmNr,
  type LoginVerifyRow,
} from '../services/loginVerify';

// ===== TYPES =====

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role_ids: string[];
  roles: Role[];
  firm_nr?: string;
  period_nr?: string;
  firma_id?: string;
  store_id?: string;
  created_at: string;
  allowed_firm_nrs?: string[];
  allowed_periods?: { firm_nr: string; period_nr: number }[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  signup: (data: SignupData) => Promise<boolean>;
  hasPermission: (module: string, action: string) => boolean;
}

interface SignupData {
  username: string;
  password: string;
  email: string;
  full_name: string;
  role_ids: string[];
}

// ===== CONTEXT =====

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function notifyBeautyFollowUpRemindersAfterSession(opts?: { playChime?: boolean }): Promise<void> {
    try {
        if (DB_SETTINGS.connectionProvider === 'rest_api') return;
        const { beautyService } = await import('../services/beautyService');
        const { formatLocalYmd, addDaysToLocalYmd } = await import('../utils/dateLocal');
        const { translate } = await import('../locales/module-translations');
        const raw = (localStorage.getItem('retailos_language') || 'tr').trim();
        const lang: Language = (['tr', 'en', 'ar', 'ku'] as const).includes(raw as Language)
            ? (raw as Language)
            : 'tr';
        const today = formatLocalYmd(new Date());
        const end = addDaysToLocalYmd(today, 14);
        const rows = await beautyService.getFollowUpRemindersInRange(today, end);
        if (!rows.length) return;
        if (opts?.playChime) {
            const { tryPlayBeautyFollowUpReminderChime } = await import('../utils/beautyAppointmentReminderChime');
            await tryPlayBeautyFollowUpReminderChime();
        }
        toast.info(translate('bFollowUpLoginToast', lang).replace('{n}', String(rows.length)), {
            description: translate('bFollowUpLoginToastDesc', lang),
            duration: 12000,
        });
    } catch {
        /* PostgreSQL kapalı veya şema uyumsuz */
    }
}

function buildUserFromLoginRow(row: LoginVerifyRow, periodNr: string): User {
  let rawPerms: unknown = row.role_permissions;
  if (typeof rawPerms === 'string') {
    try { rawPerms = JSON.parse(rawPerms); } catch { rawPerms = []; }
  }
  const permList = Array.isArray(rawPerms) ? rawPerms : [];
  const dynamicPermissions = rbacService.resolveDynamicPermissions(permList);

  const roleName = (row.role_name || '').toLowerCase();
  const isGarson = roleName === 'garson' || roleName === 'waiter';
  const landingRouteRaw = row.role_landing_route && String(row.role_landing_route).trim()
    ? String(row.role_landing_route).trim()
    : null;
  const landingRoute = landingRouteRaw || (isGarson ? 'restaurant' : null);

  const resolvedRole: Role = {
    id: row.role_id || 'dynamic',
    name: row.role_name || 'User',
    description: '',
    permissions: dynamicPermissions,
    isSystemRole: false,
    isActive: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    landingRoute: landingRoute || undefined,
  };

  const allowedFirmNrs = row.allowed_firm_nrs != null
    ? (typeof row.allowed_firm_nrs === 'string' ? JSON.parse(row.allowed_firm_nrs || '[]') : row.allowed_firm_nrs)
    : [];
  const allowedPeriods = row.allowed_periods != null
    ? (typeof row.allowed_periods === 'string' ? JSON.parse(row.allowed_periods || '[]') : row.allowed_periods)
    : [];

  return {
    id: row.id,
    username: row.username,
    email: row.email || `${row.username}@retailex.local`,
    full_name: row.full_name || row.username,
    role_ids: [row.role_id || row.role_name || 'user'],
    roles: [resolvedRole],
    firm_nr: normalizeLoginFirmNr(row.firm_nr) || row.firm_nr || undefined,
    period_nr: periodNr,
    store_id: row.store_id || undefined,
    created_at: row.created_at || new Date().toISOString(),
    allowed_firm_nrs: allowedFirmNrs,
    allowed_periods: allowedPeriods,
  };
}

async function finalizeLoginSession(
  setUserFn: (u: User) => void,
  userWithRoles: User,
): Promise<void> {
  setUserFn(userWithRoles);
  useAuthStore.getState().login(userWithRoles as any);

  const { applyTerminalRuntimeFromAuth } = await import('../services/terminalRuntimeService');
  applyTerminalRuntimeFromAuth(userWithRoles);

  const landingRoute = userWithRoles.roles[0]?.landingRoute ?? null;
  if (landingRoute && ['restaurant', 'pos', 'management', 'wms', 'beauty'].includes(landingRoute)) {
    localStorage.setItem('retailex_active_module', landingRoute);
  }

  const userMeta = {
    firmNr: userWithRoles.firm_nr || ERP_SETTINGS.firmNr,
    periodNr: userWithRoles.period_nr || ERP_SETTINGS.periodNr,
  };
  localStorage.setItem('exretail_user_meta', JSON.stringify({
    firm_nr: userMeta.firmNr,
    period_nr: userMeta.periodNr,
  }));

  const { updateConfigs } = await import('../services/postgres');
  await updateConfigs({ erp: userMeta });

  localStorage.setItem('exretail_session', JSON.stringify({
    token: 'local-session-auth',
    user: userWithRoles,
  }));

  toast.success(`Hoş geldiniz, ${userWithRoles.full_name}!`);
  window.setTimeout(() => {
    void notifyBeautyFollowUpRemindersAfterSession({ playChime: true });
  }, 900);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// ===== PROVIDER =====

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, []);

  // Check if user has active session
  const checkSession = async () => {
    try {
      const sessionData = localStorage.getItem('exretail_session');
      if (sessionData) {
        const session = JSON.parse(sessionData);

        if (session.user) {
          // Enhance dynamic roles with resolve logic if they are just flat permissions
          const resolvedRoles = (session.user.roles || []).map((role: any) => {
            let perms = role.permissions;
            if (typeof perms === 'string') {
              try { perms = JSON.parse(perms); } catch (e) { perms = []; }
            }
            return {
              ...role,
              permissions: Array.isArray(perms) ? rbacService.resolveDynamicPermissions(perms) : []
            };
          });

          const userObj = { ...session.user, roles: resolvedRoles };
          setUser(userObj);
          useAuthStore.getState().login(userObj as any);

          // Son sekme kaydı yoksa rol iniş modülünü yaz (splash / MainLayout ile uyum)
          try {
            const savedMod = (localStorage.getItem('retailex_active_module') || '').trim();
            if (!savedMod) {
              let landing: string | null = null;
              for (const r of resolvedRoles as { landingRoute?: string; landing_route?: string }[]) {
                const lr = r?.landingRoute ?? r?.landing_route;
                if (lr != null && String(lr).trim() !== '') {
                  landing = String(lr).trim();
                  break;
                }
              }
              if (
                landing &&
                ['restaurant', 'pos', 'management', 'wms', 'beauty', 'mobile-pos'].includes(landing)
              ) {
                localStorage.setItem('retailex_active_module', landing);
              }
            }
          } catch {
            /* ignore */
          }

          // Restore firm and period context from session
          // Try to get from localStorage metadata or re-query user
          try {
            const userMetaStr = localStorage.getItem('exretail_user_meta');
            if (userMetaStr) {
              const meta = JSON.parse(userMetaStr);
              if (meta.firm_nr) {
                ERP_SETTINGS.firmNr = meta.firm_nr;
                logger.info('Auth', `Restored firm context: ${meta.firm_nr}`);
              }
              if (meta.period_nr) {
                ERP_SETTINGS.periodNr = meta.period_nr;
                logger.info('Auth', `Restored period context: ${meta.period_nr}`);
              }
            }
          } catch (e) {
            console.warn('Could not restore firm/period context from session');
          }

          window.setTimeout(() => {
              void notifyBeautyFollowUpRemindersAfterSession({ playChime: true });
          }, 2200);
        }
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Login function (Local PostgreSQL)
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const { ERP_SETTINGS: latestSettings } = await import('../services/postgres');
      const selectedFirm = normalizeLoginFirmNr(latestSettings.firmNr);
      logger.info('Auth', `Login attempt: ${username} (Firm: ${selectedFirm || latestSettings.firmNr})`);

      const row = await verifyLoginUser(username, password, selectedFirm);
      if (!row) {
        logger.warn('Auth', `Login failed for user: ${username}. Check username, password, or firm.`);
        toast.error('Kullanıcı adı veya şifre hatalı');
        return false;
      }

      const userWithRoles = buildUserFromLoginRow(row, latestSettings.periodNr);
      const effectiveFirm = normalizeLoginFirmNr(userWithRoles.firm_nr) || selectedFirm;
      if (effectiveFirm) {
        userWithRoles.firm_nr = effectiveFirm;
      }

      logger.info('Auth', `Login successful for user: ${userWithRoles.username} (ID: ${userWithRoles.id})`);
      await finalizeLoginSession(setUser, userWithRoles);
      return true;
    } catch (error: any) {
      logger.error('Auth', `Authentication system error during login for ${username}`, { error: error.message });
      toast.error('Giriş sistemi şu an kullanılamıyor (DB Bağlantı Hatası)');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = () => {
    setUser(null);
    useAuthStore.getState().logout();
    localStorage.removeItem('exretail_session');
    toast.success('Çıkış yapıldı');
  };

  // Signup function (Direct to auth.users)
  const signup = async (data: SignupData): Promise<boolean> => {
    try {
      setLoading(true);

      const userId = crypto.randomUUID();
      const metaData = {
        username: data.username,
        full_name: data.full_name,
        role: data.role_ids?.[0] || 'cashier',
        firm_nr: ERP_SETTINGS.firmNr
      };

      const sql = `
        INSERT INTO public.users (id, email, password_hash, username, full_name, role, role_id, firm_nr) 
        VALUES ($1, $2, crypt($3, gen_salt('bf')), $4, $5, $6, $7, $8)
        RETURNING id
      `;

      const result = await postgres.query(sql, [
        userId,
        data.email,
        data.password,
        data.username,
        data.full_name,
        data.role_ids?.[0] || 'cashier',
        data.role_ids?.[0], // Assuming role_id is passed as uuid if available, or name
        ERP_SETTINGS.firmNr
      ]);

      if (result.rowCount > 0) {
        toast.success('Kayıt başarılı! Giriş yapabilirsiniz.');
        return true;
      } else {
        toast.error('Kayıt başarısız');
        return false;
      }
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error('Kayıt sırasında hata oluştu: ' + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Check permission
  const hasPermission = (module: string, action: string): boolean => {
    if (!user) return false;
    return rbacService.hasPermission(user.roles, module, action as any);
  };

  const value: AuthContextType = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    signup,
    hasPermission
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

