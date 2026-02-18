/**
 * ExRetailOS - Authentication Service (Backend)
 * 
 * User authentication endpoints
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from "./kv_store.tsx";

const app = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Simple password hashing (in production, use bcrypt)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'exretail_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === hashedPassword;
}

function generateToken(): string {
  return crypto.randomUUID() + '-' + Date.now();
}

/**
 * POST /auth/signup
 * Create new user account
 */
app.post("/signup", async (c) => {
  try {
    const { username, email, full_name, password, role_ids } = await c.req.json();

    // Validation
    if (!username || !email || !full_name || !password) {
      return c.json({ error: 'Tüm alanlar zorunludur' }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: 'Şifre en az 6 karakter olmalıdır' }, 400);
    }

    // Check if username exists
    const existingUsers = await kv.getByPrefix('user:');
    const userExists = existingUsers.some((u: any) => u.username === username);
    
    if (userExists) {
      return c.json({ error: 'Bu kullanıcı adı zaten kullanılıyor' }, 400);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      username,
      email,
      full_name,
      password: hashedPassword,
      role_ids: role_ids || ['cashier'],
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await kv.set(`user:${userId}`, user);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return c.json({
      success: true,
      user: userWithoutPassword,
      message: 'Kayıt başarılı'
    });
  } catch (error: any) {
    console.error('[Auth] Signup error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /auth/login
 * User login
 */
app.post("/login", async (c) => {
  try {
    const { username, password } = await c.req.json();

    if (!username || !password) {
      return c.json({ error: 'Kullanıcı adı ve şifre gereklidir' }, 400);
    }

    // Find user
    const users = await kv.getByPrefix('user:');
    const user = users.find((u: any) => u.username === username);

    if (!user) {
      return c.json({ error: 'Kullanıcı bulunamadı' }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password);
    
    if (!isValid) {
      return c.json({ error: 'Şifre hatalı' }, 401);
    }

    if (!user.is_active) {
      return c.json({ error: 'Hesabınız devre dışı bırakılmış' }, 403);
    }

    // Generate token
    const token = generateToken();
    
    // Save session
    await kv.set(`session:${token}`, {
      user_id: user.id,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return c.json({
      success: true,
      user: userWithoutPassword,
      token,
      message: 'Giriş başarılı'
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * GET /auth/verify
 * Verify session token
 */
app.get("/verify", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: 'Token gerekli' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Get session
    const session = await kv.get(`session:${token}`);
    
    if (!session) {
      return c.json({ error: 'Geçersiz token' }, 401);
    }

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      await kv.del(`session:${token}`);
      return c.json({ error: 'Token süresi dolmuş' }, 401);
    }

    // Get user
    const user = await kv.get(`user:${session.user_id}`);
    
    if (!user) {
      return c.json({ error: 'Kullanıcı bulunamadı' }, 401);
    }

    if (!user.is_active) {
      return c.json({ error: 'Hesap devre dışı' }, 403);
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    return c.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error: any) {
    console.error('[Auth] Verify error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /auth/logout
 * Logout user
 */
app.post("/logout", async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      await kv.del(`session:${token}`);
    }

    return c.json({
      success: true,
      message: 'Çıkış başarılı'
    });
  } catch (error: any) {
    console.error('[Auth] Logout error:', error);
    return c.json({ error: error.message }, 500);
  }
});

/**
 * POST /auth/create-demo-users
 * Create demo users for testing
 */
app.post("/create-demo-users", async (c) => {
  try {
    const demoUsers = [
      {
        id: 'user-admin',
        username: 'admin',
        email: 'admin@exretail.com',
        full_name: 'Sistem Yöneticisi',
        password: await hashPassword('admin123'),
        role_ids: ['admin'],
        is_active: true
      },
      {
        id: 'user-muhasebe',
        username: 'muhasebe',
        email: 'muhasebe@exretail.com',
        full_name: 'Muhasebe Sorumlusu',
        password: await hashPassword('muhasebe123'),
        role_ids: ['accountant'],
        is_active: true
      },
      {
        id: 'user-kasiyer',
        username: 'kasiyer',
        email: 'kasiyer@exretail.com',
        full_name: 'Kasiyer',
        password: await hashPassword('kasiyer123'),
        role_ids: ['cashier'],
        is_active: true
      },
      {
        id: 'user-depo',
        username: 'depo',
        email: 'depo@exretail.com',
        full_name: 'Depo Sorumlusu',
        password: await hashPassword('depo123'),
        role_ids: ['warehouse'],
        is_active: true
      }
    ];

    for (const user of demoUsers) {
      await kv.set(`user:${user.id}`, {
        ...user,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    return c.json({
      success: true,
      message: 'Demo kullanıcılar oluşturuldu',
      count: demoUsers.length
    });
  } catch (error: any) {
    console.error('[Auth] Create demo users error:', error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

