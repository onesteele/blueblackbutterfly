-- Migration: fix onboarding for imported users (v3)
-- auth.identities schema confirmed: id=uuid, provider_id=text NOT NULL, email=text

CREATE OR REPLACE FUNCTION public.set_pending_user_password(user_email TEXT, new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    target_id    UUID;
    auth_exists  BOOLEAN;
BEGIN
    SELECT u.id INTO target_id
    FROM public.users u
    WHERE u.email = LOWER(TRIM(user_email))
    AND u.status = 'pending_verification'
    LIMIT 1;

    IF target_id IS NULL THEN
        RAISE EXCEPTION 'User not found or not pending verification';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM auth.users WHERE id = target_id
    ) INTO auth_exists;

    IF auth_exists THEN
        UPDATE auth.users
        SET encrypted_password = crypt(new_password, gen_salt('bf')),
            updated_at          = NOW()
        WHERE id = target_id;
    ELSE
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            role,
            aud,
            created_at,
            updated_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change
        ) VALUES (
            target_id,
            '00000000-0000-0000-0000-000000000000',
            LOWER(TRIM(user_email)),
            crypt(new_password, gen_salt('bf')),
            NOW(),
            'authenticated',
            'authenticated',
            NOW(),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{}'::jsonb,
            FALSE,
            '',
            '',
            '',
            ''
        );

        -- auth.identities: id=uuid, provider_id=text NOT NULL, email=text
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            email,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            target_id,
            jsonb_build_object('sub', target_id::text, 'email', LOWER(TRIM(user_email))),
            'email',
            LOWER(TRIM(user_email)),
            LOWER(TRIM(user_email)),
            NOW(),
            NOW(),
            NOW()
        )
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_pending_user_password(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.set_pending_user_password(TEXT, TEXT) TO authenticated;
