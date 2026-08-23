-- ============================================================================
-- 127: testere kiracısı — admin kullanıcısının şifresini "admin" yap
-- ============================================================================
-- testere DB'de public.users tablosunda username='admin' olan satırın
-- password_hash alanını bcrypt crypt('admin') ile günceller.
--
-- Kullanım: npm run db:migrate (testere bağlamı) veya
--           psql -U postgres -d testere -f 127_testere_admin_password.sql
--
-- Idempotent: UPDATE etkilenen satır sayısı 0 dahi olsa hata vermez.
-- ============================================================================

UPDATE public.users
SET password_hash = crypt('admin', gen_salt('bf')),
    updated_at = NOW()
WHERE username = 'admin';
