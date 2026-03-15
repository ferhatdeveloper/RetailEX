-- RetailEX Comprehensive User Seed Script
-- Target Table: public.employees
-- Users included: REBAZ_AMIN (Admin), MUHASEBE (Accountant), DEMO (Demo/Admin)

-- 1. REBAZ_AMIN (Principal Admin)
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
) ON CONFLICT (id) DO UPDATE SET role = 'admin', username = 'REBAZ_AMIN';

-- 2. MUHASEBE (Muhasebe Yetkilisi)
INSERT INTO public.employees (
    "id", "name", "employee_id", "username", "password", "password_hash", 
    "email", "phone", "department_id", "job_title", "hire_date", "salary", 
    "is_active", "status", "created_at", "updated_at", "role", "section"
) VALUES (
    'f053236a-2af3-4063-9402-ca0f0e9aa598', 
    'MUHASEBE', 
    'MHSB001', 
    'muhasebe', 
    NULL, 
    'YllEQ0Z1UE1IbEJuTnpYOExrNVYwRG54RUdEV3FEdlpqVXdRMzVFS0s2VT06OTc2ZDE2ZDE5YjYzZjNiMDdjYTRmMmQzYjZhYjExZGZkMWU1MDRmMzUwY2YyZTI3NWFiMGQ4MzVjMjAzODI1Zg==', 
    'muhasebq@mail.com', 
    '90544363334', 
    '8d718700-4b9f-4f3f-a62c-5e9088260114', 
    'MUHASEBECI', 
    '2026-02-23', 
    '0.00', 
    true, 
    'active', 
    NOW(), 
    NOW(), 
    'muhasebe', 
    'MUHASEBE'
) ON CONFLICT (id) DO UPDATE SET username = 'muhasebe', role = 'muhasebe';

-- 3. DEMO (Demo/Sistem Yöneticisi)
INSERT INTO public.employees (
    "id", "name", "employee_id", "username", "password", "password_hash", 
    "email", "phone", "department_id", "job_title", "hire_date", "salary", 
    "is_active", "status", "created_at", "updated_at", "role", "department"
) VALUES (
    'afe26a80-ec40-40d8-bc69-bf1ddb0fc2db', 
    'demo', 
    'EMP9999', 
    'demo', 
    'password', 
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 
    'test.personel@exfin.com', 
    '', 
    'b60fd86c-7a41-4f8e-8f38-369fc873564e', 
    'KALFA', 
    '2025-03-01', 
    '700.00', 
    true, 
    'inactive', 
    NOW(), 
    NOW(), 
    'employee', 
    'ADMIN'
) ON CONFLICT (id) DO UPDATE SET username = 'demo', department = 'ADMIN';
