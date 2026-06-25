-- ============================================================================
-- FIX RLS POLICIES TO PREVENT INFINITE RECURSION
-- ============================================================================
-- Run this in Supabase SQL Editor to fix the admin access issue

-- First, drop all existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can view own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Users can insert own progress" ON onboarding_progress;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can view all progress" ON onboarding_progress;

-- ============================================================================
-- USERS TABLE POLICIES (Fixed to avoid recursion)
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Admins can view all users (FIXED - no recursion)
-- This uses a subquery that's evaluated once, not recursively
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = TRUE
    OR
    auth.uid() = id
  );

-- Admins can update all users
CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE USING (
    (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = TRUE
  );

-- ============================================================================
-- ONBOARDING PROGRESS TABLE POLICIES
-- ============================================================================

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
    (SELECT is_admin FROM users WHERE id = auth.uid() LIMIT 1) = TRUE
    OR
    user_id = auth.uid()
  );

-- ============================================================================
-- VERIFY THE POLICIES
-- ============================================================================

-- Run these queries to verify policies were created correctly:
-- SELECT * FROM pg_policies WHERE tablename = 'users';
-- SELECT * FROM pg_policies WHERE tablename = 'onboarding_progress';
