/**
 * Authentication API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import type { User } from '../../core/types';

export interface LoginCredentials {
  username: string;
  password: string;
  store?: string;
}

export interface AuthResponse {
  user: User;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}

export const authAPI = {
  /**
   * Login with username and password (Direct PostgreSQL check)
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      console.log(`[AuthAPI] Attempting PostgreSQL login for: ${credentials.username}`);

      // Query the users table directly (Using crypt for password verification)
      const { rows } = await postgres.query(
        `SELECT u.*, s.name as store_name 
         FROM users u 
         LEFT JOIN stores s ON u.store_id = s.id 
         WHERE u.username = $1 
         AND u.password_hash = crypt($2, u.password_hash) 
         AND u.firm_nr = $3 
         AND u.is_active = true`,
        [credentials.username, credentials.password, ERP_SETTINGS.firmNr]
      );

      const dbUser = rows[0];

      if (!dbUser) {
        throw new Error('Kullanıcı adı veya şifre hatalı');
      }

      console.log('✅ [AuthAPI] Login successful for user:', dbUser.username);

      // Create user object
      const user: User = {
        id: dbUser.id,
        username: dbUser.username,
        fullName: dbUser.full_name || dbUser.username,
        role: dbUser.role,
        storeId: dbUser.store_id,
        storeName: dbUser.store_name,
        phone: dbUser.phone,
        email: dbUser.email,
        isActive: dbUser.is_active,
      };

      // Create a dummy session token
      const sessionToken = `pg_session_${dbUser.id}_${Date.now()}`;

      // Update last login
      postgres.query(
        `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1 AND firm_nr = $2`,
        [dbUser.id, ERP_SETTINGS.firmNr]
      ).catch(err => console.error('Failed to update last login:', err));

      return {
        user,
        session: {
          access_token: sessionToken,
          refresh_token: sessionToken,
          expires_at: Date.now() + 8 * 3600 * 1000, // 8 hours
        },
      };
    } catch (error: any) {
      console.error('[AuthAPI] Direct login error:', error);
      throw new Error(error.message || 'Giriş başarısız');
    }
  },

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    console.log('✅ [AuthAPI] Logout successful');
  },
};
