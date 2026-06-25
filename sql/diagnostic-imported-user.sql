-- Run this in Supabase SQL Editor to diagnose the imported user issue
-- Check what exists for kayla.mcmahan924@gmail.com

-- 1. public.users row
SELECT id, email, status, first_name, last_name
FROM public.users
WHERE email = 'kayla.mcmahan924@gmail.com';

-- 2. auth.users row (does it exist?)
SELECT id, email, email_confirmed_at, created_at, encrypted_password
FROM auth.users
WHERE email = 'kayla.mcmahan924@gmail.com';

-- 3. auth.identities row (does it exist?)
SELECT id, user_id, provider, created_at
FROM auth.identities
WHERE identity_data->>'email' = 'kayla.mcmahan924@gmail.com';

-- 4. Check auth.identities columns (shows exact schema of your Supabase version)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'identities'
ORDER BY ordinal_position;
