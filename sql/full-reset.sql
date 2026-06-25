-- ============================================================================
-- VantageQuant - FULL DATABASE RESET
-- ============================================================================
-- This drops ALL new tables/policies and recreates everything cleanly.
-- Your existing users and onboarding_progress data will be KEPT.
-- Run this ONE script in Supabase SQL Editor - it replaces all other SQL files.
-- ============================================================================


-- ============================================================================
-- STEP 1: DROP ALL EXISTING POLICIES (safe even if they don't exist)
-- ============================================================================

-- Users table policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

-- Onboarding progress policies
DROP POLICY IF EXISTS "Users can view own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Admins can view all progress" ON onboarding_progress;

-- Activity log policies
DROP POLICY IF EXISTS "Users can insert own activity" ON activity_log;
DROP POLICY IF EXISTS "Users can view own activity" ON activity_log;

-- Announcements policies
DROP POLICY IF EXISTS "Anyone can view published announcements" ON announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON announcements;

-- Content posts policies
DROP POLICY IF EXISTS "Anyone can view published content" ON content_posts;
DROP POLICY IF EXISTS "Admins can manage content" ON content_posts;

-- Chat conversations policies
DROP POLICY IF EXISTS "Users can view own conversations" ON chat_conversations;
DROP POLICY IF EXISTS "Users can insert own conversations" ON chat_conversations;
DROP POLICY IF EXISTS "Admins can manage all conversations" ON chat_conversations;

-- Chat messages policies
DROP POLICY IF EXISTS "Users can view messages in own conversation" ON chat_messages;
DROP POLICY IF EXISTS "Users can send messages in own conversation" ON chat_messages;
DROP POLICY IF EXISTS "Admins can manage all messages" ON chat_messages;

-- Workflows policies
DROP POLICY IF EXISTS "Admins can manage workflows" ON workflows;
DROP POLICY IF EXISTS "Admins can manage workflow executions" ON workflow_executions;

-- Notifications policies
DROP POLICY IF EXISTS "Users can view targeted notifications" ON push_notifications;
DROP POLICY IF EXISTS "Admins can manage notifications" ON push_notifications;

-- Admin settings policies
DROP POLICY IF EXISTS "Admins can manage settings" ON admin_settings;


-- ============================================================================
-- STEP 2: DROP ALL NEW TABLES (order matters due to foreign keys)
-- ============================================================================
DROP TABLE IF EXISTS workflow_executions CASCADE;
DROP TABLE IF EXISTS workflows CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_conversations CASCADE;
DROP TABLE IF EXISTS content_posts CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS push_notifications CASCADE;
DROP TABLE IF EXISTS admin_settings CASCADE;


-- ============================================================================
-- STEP 3: DROP OLD TRIGGERS AND FUNCTIONS
-- ============================================================================
DROP TRIGGER IF EXISTS protect_default_admin_trigger ON users;
DROP FUNCTION IF EXISTS public.protect_default_admin();
DROP FUNCTION IF EXISTS public.admin_confirm_user_email(UUID);


-- ============================================================================
-- STEP 4: CREATE/REPLACE the admin check function (no recursion)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_user_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(role, 'user') IN ('owner', 'super_admin', 'admin', 'sales_team')
    FROM public.users
    WHERE id = user_id
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO anon;


-- ============================================================================
-- STEP 5: ADD NEW COLUMNS TO USERS TABLE (keeps existing data)
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'onboarding';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);


-- ============================================================================
-- STEP 6: USERS TABLE RLS POLICIES
-- ============================================================================
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (public.is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 7: ONBOARDING PROGRESS RLS POLICIES
-- ============================================================================
CREATE POLICY "Users can view own progress" ON onboarding_progress
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own progress" ON onboarding_progress
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert own progress" ON onboarding_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all progress" ON onboarding_progress
  FOR SELECT USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 8: CREATE ACTIVITY LOG TABLE
-- ============================================================================
CREATE TABLE activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    page TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_action ON activity_log(action);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own activity" ON activity_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own activity" ON activity_log
    FOR SELECT USING (auth.uid() = user_id OR public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 9: CREATE ANNOUNCEMENTS TABLE
-- ============================================================================
CREATE TABLE announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES users(id),
    is_published BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_announcements_published ON announcements(is_published, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published announcements" ON announcements
    FOR SELECT USING (is_published = TRUE OR public.is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Admins can manage announcements" ON announcements
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 10: CREATE CONTENT POSTS TABLE
-- ============================================================================
CREATE TABLE content_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    category TEXT DEFAULT 'general',
    is_published BOOLEAN DEFAULT FALSE,
    author_id UUID REFERENCES users(id),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_content_posts_published ON content_posts(is_published, sort_order);

ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published content" ON content_posts
    FOR SELECT USING (is_published = TRUE OR public.is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Admins can manage content" ON content_posts
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 11: CREATE CHAT CONVERSATIONS TABLE
-- ============================================================================
CREATE TABLE chat_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    status TEXT DEFAULT 'open',
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_preview TEXT,
    admin_unread_count INTEGER DEFAULT 0,
    user_unread_count INTEGER DEFAULT 0,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_last_msg ON chat_conversations(last_message_at DESC);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON chat_conversations
    FOR SELECT USING (auth.uid() = user_id OR public.is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Users can insert own conversations" ON chat_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Admins can manage all conversations" ON chat_conversations
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 12: CREATE CHAT MESSAGES TABLE
-- ============================================================================
CREATE TABLE chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    sender_type TEXT DEFAULT 'customer',
    content TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in own conversation" ON chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_conversations
            WHERE chat_conversations.id = chat_messages.conversation_id
            AND (chat_conversations.user_id = auth.uid() OR public.is_user_admin(auth.uid()) = TRUE)
        )
    );

CREATE POLICY "Users can send messages in own conversation" ON chat_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM chat_conversations
            WHERE chat_conversations.id = chat_messages.conversation_id
            AND (chat_conversations.user_id = auth.uid() OR public.is_user_admin(auth.uid()) = TRUE)
        )
    );

CREATE POLICY "Admins can manage all messages" ON chat_messages
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 13: CREATE WORKFLOWS TABLE
-- ============================================================================
CREATE TABLE workflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    webhook_url TEXT NOT NULL,
    trigger_type TEXT DEFAULT 'manual',
    trigger_config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows" ON workflows
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 14: CREATE WORKFLOW EXECUTIONS TABLE
-- ============================================================================
CREATE TABLE workflow_executions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    response JSONB DEFAULT '{}'::jsonb,
    triggered_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_workflow_executions_workflow ON workflow_executions(workflow_id, created_at DESC);

ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflow executions" ON workflow_executions
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 15: CREATE PUSH NOTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE push_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target TEXT DEFAULT 'all',
    is_read_by JSONB DEFAULT '[]'::jsonb,
    author_id UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_push_notifications_active ON push_notifications(created_at DESC);

ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view targeted notifications" ON push_notifications
    FOR SELECT USING (
        target = 'all'
        OR target = (SELECT status FROM users WHERE id = auth.uid())
        OR target = auth.uid()::text
        OR public.is_user_admin(auth.uid()) = TRUE
    );

CREATE POLICY "Admins can manage notifications" ON push_notifications
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 16: CREATE ADMIN SETTINGS TABLE
-- ============================================================================
CREATE TABLE admin_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON admin_settings
    FOR ALL USING (public.is_user_admin(auth.uid()) = TRUE);


-- ============================================================================
-- STEP 17: UPDATE handle_new_user TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, full_name, phone, ip_address, created_at, last_login, is_admin, onboarding_completed, status, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(
            NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', '')), ''),
            NEW.email
        ),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'ip_address', ''),
        NOW(),
        NOW(),
        FALSE,
        FALSE,
        'onboarding',
        'user'
    );

    INSERT INTO public.onboarding_progress (user_id, completed_steps, watched_videos, checked_items)
    VALUES (NEW.id, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb);

    RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();


-- ============================================================================
-- STEP 18: ADMIN EMAIL AUTO-CONFIRM FUNCTION
-- ============================================================================
-- Allows admins to create users that bypass email verification

CREATE OR REPLACE FUNCTION public.admin_confirm_user_email(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can confirm user emails.';
  END IF;

  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_confirm_user_email(UUID) TO authenticated;


-- ============================================================================
-- STEP 19: PROTECT DEFAULT ADMIN
-- ============================================================================
-- Prevents removing admin from steeleblue07@gmail.com or changing their email

CREATE OR REPLACE FUNCTION public.protect_default_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Protect default owner: cannot remove admin flag
  IF OLD.email = 'steeleblue07@gmail.com' AND OLD.is_admin = TRUE AND NEW.is_admin = FALSE THEN
    RAISE EXCEPTION 'Cannot remove admin privileges from the default admin account.';
  END IF;

  -- Protect default owner: cannot change email
  IF OLD.email = 'steeleblue07@gmail.com' AND NEW.email != 'steeleblue07@gmail.com' THEN
    RAISE EXCEPTION 'Cannot change the email of the default admin account.';
  END IF;

  -- Protect default owner: cannot change role away from owner
  IF OLD.email = 'steeleblue07@gmail.com' AND OLD.role = 'owner' AND NEW.role != 'owner' THEN
    RAISE EXCEPTION 'Cannot change the role of the default owner account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_default_admin_trigger ON users;
CREATE TRIGGER protect_default_admin_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_default_admin();


-- ============================================================================
-- STEP 20: DATA MIGRATION - Set roles for existing users
-- ============================================================================
-- Owner: steeleblue07@gmail.com gets 'owner' role
-- Existing admins get 'admin' role
-- Everyone else stays 'user'

UPDATE users SET role = 'owner' WHERE email = 'steeleblue07@gmail.com';
UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND email != 'steeleblue07@gmail.com' AND (role IS NULL OR role = 'user');


-- ============================================================================
-- STEP 21: Chat display names & performance data
-- ============================================================================

-- Chat display name for admin aliases (appears in chat instead of real name)
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_display_name TEXT;

-- Per-message display name override (for admin identity switching)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS display_name_override TEXT;

-- Allow authenticated users to read performance_data from admin_settings
CREATE POLICY "Authenticated users can read performance data" ON admin_settings
    FOR SELECT USING (key = 'performance_data' AND auth.uid() IS NOT NULL);

-- Enable Realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;


-- ============================================================================
-- STEP 22: Ticket system - allow multiple conversations per user
-- ============================================================================

-- Remove UNIQUE constraint on user_id to allow multiple tickets per user
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_user_id_key;

-- Add ticket-specific columns
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS ticket_number SERIAL;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Support Request';

-- Index for ticket number (unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_ticket ON chat_conversations(ticket_number);

-- Index for user conversations (no longer unique)
DROP INDEX IF EXISTS idx_chat_conversations_user;
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_created ON chat_conversations(user_id, created_at DESC);


-- ============================================================================
-- STEP 23: AI chat support, escalation tracking, and user tags
-- ============================================================================

-- Conversation handler tracking (AI vs human)
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS handler_type TEXT DEFAULT 'ai';
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'ai';
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES users(id);

-- AI message flag on chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_ai_message BOOLEAN DEFAULT FALSE;

-- User tags (JSONB array, separate from lifecycle status)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Indexes for admin filtering
CREATE INDEX IF NOT EXISTS idx_chat_conversations_handler ON chat_conversations(handler_type);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_category ON chat_conversations(category);

-- AI chat configuration seed
INSERT INTO admin_settings (key, value)
VALUES ('ai_chat_config', '{"enabled": true, "webhook_url": "", "greeting_message": "Hi! How can I help you today?", "ai_display_name": "Support Team", "auto_escalation_keywords": ["refund", "cancel", "dispute", "chargeback"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Backfill existing conversations as human-handled
UPDATE chat_conversations
SET handler_type = 'human',
    category = CASE WHEN status = 'resolved' THEN 'resolved' ELSE 'open' END
WHERE handler_type IS NULL OR handler_type = 'ai';


-- ============================================================================
-- STEP 24: Enable realtime + UPDATE policy for push_notifications
-- ============================================================================

-- Allow real-time subscriptions on push_notifications
ALTER PUBLICATION supabase_realtime ADD TABLE push_notifications;

-- Allow regular users to update is_read_by (dismiss notifications)
CREATE POLICY "Users can dismiss notifications" ON push_notifications
    FOR UPDATE USING (
        target = 'all'
        OR target = (SELECT status FROM users WHERE id = auth.uid())
        OR target = auth.uid()::text
    )
    WITH CHECK (
        target = 'all'
        OR target = (SELECT status FROM users WHERE id = auth.uid())
        OR target = auth.uid()::text
    );


-- ============================================================================
-- STEP 25: Onboarding overhaul - payment, verification, contract fields
-- ============================================================================

-- New columns on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_plan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_total DECIMAL(10,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_down DECIMAL(10,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contract_signature TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guarantee_opted_in BOOLEAN DEFAULT FALSE;

-- Seed payment plan options (configurable by super admin)
INSERT INTO admin_settings (id, key, value, updated_at)
VALUES (gen_random_uuid(), 'payment_plans', '{"options": [{"id": "pay_in_full", "label": "Pay in Full"}, {"id": "klarna", "label": "Klarna"}, {"id": "split_it", "label": "Split It"}, {"id": "in_house_financing", "label": "In-House Financing"}]}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- Seed contract config (configurable by super admin)
INSERT INTO admin_settings (id, key, value, updated_at)
VALUES (gen_random_uuid(), 'contract_config', '{"contract_url": "", "guarantee_label": "90-Day Refund Protection Guarantee"}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- Seed booking config (configurable by super admin)
INSERT INTO admin_settings (id, key, value, updated_at)
VALUES (gen_random_uuid(), 'booking_config', '{"booking_url": "https://scheduling.vantagequant.com/book.html?slug=algorithm-alignment-call"}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- Seed default role permissions (configurable by owner/super_admin)
INSERT INTO admin_settings (id, key, value, updated_at)
VALUES (gen_random_uuid(), 'role_permissions', '{
  "admin": {
    "create_users": true, "delete_users": false, "change_status": true,
    "view_metrics": true, "manage_content": true, "manage_announcements": true,
    "manage_workflows": true, "manage_notifications": true,
    "view_conversations": true, "view_settings": false
  },
  "sales_team": {
    "create_users": true, "delete_users": false, "change_status": false,
    "view_metrics": false, "manage_content": false, "manage_announcements": false,
    "manage_workflows": false, "manage_notifications": false,
    "view_conversations": true, "view_settings": false
  }
}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- Allow anyone to read onboarding config (needed before auth on onboarding page)
CREATE POLICY "Anyone can read onboarding config" ON admin_settings
    FOR SELECT USING (key IN ('payment_plans', 'contract_config', 'booking_config', 'role_permissions'));

-- RPC: Lookup pending verification user by email (callable by anon for onboarding entry)
CREATE OR REPLACE FUNCTION public.lookup_pending_user(user_email TEXT)
RETURNS TABLE(id UUID, first_name TEXT, last_name TEXT, email TEXT, phone TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone
    FROM users u
    WHERE u.email = LOWER(TRIM(user_email))
    AND u.status = 'pending_verification'
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_pending_user(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_pending_user(TEXT) TO authenticated;

-- RPC: Set password for pending verification user (callable by anon during onboarding)
CREATE OR REPLACE FUNCTION public.set_pending_user_password(user_email TEXT, new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    target_id UUID;
BEGIN
    -- Only works for pending_verification users
    SELECT u.id INTO target_id
    FROM public.users u
    WHERE u.email = LOWER(TRIM(user_email))
    AND u.status = 'pending_verification';

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'User not found or not pending verification';
    END IF;

    -- Update the auth user's password
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = target_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_pending_user_password(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.set_pending_user_password(TEXT, TEXT) TO authenticated;

-- Update handle_new_user trigger to support initial_status from metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, full_name, phone, ip_address, created_at, last_login, is_admin, onboarding_completed, status, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(
            NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', '')), ''),
            NEW.email
        ),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'ip_address', ''),
        NOW(),
        NOW(),
        FALSE,
        FALSE,
        COALESCE(NEW.raw_user_meta_data->>'initial_status', 'onboarding'),
        'user'
    );

    INSERT INTO public.onboarding_progress (user_id, completed_steps, watched_videos, checked_items)
    VALUES (NEW.id, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- RPC: Admin delete user (removes from both auth.users and public.users)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify caller is admin
    IF NOT public.is_user_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Delete from public.users (cascade will handle related rows)
    DELETE FROM public.users WHERE id = target_user_id;

    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;

-- Storage bucket for verification photos
-- NOTE: Run this in Supabase SQL Editor. If the bucket already exists, these will safely skip.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-photos', 'verification-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop existing storage policies if they exist (safe cleanup)
DROP POLICY IF EXISTS "Users upload own photo" ON storage.objects;
DROP POLICY IF EXISTS "Users view own photo" ON storage.objects;
DROP POLICY IF EXISTS "Admins view all photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view verification photos" ON storage.objects;

-- Allow authenticated users to upload their own photo
CREATE POLICY "Users upload own photo" ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'verification-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow anyone to view photos (bucket is public for profile pictures)
CREATE POLICY "Anyone can view verification photos" ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'verification-photos');


-- ============================================================================
-- DONE! You should see "Success. No rows returned" - that's normal.
-- ============================================================================
-- All tables, policies, functions, and triggers are now set up.
-- Your existing users and onboarding_progress data is preserved.
