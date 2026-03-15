-- RetailEX Admin User Seed Script
-- Target Table: public.employees
-- Purpose: Inserting REBAZ_AMIN as a Principal Admin

-- 1. REBAZ_AMIN Kullanıcısını Ekle/Güncelle
INSERT INTO public.employees (
    "id", "name", "employee_id", "username", "password", "password_hash", 
    "email", "phone", "department_id", "job_title", "hire_date", "salary", 
    "is_active", "status", "created_at", "updated_at", "role", "section", 
    "nationality", "address", "birth_date", "birth_place"
) VALUES (
    '3185b52a-6835-4155-85cb-fc848446fe06', 
    'REBAZ ANWAR MUHAMMED', 
    '135.01.01.087', 
    'REBAZ_AMIN', 
    'password', 
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 
    'rebaz.barzinji@gmail.com', 
    '07702244546', 
    'accb5545-f1e7-49a5-9881-38e3faa3e899', 
    'IK_MUDURU', 
    '2025-03-10', 
    '1500.00', 
    true, 
    'active', 
    NOW(), 
    NOW(), 
    'admin', 
    'IK', 
    'KURD', 
    'MASS HILLS', 
    '1986-03-17', 
    'SÜLEYMANİYE'
) ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- 2. Muhasebe ve Demo Kullanıcıları Bilgi (Sadece referans, isterseniz çalıştırabilirsiniz)
-- SELECT * FROM public.employees WHERE username IN ('muhasebe', 'demo');
