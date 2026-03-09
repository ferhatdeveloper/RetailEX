import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import rbacService, { Role } from '../services/rbacService';
import { postgres, ERP_SETTINGS } from '../services/postgres';
import { logger } from '../services/loggingService';
import { useAuthStore } from '../store';

// ===== TYPES =====

interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role_ids: string[]; // Multiple roles (mapped from single role in DB for now)
  roles: Role[];
  firm_nr?: string; // Firma numarası (örn: "009")
  period_nr?: string; // Dönem numarası (örn: "01")
  firma_id?: string; // Legacy field
  store_id?: string;
  created_at: string;
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

      // 1. Query user directly from public.users joined with roles
      const sql = `
        SELECT u.*, r.name as role_name, r.permissions as role_permissions, r.color as role_color
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE LOWER(u.username) = LOWER($1)
        AND u.firm_nr = $2
        AND u.password_hash = crypt($3, u.password_hash)
        AND u.is_active = true
      `;

      const { ERP_SETTINGS: latestSettings } = await import('../services/postgres');
      const result = await postgres.query(sql, [username, latestSettings.firmNr, password]);

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

        const resolvedRole: Role = {
          id: dbUser.role_id || 'dynamic',
          name: dbUser.role_name || dbUser.role || 'User',
          description: '',
          permissions: dynamicPermissions,
          isSystemRole: false,
          isActive: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

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
          created_at: dbUser.created_at
        };

        setUser(userWithRoles);
        useAuthStore.getState().login(userWithRoles as any);

        // Restore firm and period context from session
        localStorage.setItem('exretail_user_meta', JSON.stringify({
          firm_nr: dbUser.firm_nr,
          period_nr: latestSettings.periodNr
        }));

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

