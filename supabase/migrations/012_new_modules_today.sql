-- Migration 012: BugÃ¼n Eklenen Yeni ModÃ¼ller
-- Accounting Dashboard + Workflow Automation UI
-- Created: 2025-01-01

-- ============================================================================
-- MENU ITEMS TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    menu_type TEXT NOT NULL CHECK (menu_type IN ('section', 'main', 'sub')),
    title TEXT,
    label TEXT NOT NULL,
    label_tr TEXT,
    label_en TEXT,
    label_ar TEXT,
    parent_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    section_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    screen_id TEXT,
    icon_name TEXT,
    badge TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_type ON menu_items(menu_type);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_section ON menu_items(section_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_menu_items_visible ON menu_items(is_visible) WHERE is_visible = true;

-- ============================================================================
-- YENÄ° EKLENENLER SECTION
-- ============================================================================

-- Check and delete existing "Yeni Eklenenler" section first
DELETE FROM menu_items WHERE menu_type = 'section' AND (label = 'Yeni Eklenenler' OR label_tr = 'Yeni Eklenenler');

-- Create NEW section for today's modules
INSERT INTO menu_items (menu_type, label, label_tr, label_en, label_ar, icon_name, display_order, is_active, is_visible)
VALUES 
(
    'section',
    'Yeni Eklenenler',
    'Yeni Eklenenler',
    'New Modules',
    'Ø§Ù„ÙˆØ­Ø¯Ø§Øª Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©',
    'Sparkles',
    0, -- En Ã¼stte gÃ¶ster
    true,
    true
) RETURNING id;

-- Store the section ID for reference
DO $$
DECLARE
    v_new_section_id INTEGER;
    v_accounting_main_id INTEGER;
    v_workflow_main_id INTEGER;
BEGIN
    -- Get the newly created section ID
    SELECT id INTO v_new_section_id 
    FROM menu_items 
    WHERE menu_type = 'section' 
      AND label_tr = 'Yeni Eklenenler' 
    ORDER BY created_at DESC 
    LIMIT 1;

    RAISE NOTICE 'âœ… Yeni Eklenenler Section ID: %', v_new_section_id;

    -- ========================================================================
    -- 1. ACCOUNTING MODULE (Muhasebe)
    -- ========================================================================
    
    INSERT INTO menu_items (
        menu_type, 
        label, 
        label_tr, 
        label_en, 
        label_ar, 
        section_id,
        screen_id,
        icon_name, 
        badge,
        display_order, 
        is_active, 
        is_visible
    )
    VALUES (
        'main',
        'Muhasebe YÃ¶netimi',
        'Muhasebe YÃ¶netimi',
        'Accounting Management',
        'Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø­Ø§Ø³Ø¨Ø©',
        v_new_section_id,
        'accounting_dashboard',
        'DollarSign',
        'YENÄ°',
        10,
        true,
        true
    ) RETURNING id INTO v_accounting_main_id;

    RAISE NOTICE 'âœ… Accounting Main ID: %', v_accounting_main_id;

    -- Accounting sub-items
    INSERT INTO menu_items (menu_type, label, label_tr, label_en, label_ar, parent_id, section_id, screen_id, display_order, is_active, is_visible)
    VALUES
    ('sub', 'Yevmiye FiÅŸleri', 'Yevmiye FiÅŸleri', 'Journal Entries', 'Ù‚ÙŠÙˆØ¯ Ø§Ù„ÙŠÙˆÙ…ÙŠØ©', v_accounting_main_id, v_new_section_id, 'accounting_journal', 1, true, true),
    ('sub', 'Hesap PlanÄ±', 'Hesap PlanÄ±', 'Chart of Accounts', 'Ø¯Ù„ÙŠÙ„ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª', v_accounting_main_id, v_new_section_id, 'accounting_chart', 2, true, true),
    ('sub', 'Mali Raporlar', 'Mali Raporlar', 'Financial Reports', 'Ø§Ù„ØªÙ‚Ø§Ø±ÙŠØ± Ø§Ù„Ù…Ø§Ù„ÙŠØ©', v_accounting_main_id, v_new_section_id, 'accounting_reports', 3, true, true),
    ('sub', 'Banka MutabakatÄ±', 'Banka MutabakatÄ±', 'Bank Reconciliation', 'ØªØ³ÙˆÙŠØ© Ø§Ù„Ø¨Ù†Ùƒ', v_accounting_main_id, v_new_section_id, 'accounting_bank_recon', 4, true, true);

    -- ========================================================================
    -- 2. WORKFLOW AUTOMATION (N8N-like)
    -- ========================================================================
    
    INSERT INTO menu_items (
        menu_type, 
        label, 
        label_tr, 
        label_en, 
        label_ar, 
        section_id,
        screen_id,
        icon_name, 
        badge,
        display_order, 
        is_active, 
        is_visible
    )
    VALUES (
        'main',
        'Workflow Otomasyonu',
        'Workflow Otomasyonu',
        'Workflow Automation',
        'Ø£ØªÙ…ØªØ© Ø³ÙŠØ± Ø§Ù„Ø¹Ù…Ù„',
        v_new_section_id,
        'workflow_builder',
        'Zap',
        'YENÄ°',
        20,
        true,
        true
    ) RETURNING id INTO v_workflow_main_id;

    RAISE NOTICE 'âœ… Workflow Main ID: %', v_workflow_main_id;

    -- Workflow sub-items
    INSERT INTO menu_items (menu_type, label, label_tr, label_en, label_ar, parent_id, section_id, screen_id, display_order, is_active, is_visible)
    VALUES
    ('sub', 'Workflow Builder', 'Workflow Builder', 'Workflow Builder', 'Ù…Ù†Ø´Ø¦ Ø³ÙŠØ± Ø§Ù„Ø¹Ù…Ù„', v_workflow_main_id, v_new_section_id, 'workflow_visual_builder', 1, true, true),
    ('sub', 'Aktif Workflow''lar', 'Aktif Workflow''lar', 'Active Workflows', 'Ø³ÙŠØ± Ø§Ù„Ø¹Ù…Ù„ Ø§Ù„Ù†Ø´Ø·', v_workflow_main_id, v_new_section_id, 'workflow_active', 2, true, true),
    ('sub', 'Ã‡alÄ±ÅŸma GeÃ§miÅŸi', 'Ã‡alÄ±ÅŸma GeÃ§miÅŸi', 'Execution History', 'Ø³Ø¬Ù„ Ø§Ù„ØªÙ†ÙÙŠØ°', v_workflow_main_id, v_new_section_id, 'workflow_history', 3, true, true),
    ('sub', 'MÃ¼ÅŸteri Feedback', 'MÃ¼ÅŸteri Feedback', 'Customer Feedback', 'Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡', v_workflow_main_id, v_new_section_id, 'workflow_feedback', 4, true, true),
    ('sub', 'Ä°letiÅŸim GeÃ§miÅŸi', 'Ä°letiÅŸim GeÃ§miÅŸi', 'Contact History', 'Ø³Ø¬Ù„ Ø§Ù„Ø§ØªØµØ§Ù„', v_workflow_main_id, v_new_section_id, 'workflow_contact_log', 5, true, true);

    -- ========================================================================
    -- 3. VOICE ASSISTANT (Sesli Asistan)
    -- ========================================================================
    
    INSERT INTO menu_items (
        menu_type, 
        label, 
        label_tr, 
        label_en, 
        label_ar, 
        section_id,
        screen_id,
        icon_name, 
        badge,
        display_order, 
        is_active, 
        is_visible
    )
    VALUES (
        'main',
        'Sesli Asistan',
        'Sesli Asistan',
        'Voice Assistant',
        'Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯ Ø§Ù„ØµÙˆØªÙŠ',
        v_new_section_id,
        'voice_assistant',
        'Mic',
        'AI',
        30,
        true,
        true
    );

    -- ========================================================================
    -- 4. MIGRATION PANEL (IT Admin)
    -- ========================================================================
    
    INSERT INTO menu_items (
        menu_type, 
        label, 
        label_tr, 
        label_en, 
        label_ar, 
        section_id,
        screen_id,
        icon_name, 
        badge,
        display_order, 
        is_active, 
        is_visible
    )
    VALUES (
        'main',
        'Database Migrations',
        'Database Migrations',
        'Database Migrations',
        'ØªØ±Ø­ÙŠÙ„ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª',
        v_new_section_id,
        'migration_panel',
        'Database',
        'PRO',
        40,
        true,
        true
    );

    -- ========================================================================
    -- 5. MULTI-STORE DASHBOARD
    -- ========================================================================
    
    INSERT INTO menu_items (
        menu_type, 
        label, 
        label_tr, 
        label_en, 
        label_ar, 
        section_id,
        screen_id,
        icon_name, 
        badge,
        display_order, 
        is_active, 
        is_visible
    )
    VALUES (
        'main',
        'MaÄŸaza YÃ¶netimi',
        'MaÄŸaza YÃ¶netimi',
        'Multi-Store Management',
        'Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…ØªØ§Ø¬Ø± Ø§Ù„Ù…ØªØ¹Ø¯Ø¯Ø©',
        v_new_section_id,
        'multi_store_dashboard',
        'Store',
        'YENÄ°',
        50,
        true,
        true
    );

    -- ========================================================================
    -- 6. SECURITY MODULES PANEL
    -- ========================================================================
    
    INSERT INTO menu_items (
        menu_type, 
        label, 
        label_tr, 
        label_en, 
        label_ar, 
        section_id,
        screen_id,
        icon_name, 
        badge,
        display_order, 
        is_active, 
        is_visible
    )
    VALUES (
        'main',
        'GÃ¼venlik ModÃ¼lleri',
        'GÃ¼venlik ModÃ¼lleri',
        'Security Modules',
        'ÙˆØ­Ø¯Ø§Øª Ø§Ù„Ø£Ù…Ø§Ù†',
        v_new_section_id,
        'security_modules',
        'Shield',
        'BETA',
        60,
        true,
        true
    );

    RAISE NOTICE 'âœ… All new modules added to menu!';
    RAISE NOTICE '';
    RAISE NOTICE 'ğŸ‰ Toplam 6 yeni modÃ¼l eklendi:';
    RAISE NOTICE '   1. Muhasebe YÃ¶netimi (Accounting)';
    RAISE NOTICE '   2. Workflow Otomasyonu (N8N-like)';
    RAISE NOTICE '   3. Sesli Asistan (Voice Assistant)';
    RAISE NOTICE '   4. Database Migrations';
    RAISE NOTICE '   5. MaÄŸaza YÃ¶netimi (Multi-Store)';
    RAISE NOTICE '   6. GÃ¼venlik ModÃ¼lleri (Security)';
    RAISE NOTICE '';
    RAISE NOTICE 'âœ¨ YENÄ° EKLENENLER bÃ¶lÃ¼mÃ¼ en Ã¼stte gÃ¶rÃ¼necek!';

END $$;

-- ============================================================================
-- VIEWS - Quick Access to New Modules
-- ============================================================================

CREATE OR REPLACE VIEW v_new_modules AS
SELECT 
    mi.id,
    mi.menu_type,
    mi.label_tr,
    mi.screen_id,
    mi.icon_name,
    mi.badge,
    s.label_tr as section_name,
    mi.created_at
FROM menu_items mi
LEFT JOIN menu_items s ON mi.section_id = s.id
WHERE s.label_tr = 'Yeni Eklenenler'
  AND mi.menu_type IN ('main', 'sub')
  AND mi.is_active = true
  AND mi.is_visible = true
ORDER BY mi.display_order;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON menu_items TO authenticated;
GRANT SELECT ON v_new_modules TO authenticated;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•';
    RAISE NOTICE 'âœ… MIGRATION 012 COMPLETED SUCCESSFULLY!';
    RAISE NOTICE 'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•';
    RAISE NOTICE '';
    RAISE NOTICE 'ğŸ“‹ BUGÃœN EKLENEN MODÃœLLER:';
    RAISE NOTICE '';
    RAISE NOTICE '   âœ¨ YENÄ° EKLENENLER (Section - En Ãœstte)';
    RAISE NOTICE '      â”œâ”€ ğŸ’° Muhasebe YÃ¶netimi';
    RAISE NOTICE '      â”‚   â”œâ”€ Yevmiye FiÅŸleri';
    RAISE NOTICE '      â”‚   â”œâ”€ Hesap PlanÄ±';
    RAISE NOTICE '      â”‚   â”œâ”€ Mali Raporlar';
    RAISE NOTICE '      â”‚   â””â”€ Banka MutabakatÄ±';
    RAISE NOTICE '      â”‚';
    RAISE NOTICE '      â”œâ”€ ğŸ¤– Workflow Otomasyonu (N8N-like)';
    RAISE NOTICE '      â”‚   â”œâ”€ Workflow Builder';
    RAISE NOTICE '      â”‚   â”œâ”€ Aktif Workflowlar';
    RAISE NOTICE '      â”‚   â”œâ”€ Ã‡alÄ±ÅŸma GeÃ§miÅŸi';
    RAISE NOTICE '      â”‚   â”œâ”€ MÃ¼ÅŸteri Feedback';
    RAISE NOTICE '      â”‚   â””â”€ Ä°letiÅŸim GeÃ§miÅŸi';
    RAISE NOTICE '      â”‚';
    RAISE NOTICE '      â”œâ”€ ğŸ¤ Sesli Asistan (OpenAI Voice)';
    RAISE NOTICE '      â”œâ”€ ğŸ—„ï¸ Database Migrations (IT Admin)';
    RAISE NOTICE '      â”œâ”€ ğŸª MaÄŸaza YÃ¶netimi (Multi-Store)';
    RAISE NOTICE '      â””â”€ ğŸ›¡ï¸ GÃ¼venlik ModÃ¼lleri';
    RAISE NOTICE '';
    RAISE NOTICE 'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•';
    RAISE NOTICE 'ğŸš€ NEXT STEPS:';
    RAISE NOTICE '   1. Frontend component''leri gÃ¼ncelleyin';
    RAISE NOTICE '   2. Routing''i ayarlayÄ±n';
    RAISE NOTICE '   3. Yeni modÃ¼lleri test edin';
    RAISE NOTICE 'â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•';
END $$;

