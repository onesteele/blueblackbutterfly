-- ============================================================================
-- MIGRATION: Onboarding Config + Ticketing System
-- ============================================================================
-- Run this in the Supabase SQL Editor to add:
-- 1. Onboarding config to readable admin_settings keys
-- 2. Ticket system columns on chat_conversations
-- 3. Ticket categories configuration
-- 4. Resend email configuration
-- ============================================================================

-- ============================================================================
-- 1. Allow authenticated users to read onboarding_config from admin_settings
-- ============================================================================
-- Create updated read policy (uses CREATE OR REPLACE via DO block to avoid DROP)
DO $$ BEGIN
    -- Try to drop the old policy first, then recreate with new keys
    BEGIN
        EXECUTE 'DROP POLICY "Anyone can read onboarding config" ON admin_settings';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;

    EXECUTE '
        CREATE POLICY "Anyone can read onboarding config" ON admin_settings
            FOR SELECT USING (key IN (
                ''payment_plans'', ''contract_config'', ''booking_config'',
                ''role_permissions'', ''free_trial_config'', ''onboarding_config'',
                ''ticket_config'', ''resend_config''
            ))';
END $$;

-- ============================================================================
-- 2. Add ticketing columns to chat_conversations
-- ============================================================================
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id);

-- Add check constraint for priority values
DO $$ BEGIN
    ALTER TABLE chat_conversations ADD CONSTRAINT chk_priority
        CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add check constraint for status values (extend existing statuses)
-- Existing statuses: 'open', 'resolved'
-- New statuses: 'in_progress', 'closed'
DO $$ BEGIN
    -- Drop old constraint if exists, then recreate
    ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chk_ticket_status;
    ALTER TABLE chat_conversations ADD CONSTRAINT chk_ticket_status
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 3. Add image/attachment support to chat_messages
-- ============================================================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';

-- message_type: 'text', 'image', 'link', 'system'
DO $$ BEGIN
    ALTER TABLE chat_messages ADD CONSTRAINT chk_message_type
        CHECK (message_type IN ('text', 'image', 'link', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 4. Indexes for ticket queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON chat_conversations(priority);
CREATE INDEX IF NOT EXISTS idx_conversations_category ON chat_conversations(category);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON chat_conversations(status);

-- ============================================================================
-- 5. Seed default ticket configuration
-- ============================================================================
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
    'ticket_config',
    '{
        "categories": [
            {"id": "account_setup", "label": "Account Setup", "description": "Help with setting up your trading account", "priority": "high"},
            {"id": "broker_connection", "label": "Broker Connection", "description": "Issues connecting your broker to TradersPost", "priority": "high"},
            {"id": "algorithm_config", "label": "Algorithm Configuration", "description": "Help configuring algorithm parameters", "priority": "medium"},
            {"id": "performance", "label": "Performance Issues", "description": "Questions about algorithm performance or metrics", "priority": "medium"},
            {"id": "platform_bug", "label": "Platform Bug", "description": "Something on the platform is not working correctly", "priority": "high"},
            {"id": "other", "label": "Other Technical Issue", "description": "Any other technical issue not listed above", "priority": "medium"}
        ],
        "welcome_message": "Welcome to VantageQuant Support! Please select the category that best describes your issue so we can help you as quickly as possible.",
        "auto_reply_message": "Thank you for submitting your ticket. Our support team has been notified and will respond as soon as possible. You will receive an email notification when we reply."
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 6. Seed default onboarding config (3 default videos)
-- ============================================================================
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
    'onboarding_config',
    '{
        "videos": [
            {
                "title": "Welcome to VantageQuant",
                "description": "Learn how to get started with your account and what to expect.",
                "url": "",
                "duration": "120",
                "checkboxes": ["I understand how the onboarding process works"]
            },
            {
                "title": "Setting Up Your Account",
                "description": "Step-by-step guide to setting up your trading account.",
                "url": "",
                "duration": "180",
                "checkboxes": ["I have my account credentials ready", "I have completed the setup steps"]
            },
            {
                "title": "Getting Started with Trading",
                "description": "Learn the basics of using the platform and monitoring your performance.",
                "url": "",
                "duration": "150",
                "checkboxes": ["I understand how to monitor my performance", "I am ready to begin"]
            }
        ]
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 7. Seed Resend email config placeholder
-- ============================================================================
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
    'resend_config',
    '{
        "api_key": "",
        "from_email": "support@vantagequant.com",
        "from_name": "VantageQuant Support",
        "enabled": false
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 8. Create email_log table for tracking sent emails
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    to_email TEXT NOT NULL,
    to_name TEXT,
    subject TEXT NOT NULL,
    template TEXT,
    ticket_id UUID REFERENCES chat_conversations(id),
    status TEXT DEFAULT 'sent',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email log" ON email_log
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (role IN ('owner', 'super_admin', 'admin') OR is_admin = TRUE))
    );

CREATE INDEX IF NOT EXISTS idx_email_log_ticket ON email_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at);
