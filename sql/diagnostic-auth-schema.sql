-- Check exact auth.users schema and any NOT NULL columns we might be missing
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'users'
ORDER BY ordinal_position;

-- Check what a REAL auth user row looks like vs our manually created one
-- (replace with an email that works fine - a non-imported user)
SELECT
    id,
    email,
    email_confirmed_at,
    encrypted_password IS NOT NULL as has_password,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    aud,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    created_at
FROM auth.users
WHERE email IN ('kayla.mcmahan924@gmail.com', 'emadabdullah911@gmail.com')
ORDER BY created_at;
