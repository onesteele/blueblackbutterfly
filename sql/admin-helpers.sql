-- ============================================================================
-- ADMIN HELPER FUNCTIONS
-- Run this in Supabase SQL Editor AFTER migration-v3.sql
-- ============================================================================

-- ============================================================================
-- 1. AUTO-CONFIRM USER EMAIL (for admin-created users)
-- ============================================================================
-- This function allows admins to create users that can log in immediately
-- without email verification. Called from the admin panel after signUp().

CREATE OR REPLACE FUNCTION public.admin_confirm_user_email(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Verify the caller is an admin
  IF NOT public.is_user_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can confirm user emails.';
  END IF;

  -- Update auth.users to confirm the email
  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users.';
  END IF;

  RETURN TRUE;
END;
$$;

-- Grant execute to authenticated users (admin check is inside the function)
GRANT EXECUTE ON FUNCTION public.admin_confirm_user_email(UUID) TO authenticated;


-- ============================================================================
-- 2. PROTECT DEFAULT ADMIN FROM DEMOTION
-- ============================================================================
-- Prevents anyone from removing admin privileges from steeleblue07@gmail.com
-- or changing that account's email address.

CREATE OR REPLACE FUNCTION public.protect_default_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block removing admin from default admin
  IF OLD.email = 'steeleblue07@gmail.com' AND OLD.is_admin = TRUE AND NEW.is_admin = FALSE THEN
    RAISE EXCEPTION 'Cannot remove admin privileges from the default admin account.';
  END IF;

  -- Block changing default admin's email
  IF OLD.email = 'steeleblue07@gmail.com' AND NEW.email != 'steeleblue07@gmail.com' THEN
    RAISE EXCEPTION 'Cannot change the email of the default admin account.';
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
-- VERIFICATION
-- ============================================================================
-- Test default admin protection (should fail):
-- UPDATE users SET is_admin = false WHERE email = 'steeleblue07@gmail.com';
--
-- Test email confirmation (replace UUID with an actual user id):
-- SELECT admin_confirm_user_email('some-user-uuid-here');
