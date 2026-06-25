-- ============================================================================
-- FIX: Admin Settings RLS + ticket_number sequence
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add ai_chat_config to the readable keys policy so the chat widget
--    can load the display name and greeting without a 406 error.
DO $$ BEGIN
    BEGIN
        EXECUTE 'DROP POLICY "Anyone can read onboarding config" ON admin_settings';
    EXCEPTION WHEN undefined_object THEN NULL;
    END;

    EXECUTE '
        CREATE POLICY "Anyone can read onboarding config" ON admin_settings
            FOR SELECT USING (key IN (
                ''payment_plans'', ''contract_config'', ''booking_config'',
                ''role_permissions'', ''free_trial_config'', ''onboarding_config'',
                ''ticket_config'', ''resend_config'', ''ai_chat_config'', ''support_availability''
            ))';
END $$;

-- 2. Seed a default ai_chat_config row if one does not already exist,
--    so the widget always has something to read.
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
    'ai_chat_config',
    '{
        "enabled": true,
        "ai_display_name": "Support Team",
        "greeting_message": "Hi! How can we help you today?",
        "webhook_url": ""
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 3. Seed a default support_availability row (schedule-based) if one does not exist.
--    If the old manual-status row already exists, leave it alone — the widget handles
--    the legacy format gracefully and the admin can re-save to upgrade it.
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
    'support_availability',
    '{
        "days": [1,2,3,4,5],
        "start_time": "09:00",
        "end_time": "17:00",
        "timezone": "America/New_York",
        "hours_display": "Mon\u2013Fri, 9am\u20135pm ET"
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 4. Add ticket_number as an auto-incrementing column if it does not exist.
DO $$ BEGIN
    ALTER TABLE chat_conversations ADD COLUMN ticket_number SERIAL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
