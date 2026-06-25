-- ============================================================================
-- FIX: admin_delete_user — delete all related records before removing user
-- ============================================================================
-- The previous version relied on CASCADE, but several foreign keys were
-- created without ON DELETE CASCADE, causing a 409 Conflict error when
-- trying to delete a user who has chat messages, notifications, etc.
-- ============================================================================

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

    -- Delete from all tables that reference users(id)
    DELETE FROM public.chat_messages WHERE sender_id = target_user_id;
    DELETE FROM public.chat_messages WHERE conversation_id IN (
        SELECT id FROM public.chat_conversations WHERE user_id = target_user_id
    );
    DELETE FROM public.chat_conversations WHERE user_id = target_user_id;
    DELETE FROM public.chat_conversations WHERE assigned_admin_id = target_user_id;
    DELETE FROM public.activity_log WHERE user_id = target_user_id;
    DELETE FROM public.onboarding_progress WHERE user_id = target_user_id;

    -- Nullify author references on content/announcements/notifications (don't delete the content)
    UPDATE public.content_posts SET author_id = NULL WHERE author_id = target_user_id;
    UPDATE public.announcements SET author_id = NULL WHERE author_id = target_user_id;
    UPDATE public.push_notifications SET author_id = NULL WHERE author_id = target_user_id;

    -- Delete from public.users
    DELETE FROM public.users WHERE id = target_user_id;

    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
