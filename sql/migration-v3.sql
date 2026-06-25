-- ============================================================
-- VantageQuant CRM MIGRATION v3
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. ALTER EXISTING USERS TABLE
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'onboarding';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ============================================================
-- 2. ACTIVITY LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    page TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);

-- ============================================================
-- 3. ANNOUNCEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id UUID REFERENCES users(id),
    is_published BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(is_published, created_at DESC);

-- ============================================================
-- 4. CONTENT POSTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS content_posts (
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

CREATE INDEX IF NOT EXISTS idx_content_posts_published ON content_posts(is_published, sort_order);

-- ============================================================
-- 5. CHAT CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_msg ON chat_conversations(last_message_at DESC);

-- ============================================================
-- 6. CHAT MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);

-- ============================================================
-- 7. WORKFLOWS TABLE (N8N Integration)
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    webhook_url TEXT NOT NULL,
    trigger_type TEXT DEFAULT 'manual',
    trigger_config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 8. WORKFLOW EXECUTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    status TEXT DEFAULT 'pending',
    response JSONB DEFAULT '{}'::jsonb,
    triggered_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id, created_at DESC);

-- ============================================================
-- 9. PUSH NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target TEXT DEFAULT 'all',
    is_read_by JSONB DEFAULT '[]'::jsonb,
    author_id UUID REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notifications_active ON push_notifications(created_at DESC);

-- ============================================================
-- 10. ADMIN SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 11. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Activity Log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own activity" ON activity_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own activity" ON activity_log
    FOR SELECT USING (auth.uid() = user_id OR is_user_admin(auth.uid()) = TRUE);

-- Announcements
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published announcements" ON announcements
    FOR SELECT USING (is_published = TRUE OR is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Admins can manage announcements" ON announcements
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Content Posts
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published content" ON content_posts
    FOR SELECT USING (is_published = TRUE OR is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Admins can manage content" ON content_posts
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Chat Conversations
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON chat_conversations
    FOR SELECT USING (auth.uid() = user_id OR is_user_admin(auth.uid()) = TRUE);

CREATE POLICY "Users can insert own conversations" ON chat_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all conversations" ON chat_conversations
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Chat Messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in own conversation" ON chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chat_conversations
            WHERE chat_conversations.id = chat_messages.conversation_id
            AND (chat_conversations.user_id = auth.uid() OR is_user_admin(auth.uid()) = TRUE)
        )
    );

CREATE POLICY "Users can send messages in own conversation" ON chat_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM chat_conversations
            WHERE chat_conversations.id = chat_messages.conversation_id
            AND (chat_conversations.user_id = auth.uid() OR is_user_admin(auth.uid()) = TRUE)
        )
    );

CREATE POLICY "Admins can manage all messages" ON chat_messages
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Workflows
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows" ON workflows
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Workflow Executions
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflow executions" ON workflow_executions
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Push Notifications
ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view targeted notifications" ON push_notifications
    FOR SELECT USING (
        target = 'all'
        OR target = (SELECT status FROM users WHERE id = auth.uid())
        OR target = auth.uid()::text
        OR is_user_admin(auth.uid()) = TRUE
    );

CREATE POLICY "Admins can manage notifications" ON push_notifications
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- Admin Settings
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON admin_settings
    FOR ALL USING (is_user_admin(auth.uid()) = TRUE);

-- ============================================================
-- 12. UPDATE handle_new_user TRIGGER (add new columns)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, phone, ip_address, created_at, last_login, is_admin, onboarding_completed, status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'ip_address', ''),
        NOW(),
        NOW(),
        FALSE,
        FALSE,
        'onboarding'
    );

    INSERT INTO public.onboarding_progress (user_id, completed_steps, watched_videos, checked_items)
    VALUES (NEW.id, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb);

    RETURN NEW;
END;
$$;
