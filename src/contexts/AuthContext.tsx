import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import rbacService, { Role } from '../services/rbacService';
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../services/postgres';
import { logger } from '../services/loggingService';
import { useAuthStore } from '../store';
import { postgrest } from '../services/api/postgrestClient';

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
      logger.info('Auth', `Login attempt: ${username} (Firm: ${ERP_SETTINGS.firmNr})`);

      const { ERP_SETTINGS: latestSettings } = await import('../services/postgres');

      // Rest API (PostgREST) ile güvenli login: password_hash tablosunu frontend'e göstermeden RPC çağrısı yapar.
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const trimmedUsername = username.trim();
        const trimmedPassword = password.trim();

        const rpcRes: any = await postgrest.post('/rpc/verify_login', {
          username: trimmedUsername,
          password: trimmedPassword,
          // Login öncesi firma seçimi olmayabilir; fonksiyon firm_nr '' iken kısıtlamayı gevşetir.
          firm_nr: ''
        }, {
          schema: 'logic'
        });

        const row = Array.isArray(rpcRes) ? rpcRes[0] : (rpcRes?.[0] ?? rpcRes);
        if (!row) {
          toast.error('Kullanıcı adı veya şifre hatalı');
          return false;
        }

        // Parse and resolve permissions robustly
        let rawPerms = row.role_permissions;
        if (typeof rawPerms === 'string') {
          try { rawPerms = JSON.parse(rawPerms); } catch (e) { rawPerms = []; }
        }
        if (!Array.isArray(rawPerms)) rawPerms = [];
        const dynamicPermissions = rbacService.resolveDynamicPermissions(rawPerms);

        const roleName = (row.role_name || '').toLowerCase();
        const isGarson = roleName === 'garson' || roleName === 'waiter';
        const landingRouteRaw = row.role_landing_route && String(row.role_landing_route).trim()
          ? String(row.role_landing_route).trim()
          : null;
        const landingRoute = landingRouteRaw || (isGarson ? 'restaurant' : null);

        const resolvedRole: Role = {
          id: row.role_id || 'dynamic',
          name: row.role_name || row.role_name || 'User',
          description: '',
          permissions: dynamicPermissions,
          isSystemRole: false,
          isActive: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          landingRoute: landingRoute || undefined
        };

        const allowedFirmNrs = row.allowed_firm_nrs != null
          ? (typeof row.allowed_firm_nrs === 'string' ? JSON.parse(row.allowed_firm_nrs || '[]') : row.allowed_firm_nrs)
          : [];
        const allowedPeriods = row.allowed_periods != null
          ? (typeof row.allowed_periods === 'string' ? JSON.parse(row.allowed_periods || '[]') : row.allowed_periods)
          : [];

        const userWithRoles: User = {
          id: row.id,
          username: row.username,
          email: row.email || `${row.username}@retailex.local`,
          full_name: row.full_name,
          role_ids: [row.role_id || row.role_name],
          roles: [resolvedRole],
          firm_nr: row.firm_nr,
          period_nr: latestSettings.periodNr,
          store_id: row.store_id,
          created_at: row.created_at,
          allowed_firm_nrs: allowedFirmNrs,
          allowed_periods: allowedPeriods
        };

        setUser(userWithRoles);
        useAuthStore.getState().login(userWithRoles as any);

        if (landingRoute && ['restaurant', 'pos', 'management', 'wms', 'beauty'].includes(String(landingRoute))) {
          localStorage.setItem('retailex_active_module', landingRoute as string);
        }

        // Save User Meta
        const userMeta = {
          firmNr: userWithRoles.firm_nr,
          periodNr: latestSettings.periodNr
        };
        localStorage.setItem('exretail_user_meta', JSON.stringify({
          firm_nr: userMeta.firmNr,
          period_nr: userMeta.periodNr
        }));

        // Sync ERP settings with global state
        const { updateConfigs } = await import('../services/postgres');
        await updateConfigs({ erp: userMeta });

        // Save session
        const sessionData = {
          token: 'local-session-auth',
          user: userWithRoles
        };
        localStorage.setItem('exretail_session', JSON.stringify(sessionData));

        toast.success(`Hoş geldiniz, ${userWithRoles.full_name}!`);
        return true;
      }

      // 1. Query user from auth.users joined with roles
      const sql = `
        SELECT 
            u.id, 
            u.email, 
            u.raw_user_meta_data->>'username' as username,
            u.raw_user_meta_data->>'full_name' as full_name,
            u.raw_user_meta_data->>'firm_nr' as firm_nr,
            r.id as role_id,
            r.name as role_name, 
            r.permissions as role_permissions, 
            r.color as role_color,
            r.landing_route as role_landing_route
        FROM auth.users u
        LEFT JOIN roles r ON (u.raw_user_meta_data->>'role') = r.name
        WHERE LOWER(u.raw_user_meta_data->>'username') = LOWER($1)
        AND (u.raw_user_meta_data->>'firm_nr') = $2
        AND u.encrypted_password = crypt($3, u.encrypted_password)
      `;

      let result;
      try {
        result = await postgres.query(sql, [username, latestSettings.firmNr, password]);
      } catch (e: any) {
        // Mevcut schema'da Supabase-style auth.users yoksa (sadece public.users kullanılıyorsa),
        // burada düşüp public.users fallback'una geçiyoruz.
        logger.warn('Auth', `auth.users sorgusu başarısız (fallback aktif).`, { error: e?.message || String(e) });
        result = { rows: [], rowCount: 0 };
      }

      // public.users fallback (Kullanıcı Yönetimi'nde eklenen garson vb.)
      if (!result.rowCount || result.rowCount === 0) {
        const publicSql = `
          SELECT u.id, u.email, u.username, u.full_name, u.firm_nr, u.store_id, u.created_at, u.role,
                 u.allowed_firm_nrs, u.allowed_periods,
                 r.id as role_id, r.name as role_name, r.permissions as role_permissions, r.color as role_color,
                 r.landing_route as role_landing_route
          FROM public.users u
          LEFT JOIN public.roles r ON r.id = u.role_id
          WHERE LOWER(u.username) = LOWER($1) AND u.is_active = true
          AND u.password_hash IS NOT NULL AND u.password_hash = crypt($3, u.password_hash)
          AND (
            u.firm_nr = $2::text
            OR (
              COALESCE(jsonb_array_length(u.allowed_firm_nrs), 0) > 0
              AND u.allowed_firm_nrs @> jsonb_build_array($2::text)
            )
            OR (
              COALESCE(jsonb_array_length(COALESCE(u.allowed_firm_nrs, '[]'::jsonb)), 0) = 0
              AND u.firm_nr = $2::text
            )
          )
          LIMIT 1
        `;
        result = await postgres.query(publicSql, [username, latestSettings.firmNr, password]);
      }

      if (result.rowCount > 0) {
        const dbUser = result.rows[0];

        logger.info('Auth', `Login successful for user: ${dbUser.username} (ID: ${dbUser.id})`);

        // Parse and resolve permissions robustly
        let rawPerms = dbUser.role_permissions;
        if (typeof rawPerms === 'string') {
          try { rawPerms = JSON.parse(rawPerms); } catch (e) { rawPerms = []; }
        }
        if (!Array.isArray(rawPerms)) rawPerms = [];

        const dynamicPermissions = rbacService.resolveDynamicPermissions(rawPerms);

        const roleName = (dbUser.role_name || dbUser.role || '').toLowerCase();
        const isGarson = roleName === 'garson' || roleName === 'waiter';
        const landingRouteRaw = dbUser.role_landing_route && String(dbUser.role_landing_route).trim() ? String(dbUser.role_landing_route).trim() : null;
        const landingRoute = landingRouteRaw || (isGarson ? 'restaurant' : null);
        const resolvedRole: Role = {
          id: dbUser.role_id || 'dynamic',
          name: dbUser.role_name || dbUser.role || 'User',
          description: '',
          permissions: dynamicPermissions,
          isSystemRole: false,
          isActive: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          landingRoute: landingRoute || undefined
        };

        const allowedFirmNrs = dbUser.allowed_firm_nrs != null ? (typeof dbUser.allowed_firm_nrs === 'string' ? JSON.parse(dbUser.allowed_firm_nrs || '[]') : dbUser.allowed_firm_nrs) : [];
        const allowedPeriods = dbUser.allowed_periods != null ? (typeof dbUser.allowed_periods === 'string' ? JSON.parse(dbUser.allowed_periods || '[]') : dbUser.allowed_periods) : [];
        const userWithRoles: User = {
          id: dbUser.id,
          username: dbUser.username,
          email: dbUser.email || `${dbUser.username}@retailex.local`,
          full_name: dbUser.full_name,
          role_ids: [dbUser.role_id || dbUser.role],
          roles: [resolvedRole],
          firm_nr: dbUser.firm_nr,
          period_nr: latestSettings.periodNr,
          store_id: dbUser.store_id,
          created_at: dbUser.created_at,
          allowed_firm_nrs: allowedFirmNrs,
          allowed_periods: allowedPeriods
        };

        setUser(userWithRoles);
        useAuthStore.getState().login(userWithRoles as any);

        if (landingRoute && ['restaurant', 'pos', 'management', 'wms', 'beauty'].includes(landingRoute)) {
          localStorage.setItem('retailex_active_module', landingRoute);
        }

        // Save User Meta
        const userMeta = {
          firmNr: dbUser.firm_nr,
          periodNr: latestSettings.periodNr
        };
        localStorage.setItem('exretail_user_meta', JSON.stringify({
          firm_nr: userMeta.firmNr,
          period_nr: userMeta.periodNr
        }));

        // Sync ERP settings with global state
        const { updateConfigs } = await import('../services/postgres');
        await updateConfigs({
          erp: userMeta
        });

        // Save session
        const sessionData = {
          token: 'local-session-auth',
          user: userWithRoles
        };
        localStorage.setItem('exretail_session', JSON.stringify(sessionData));

        toast.success(`Hoş geldiniz, ${userWithRoles.full_name}!`);
        return true;
      } else {
        // Double check for development/fallback if users table is empty or password mismatch
        logger.warn('Auth', `Login failed for user: ${username}. Check username, password, or firm registration.`);
        toast.error('Kullanıcı adı veya şifre hatalı');
        return false;
      }
    } catch (error: any) {
      logger.error('Auth', `Authentication system error during login for ${username}`, { error: error.message });
      toast.error('Giriş sistemi şu an kullanılamıyor (DB Bağlantı Hatası)');
      return false;
    }
    finally {
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

