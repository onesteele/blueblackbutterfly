-- =====================================================
-- FREE TRIAL SYSTEM SETUP
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Insert default free_trial_config into admin_settings
INSERT INTO admin_settings (key, value, updated_at)
VALUES (
    'free_trial_config',
    '{
        "videos": [
            { "title": "Welcome to Your Free Trial", "url": "", "duration": "120", "checkboxes": ["I understand how the free trial works"] },
            { "title": "Setting Up TradeLux", "url": "", "duration": "150", "checkboxes": ["I am ready to set up my TradeLux account"] },
            { "title": "Getting Started with Algorithms", "url": "", "duration": "120", "checkboxes": ["I understand the basics of algorithmic trading"] }
        ],
        "tradelink_url": "https://tradelux.ai/join/8A97B0EA"
    }'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 2. Update RLS policy so authenticated users can read free_trial_config
-- Drop the old policy and recreate with free_trial_config included
DROP POLICY IF EXISTS "Anyone can read onboarding config" ON admin_settings;
CREATE POLICY "Anyone can read onboarding config" ON admin_settings
    FOR SELECT USING (key IN ('payment_plans', 'contract_config', 'booking_config', 'role_permissions', 'free_trial_config'));
