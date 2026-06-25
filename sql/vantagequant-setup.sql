-- ============================================================================
-- VantageQuant setup — run ONCE in the Supabase SQL Editor
-- (Dashboard > SQL Editor > New query > paste > Run)
--
-- This shares the existing Profit Insider Supabase project but keeps
-- VantageQuant's data + config logically separate:
--   * users.brand column tags which brand each signup belongs to
--   * VantageQuant reads its own *_vq config keys in admin_settings
-- Safe to re-run (idempotent). Does NOT touch Profit Insider's rows/config.
-- ============================================================================

-- 1) Brand tag on users -------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'profit_insider';
UPDATE public.users SET brand = 'profit_insider' WHERE brand IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_brand ON public.users (brand);

-- 2) VantageQuant trial / onboarding / contract config ------------------------
-- ON CONFLICT DO NOTHING so re-running never overwrites edits you make later
-- in the VantageQuant admin (Settings page writes to these same *_vq keys).

INSERT INTO public.admin_settings (key, value, updated_at) VALUES
(
  'free_trial_config_vq',
  '{
    "videos": [
      { "url": "https://www.loom.com/embed/69293e8ee1c247ffad6f0ca5e1cdd0a1", "title": "Welcome to Your VantageQuant Free Trial", "duration": "1260", "checkboxes": ["I am serious and ready to get started"] },
      { "url": "https://www.loom.com/embed/3fe83269c2fc4315907a3d494b57383b", "title": "Acquiring Prop Accounts & Configuring TradeLux", "duration": "1140", "checkboxes": ["I followed the video & my TradeLux account is set up / I will set this up after the full onboarding."] },
      { "url": "https://www.loom.com/embed/e36bdc622bec45cd9f2a26d6091df8b6", "title": "Are You Ready To Win?", "duration": "448", "checkboxes": ["I am ready, I am serious, I am willing to change my perspective to develop an algorithmic edge"] }
    ],
    "tradelink_url": "https://tradelux.ai/join/8A97B0EA",
    "video2_button_url": "https://tradelux.ai/join/8A97B0EA",
    "video2_button_text": "Create TradeLux Account"
  }'::jsonb,
  now()
),
(
  'onboarding_config_vq',
  '{
    "videos": [
      { "url": "https://www.loom.com/embed/7a021c34dbac42228787088888612cf2", "title": "Welcome to The Team", "duration": "376", "checkboxes": ["I understand how the client portal works and I am ready and serious to begin."], "description": "Learn how to get started with your account and what to expect." },
      { "url": "https://www.loom.com/embed/b88fa7306e0f44d1bb45e6f27a0de761", "title": "The Technicals & What to Expect", "duration": "800", "checkboxes": ["I understand how these systems operate & I know how to leverage them for my use case."], "description": "A breakdown of how we leverage these algorithms to achieve performative results." },
      { "url": "https://www.loom.com/embed/f5ee3da306784125b4a45c04677c7792", "title": "How to Set Up Accounts & TradeLux", "duration": "900", "checkboxes": ["I have my account connected to TradeLux & I am linked to a strategy."], "description": "A full walkthrough of how to acquire prop firm accounts at low cost and set up TradeLux." }
    ],
    "video3_button_url": "https://tradelux.ai/join/8A97B0EA",
    "video3_button_text": "Create Your TradeLux Account"
  }'::jsonb,
  now()
),
(
  'contract_config_vq',
  '{
    "contract_url": "/legal/contract.html",
    "guarantee_label": "90-Day Refund Protection Guarantee"
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 2b) Allow trial users to READ the new *_vq config keys ----------------------
-- admin_settings has a public-read whitelist policy; the trial/onboarding pages
-- run as a logged-in trial user and must be able to read these keys. Recreate
-- the policy with the existing keys + the VantageQuant *_vq keys added.
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
                ''ticket_config'', ''resend_config'', ''ai_chat_config'', ''support_availability'',
                ''free_trial_config_vq'', ''contract_config_vq'', ''onboarding_config_vq''
            ))';
END $$;

-- 3) (Optional) convenience view of VantageQuant users only -------------------
CREATE OR REPLACE VIEW public.vq_users AS
  SELECT * FROM public.users WHERE brand = 'vantagequant';

-- Done. After running this, VantageQuant signups via /quanttrial/ will be
-- tagged brand='vantagequant' and the trial flow will use the *_vq config.
