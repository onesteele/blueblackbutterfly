-- ============================================================================
-- MIGRATION: Add questionnaire message type
-- ============================================================================
-- Run this in the Supabase SQL Editor.
-- Adds 'questionnaire' to the allowed message_type values on chat_messages.
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chk_message_type;
    ALTER TABLE chat_messages ADD CONSTRAINT chk_message_type
        CHECK (message_type IN ('text', 'image', 'link', 'system', 'questionnaire'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
