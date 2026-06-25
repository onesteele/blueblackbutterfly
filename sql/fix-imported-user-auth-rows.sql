-- Fix existing broken auth.users rows for CSV-imported users
-- Problem 1: email_confirmed_at = null → GoTrue rejects sign-in
-- Problem 2: confirmation_token is non-empty → GoTrue treats account as pending confirmation
-- Run this ONCE to clean up all imported users who went through onboarding

UPDATE auth.users
SET
    email_confirmed_at    = COALESCE(email_confirmed_at, NOW()),
    confirmation_token    = '',
    recovery_token        = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change          = COALESCE(email_change, ''),
    updated_at            = NOW()
WHERE email IN (
    SELECT LOWER(TRIM(email))
    FROM public.users
    WHERE status IN ('pending_verification', 'active')
)
AND (
    email_confirmed_at IS NULL
    OR confirmation_token != ''
);

-- Verify the fix
SELECT
    u.email,
    au.email_confirmed_at,
    au.confirmation_token = '' AS token_cleared,
    au.updated_at
FROM public.users u
JOIN auth.users au ON au.email = LOWER(TRIM(u.email))
WHERE u.status IN ('pending_verification', 'active')
ORDER BY u.email;
