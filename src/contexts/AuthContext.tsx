import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import rbacService, { Role } from '../services/rbacService';
import { postgres, ERP_SETTINGS } from '../services/postgres';
import { logger } from '../services/loggingService';

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
          // Load user roles
          const roles = (session.user.role_ids || []).map((roleId: string) =>
            rbacService.getRoleById(roleId)
          ).filter(Boolean);

          setUser({ ...session.user, roles });

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

      // 1. Query user directly from auth.users
      const sql = `
        SELECT id, email, raw_user_meta_data::text as raw_user_meta_data, created_at
        FROM auth.users
        WHERE LOWER(raw_user_meta_data->>'username') = LOWER($1)
        AND (
          raw_user_meta_data->>'firm_nr' = $3 
          OR raw_user_meta_data->>'firm_nr' IS NULL 
          OR raw_user_meta_data->>'role' = 'admin'
          OR (raw_user_meta_data->'allowed_firms')::jsonb @> jsonb_build_array($3)::jsonb
        )
        AND encrypted_password = crypt($2, encrypted_password)
      `;

      const { ERP_SETTINGS: latestSettings } = await import('../services/postgres');
      const result = await postgres.query(sql, [username, password, latestSettings.firmNr]);

      if (result.rowCount > 0) {
        const dbUser = result.rows[0];
        let meta = dbUser.raw_user_meta_data;

        // Robust parsing (always string due to ::text cast)
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch (e) {
            console.error('Auth: Failed to parse user metadata string:', meta);
            meta = null;
          }
        }

        if (!meta || Object.keys(meta).length === 0) {
          logger.error('Auth', `Metadata is missing for user: ${username}`);
          toast.error('Kullanıcı profil verileri eksik. Lütfen sistem yöneticisine danışın.');
          setLoading(false);
          return false;
        }

        logger.info('Auth', `Login successful for user: ${meta.username || username} (ID: ${dbUser.id})`);

        // Map roles
        const roleIds = [meta.role || 'cashier'];
        const roles = roleIds.map(id => rbacService.getRoleById(id)).filter((role): role is Role => !!role);

        const userWithRoles: User = {
          id: dbUser.id,
          username: meta.username || username,
          email: dbUser.email || meta.email || `${meta.username || username}@retailex.local`,
          full_name: meta.full_name || username,
          role_ids: roleIds,
          roles: roles,
          firm_nr: meta.firm_nr, // Firma numarası
          period_nr: meta.period_nr, // Dönem numarası
          store_id: meta.store_id,
          created_at: dbUser.created_at
        };

        setUser(userWithRoles);

        // Update ERP_SETTINGS with logged-in user's firm and period
        if (meta.firm_nr) {
          ERP_SETTINGS.firmNr = meta.firm_nr;
          logger.info('Auth', `Firm context updated to: ${meta.firm_nr}`);
        }
        if (meta.period_nr) {
          ERP_SETTINGS.periodNr = meta.period_nr;
          logger.info('Auth', `Period context updated to: ${meta.period_nr}`);
        }

        // Save metadata for session restore
        localStorage.setItem('exretail_user_meta', JSON.stringify({
          firm_nr: meta.firm_nr,
          period_nr: meta.period_nr
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
        INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data) 
        VALUES ($1, $2, crypt($3, gen_salt('bf')), $4)
        RETURNING id
      `;

      const result = await postgres.query(sql, [
        userId,
        data.email,
        data.password,
        JSON.stringify(metaData)
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

