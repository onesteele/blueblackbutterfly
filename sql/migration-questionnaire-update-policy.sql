-- Migration: allow customers to submit questionnaire responses
-- Customers need UPDATE on chat_messages to mark questionnaires as completed.
-- Scoped to questionnaire messages within their own conversation only.

CREATE POLICY "Users can update questionnaire attachments in own conversation"
ON chat_messages
FOR UPDATE
USING (
    message_type = 'questionnaire'
    AND EXISTS (
        SELECT 1 FROM chat_conversations
        WHERE chat_conversations.id = chat_messages.conversation_id
        AND chat_conversations.user_id = auth.uid()
    )
)
WITH CHECK (
    message_type = 'questionnaire'
    AND EXISTS (
        SELECT 1 FROM chat_conversations
        WHERE chat_conversations.id = chat_messages.conversation_id
        AND chat_conversations.user_id = auth.uid()
    )
);

-- Allow questionnaire_completed as a valid message_type
DO $$ BEGIN
    ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chk_message_type;
    ALTER TABLE chat_messages ADD CONSTRAINT chk_message_type
        CHECK (message_type IN ('text', 'image', 'link', 'system', 'questionnaire', 'questionnaire_completed'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
