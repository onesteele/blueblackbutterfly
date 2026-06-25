-- Migration: fix handle_new_user trigger for imported users
-- Problem: imported users already have a row in public.users.
-- When set_pending_user_password inserts into auth.users, this trigger fires
-- and tries to INSERT into public.users again — causing a duplicate key violation
-- that Supabase surfaces as "Database error querying schema".
-- Fix: use ON CONFLICT DO NOTHING on both inserts.

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
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.onboarding_progress (user_id, completed_steps, watched_videos, checked_items)
    VALUES (NEW.id, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$;
