-- ============================================================================
-- BETTER FIX FOR RLS POLICIES - Using Security Definer Function
-- ============================================================================
-- This approach uses a function that bypasses RLS to check admin status
-- Run this in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Create a security definer function to check admin status
-- ============================================================================
-- This function bypasses RLS and can safely check admin status
CREATE OR REPLACE FUNCTION public.is_user_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- This bypasses RLS
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(is_admin, FALSE)
    FROM public.users
    WHERE id = user_id
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- STEP 2: Drop all existing policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can view all progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Admins can update all users" ON users;

-- ============================================================================
-- STEP 3: Create new policies using the security definer function
-- ============================================================================

-- USERS TABLE POLICIES
-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can view all users (using security definer function - NO RECURSION!)
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    public.is_user_admin(auth.uid()) = TRUE
    OR
    auth.uid() = id
  );

-- Admins can update all users
CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE USING (
    public.is_user_admin(auth.uid()) = TRUE
  );

-- ONBOARDING PROGRESS TABLE POLICIES
-- Users can view their own progress
CREATE POLICY "Users can view own progress" ON onboarding_progress
  FOR SELECT USING (user_id = auth.uid());

-- Users can update their own progress
CREATE POLICY "Users can update own progress" ON onboarding_progress
  FOR UPDATE USING (user_id = auth.uid());

-- Users can insert their own progress
CREATE POLICY "Users can insert own progress" ON onboarding_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admins can view all progress
CREATE POLICY "Admins can view all progress" ON onboarding_progress
  FOR SELECT USING (
    public.is_user_admin(auth.uid()) = TRUE
    OR
    user_id = auth.uid()
  );

-- ============================================================================
-- STEP 4: Grant execute permission on the function
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO anon;

-- ============================================================================
-- STEP 5: Protect default admin from demotion
-- ============================================================================
-- This trigger prevents anyone from removing admin privileges from the
-- default admin account (steeleblue07@gmail.com) via any method.

CREATE OR REPLACE FUNCTION public.protect_default_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If someone is trying to set is_admin = false on the default admin, block it
  IF OLD.email = 'steeleblue07@gmail.com' AND OLD.is_admin = TRUE AND NEW.is_admin = FALSE THEN
    RAISE EXCEPTION 'Cannot remove admin privileges from the default admin account.';
  END IF;

  -- Also prevent changing the default admin's email (to bypass the protection)
  IF OLD.email = 'steeleblue07@gmail.com' AND NEW.email != 'steeleblue07@gmail.com' THEN
    RAISE EXCEPTION 'Cannot change the email of the default admin account.';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop the trigger if it already exists, then create it
DROP TRIGGER IF EXISTS protect_default_admin_trigger ON users;
CREATE TRIGGER protect_default_admin_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_default_admin();

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Run these to verify everything is working:
-- SELECT * FROM pg_policies WHERE tablename IN ('users', 'onboarding_progress');
-- SELECT public.is_user_admin(auth.uid());
-- Test default admin protection:
-- UPDATE users SET is_admin = false WHERE email = 'steeleblue07@gmail.com';
-- ^ This should fail with: "Cannot remove admin privileges from the default admin account."

-- ============================================================================
-- SUCCESS!
-- ============================================================================
-- The security definer function bypasses RLS, so there's no more recursion.
-- The default admin (steeleblue07@gmail.com) is protected at the database level.
-- Now sign out, clear cookies, and sign back in to test admin access.
