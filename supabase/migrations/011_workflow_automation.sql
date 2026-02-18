-- Migration 011: Workflow Automation System
-- N8N-like automation for customer feedback
-- Created: 2025-01-01

-- ============================================================================
-- WORKFLOW TEMPLATES
-- ============================================================================

CREATE TABLE workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'customer_exit',
        'sale_complete',
        'customer_birthday',
        'low_stock',
        'time_based',
        'manual'
    )),
    
    -- Workflow definition (N8N-like JSON)
    workflow_json JSONB NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    
    -- Execution stats
    total_executions INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    
    -- Ownership
    created_by UUID REFERENCES users(id),
    store_id UUID REFERENCES stores(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_templates_trigger ON workflow_templates(trigger_type);
CREATE INDEX idx_workflow_templates_active ON workflow_templates(is_active);
CREATE INDEX idx_workflow_templates_store ON workflow_templates(store_id);

-- ============================================================================
-- WORKFLOW EXECUTIONS
-- ============================================================================

CREATE TABLE workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES workflow_templates(id),
    
    -- Trigger data
    trigger_type TEXT NOT NULL,
    trigger_data JSONB, -- {customer_id, sale_id, etc.}
    
    -- Execution state
    status TEXT DEFAULT 'running' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'waiting')),
    current_step TEXT,
    current_step_index INTEGER DEFAULT 0,
    
    -- Logs
    steps_log JSONB DEFAULT '[]'::JSONB, -- Array of step executions
    error_message TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Next scheduled action (for delays)
    next_run_at TIMESTAMPTZ
);

CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX idx_workflow_executions_status ON workflow_executions(status);
CREATE INDEX idx_workflow_executions_started ON workflow_executions(started_at DESC);
CREATE INDEX idx_workflow_executions_next_run ON workflow_executions(next_run_at) WHERE status = 'waiting';

-- ============================================================================
-- CUSTOMER FEEDBACK
-- ============================================================================

CREATE TABLE customer_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) NOT NULL,
    sale_id UUID REFERENCES orders(id),
    workflow_execution_id UUID REFERENCES workflow_executions(id),
    
    -- Channel
    feedback_channel TEXT CHECK (feedback_channel IN (
        'voice_call',
        'whatsapp',
        'sms',
        'email',
        'in_store',
        'web_survey'
    )),
    
    language TEXT DEFAULT 'tr' CHECK (language IN ('tr', 'ar', 'ku-sorani', 'en')),
    
    -- Feedback content
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    questions JSONB, -- [{question: "", answer: ""}]
    transcript TEXT, -- Full conversation transcript
    
    -- AI Analysis
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
    ai_summary TEXT,
    topics TEXT[], -- ['product_quality', 'staff_behavior', 'pricing']
    keywords TEXT[],
    
    -- Metrics
    call_duration_seconds INTEGER,
    response_time_minutes INTEGER, -- Time from trigger to response
    
    -- Status
    is_complete BOOLEAN DEFAULT false,
    needs_followup BOOLEAN DEFAULT false,
    followup_assigned_to UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_feedback_customer ON customer_feedback(customer_id);
CREATE INDEX idx_customer_feedback_sale ON customer_feedback(sale_id);
CREATE INDEX idx_customer_feedback_channel ON customer_feedback(feedback_channel);
CREATE INDEX idx_customer_feedback_rating ON customer_feedback(rating);
CREATE INDEX idx_customer_feedback_sentiment ON customer_feedback(sentiment);
CREATE INDEX idx_customer_feedback_created ON customer_feedback(created_at DESC);
CREATE INDEX idx_customer_feedback_followup ON customer_feedback(needs_followup) WHERE needs_followup = true;

-- ============================================================================
-- CUSTOMER CONTACT LOG
-- ============================================================================

CREATE TABLE customer_contact_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) NOT NULL,
    workflow_execution_id UUID REFERENCES workflow_executions(id),
    
    -- Contact details
    contact_type TEXT CHECK (contact_type IN ('call', 'whatsapp', 'sms', 'email')),
    direction TEXT CHECK (direction IN ('outbound', 'inbound')),
    phone_number TEXT,
    message TEXT,
    
    -- Status
    status TEXT CHECK (status IN (
        'initiated',
        'ringing',
        'answered',
        'no_answer',
        'busy',
        'failed',
        'delivered',
        'read',
        'replied'
    )),
    
    -- Voice call specific
    call_sid TEXT, -- Twilio/external call ID
    recording_url TEXT,
    duration_seconds INTEGER,
    
    -- WhatsApp specific
    whatsapp_message_id TEXT,
    whatsapp_status TEXT,
    
    -- SMS specific
    sms_sid TEXT,
    
    -- Metadata
    error_message TEXT,
    metadata JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contact_log_customer ON customer_contact_log(customer_id);
CREATE INDEX idx_contact_log_workflow ON customer_contact_log(workflow_execution_id);
CREATE INDEX idx_contact_log_type ON customer_contact_log(contact_type);
CREATE INDEX idx_contact_log_created ON customer_contact_log(created_at DESC);

-- ============================================================================
-- CUSTOMER EXTENSIONS (Add language preferences)
-- ============================================================================

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS nationality TEXT,
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'tr',
ADD COLUMN IF NOT EXISTS contact_preference TEXT DEFAULT 'whatsapp',
ADD COLUMN IF NOT EXISTS allow_marketing_calls BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_whatsapp BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS allow_sms BOOLEAN DEFAULT true;

CREATE INDEX idx_customers_nationality ON customers(nationality);
CREATE INDEX idx_customers_language ON customers(preferred_language);

-- ============================================================================
-- SAMPLE WORKFLOWS
-- ============================================================================

-- Customer Feedback Workflow (Turkish)
INSERT INTO workflow_templates (name, description, trigger_type, workflow_json, is_active) VALUES
(
    'Customer Feedback - Turkish',
    'MÃ¼ÅŸteri Ã§Ä±kÄ±ÅŸÄ±ndan 1 saat sonra sesli arama, cevap vermezse WhatsApp',
    'customer_exit',
    '{
        "nodes": [
            {
                "id": "start",
                "type": "trigger",
                "config": {"trigger_type": "customer_exit"},
                "next_nodes": ["delay1"]
            },
            {
                "id": "delay1",
                "type": "delay",
                "config": {"delay_minutes": 60},
                "next_nodes": ["check_language"]
            },
            {
                "id": "check_language",
                "type": "condition",
                "config": {
                    "field": "customer.nationality",
                    "operator": "equals",
                    "value": "TR"
                },
                "next_nodes": ["call_turkish", "end"]
            },
            {
                "id": "call_turkish",
                "type": "voice_call",
                "config": {
                    "language": "tr",
                    "script_template": "feedback_survey_tr",
                    "record": true,
                    "transcribe": true
                },
                "next_nodes": ["check_answered"]
            },
            {
                "id": "check_answered",
                "type": "condition",
                "config": {
                    "field": "call_result.answered",
                    "operator": "equals",
                    "value": true
                },
                "next_nodes": ["save_feedback", "whatsapp_fallback"]
            },
            {
                "id": "save_feedback",
                "type": "database",
                "config": {
                    "operation": "insert",
                    "table": "customer_feedback"
                },
                "next_nodes": ["end"]
            },
            {
                "id": "whatsapp_fallback",
                "type": "whatsapp",
                "config": {
                    "template": "feedback_survey_whatsapp_tr"
                },
                "next_nodes": ["end"]
            },
            {
                "id": "end",
                "type": "end",
                "config": {}
            }
        ]
    }'::JSONB,
    true
),
(
    'Customer Feedback - Arabic',
    'Ù…Ø³Ø­ Ø±Ø¶Ø§ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø¨Ø¹Ø¯ Ø§Ù„Ø®Ø±ÙˆØ¬ Ù…Ù† Ø§Ù„Ù…ØªØ¬Ø±',
    'customer_exit',
    '{
        "nodes": [
            {
                "id": "start",
                "type": "trigger",
                "config": {"trigger_type": "customer_exit"},
                "next_nodes": ["delay1"]
            },
            {
                "id": "delay1",
                "type": "delay",
                "config": {"delay_minutes": 60},
                "next_nodes": ["check_language"]
            },
            {
                "id": "check_language",
                "type": "condition",
                "config": {
                    "field": "customer.nationality",
                    "operator": "in",
                    "value": ["IQ", "SY"]
                },
                "next_nodes": ["call_arabic", "end"]
            },
            {
                "id": "call_arabic",
                "type": "voice_call",
                "config": {
                    "language": "ar",
                    "script_template": "feedback_survey_ar",
                    "record": true,
                    "transcribe": true
                },
                "next_nodes": ["check_answered"]
            },
            {
                "id": "check_answered",
                "type": "condition",
                "config": {
                    "field": "call_result.answered",
                    "operator": "equals",
                    "value": true
                },
                "next_nodes": ["analyze_feedback", "whatsapp_fallback"]
            },
            {
                "id": "analyze_feedback",
                "type": "ai_analysis",
                "config": {
                    "model": "gpt-4",
                    "task": "sentiment_analysis"
                },
                "next_nodes": ["save_feedback"]
            },
            {
                "id": "save_feedback",
                "type": "database",
                "config": {
                    "operation": "insert",
                    "table": "customer_feedback"
                },
                "next_nodes": ["end"]
            },
            {
                "id": "whatsapp_fallback",
                "type": "whatsapp",
                "config": {
                    "template": "feedback_survey_whatsapp_ar"
                },
                "next_nodes": ["end"]
            },
            {
                "id": "end",
                "type": "end",
                "config": {}
            }
        ]
    }'::JSONB,
    true
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Trigger workflow execution
CREATE OR REPLACE FUNCTION trigger_workflow(
    p_workflow_id UUID,
    p_trigger_data JSONB
) RETURNS UUID AS $$
DECLARE
    v_execution_id UUID;
BEGIN
    -- Create execution record
    INSERT INTO workflow_executions (
        workflow_id,
        trigger_type,
        trigger_data,
        status
    ) VALUES (
        p_workflow_id,
        (SELECT trigger_type FROM workflow_templates WHERE id = p_workflow_id),
        p_trigger_data,
        'queued'
    ) RETURNING id INTO v_execution_id;

    -- Update workflow stats
    UPDATE workflow_templates
    SET total_executions = total_executions + 1
    WHERE id = p_workflow_id;

    RETURN v_execution_id;
END;
$$ LANGUAGE plpgsql;

-- Auto-trigger on customer exit (sale completion)
CREATE OR REPLACE FUNCTION auto_trigger_customer_feedback() RETURNS TRIGGER AS $$
DECLARE
    v_workflow_id UUID;
BEGIN
    -- Find active customer feedback workflow
    SELECT id INTO v_workflow_id
    FROM workflow_templates
    WHERE trigger_type = 'customer_exit'
      AND is_active = true
    LIMIT 1;

    IF v_workflow_id IS NOT NULL THEN
        -- Trigger workflow
        PERFORM trigger_workflow(
            v_workflow_id,
            jsonb_build_object(
                'customer_id', NEW.customer_id,
                'sale_id', NEW.id,
                'store_id', NEW.store_id,
                'total_amount', NEW.total
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to orders table
CREATE TRIGGER trigger_customer_feedback_workflow
AFTER INSERT ON orders
FOR EACH ROW
WHEN (NEW.status = 'completed' AND NEW.customer_id IS NOT NULL)
EXECUTE FUNCTION auto_trigger_customer_feedback();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Workflow execution summary
CREATE OR REPLACE VIEW v_workflow_execution_summary AS
SELECT
    wt.id as workflow_id,
    wt.name as workflow_name,
    wt.trigger_type,
    COUNT(we.id) as total_executions,
    COUNT(we.id) FILTER (WHERE we.status = 'completed') as completed,
    COUNT(we.id) FILTER (WHERE we.status = 'failed') as failed,
    COUNT(we.id) FILTER (WHERE we.status = 'running') as running,
    AVG(we.duration_seconds) FILTER (WHERE we.status = 'completed') as avg_duration_seconds,
    MAX(we.started_at) as last_execution
FROM workflow_templates wt
LEFT JOIN workflow_executions we ON wt.id = we.workflow_id
GROUP BY wt.id, wt.name, wt.trigger_type;

-- Customer feedback summary
CREATE OR REPLACE VIEW v_customer_feedback_summary AS
SELECT
    cf.feedback_channel,
    cf.language,
    COUNT(*) as total_feedback,
    AVG(cf.rating) as avg_rating,
    COUNT(*) FILTER (WHERE cf.sentiment = 'positive') as positive_count,
    COUNT(*) FILTER (WHERE cf.sentiment = 'neutral') as neutral_count,
    COUNT(*) FILTER (WHERE cf.sentiment = 'negative') as negative_count,
    COUNT(*) FILTER (WHERE cf.needs_followup = true) as needs_followup_count
FROM customer_feedback cf
GROUP BY cf.feedback_channel, cf.language;

-- Top customer concerns
CREATE OR REPLACE VIEW v_top_customer_concerns AS
SELECT
    UNNEST(topics) as topic,
    COUNT(*) as mention_count,
    AVG(rating) as avg_rating,
    COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_mentions
FROM customer_feedback
WHERE topics IS NOT NULL
GROUP BY topic
ORDER BY mention_count DESC
LIMIT 20;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON workflow_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON workflow_executions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON customer_feedback TO authenticated;
GRANT SELECT, INSERT ON customer_contact_log TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'âœ… Workflow Automation System created!';
    RAISE NOTICE 'ğŸ“ Voice call workflows ready';
    RAISE NOTICE 'ğŸ’¬ WhatsApp workflows ready';
    RAISE NOTICE 'ğŸŒ Multi-language support (TR, AR, KU)';
    RAISE NOTICE '';
    RAISE NOTICE 'ğŸ‰ N8N-like automation is ready to use!';
END $$;

