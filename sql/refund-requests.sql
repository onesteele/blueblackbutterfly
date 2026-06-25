-- =====================================================
-- REFUND REQUESTS SCHEMA
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Create the refund_requests table
CREATE TABLE IF NOT EXISTS refund_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference_number TEXT NOT NULL UNIQUE,

    -- Personal info
    email TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,

    -- Purchase details
    amount_paid NUMERIC(10,2),
    purchase_date DATE,
    payment_method TEXT,
    start_date DATE,

    -- Compliance fields
    setup_compliance TEXT,        -- 'yes', 'mostly', 'no'
    usage_duration TEXT,          -- '90+', '60-89', '30-59', '<30'
    used_tradepost BOOLEAN,
    broker TEXT,
    broker_id TEXT,

    -- Refund reason
    reason TEXT,
    explanation TEXT,

    -- Verification
    verification_type TEXT,       -- 'photo_id' or 'selfie'

    -- Compliance tracking
    compliance_flags TEXT[] DEFAULT '{}',
    compliant BOOLEAN DEFAULT true,

    -- File paths (JSONB storing paths in storage bucket)
    file_paths JSONB DEFAULT '{}',

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'denied')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_refund_requests_email ON refund_requests(email);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created ON refund_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_requests_ref ON refund_requests(reference_number);

-- 3. Enable RLS
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Allow anonymous inserts (public form submissions)
CREATE POLICY "Allow public inserts on refund_requests"
    ON refund_requests
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Allow anonymous reads (for the admin viewer page - password-gated in the UI)
CREATE POLICY "Allow public reads on refund_requests"
    ON refund_requests
    FOR SELECT
    TO anon
    USING (true);

-- Allow anonymous updates (for status changes from admin viewer)
CREATE POLICY "Allow public updates on refund_requests"
    ON refund_requests
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- 5. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_refund_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_refund_requests_updated_at ON refund_requests;
CREATE TRIGGER trigger_update_refund_requests_updated_at
    BEFORE UPDATE ON refund_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_refund_requests_updated_at();

-- =====================================================
-- STORAGE BUCKET
-- Note: Run this OR create the bucket manually in the
-- Supabase Dashboard under Storage > New Bucket
-- =====================================================

-- Create the storage bucket for refund files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'refund-files',
    'refund-files',
    false,
    10485760,  -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Allow anonymous uploads to refund-files bucket
CREATE POLICY "Allow public uploads to refund-files"
    ON storage.objects
    FOR INSERT
    TO anon
    WITH CHECK (bucket_id = 'refund-files');

-- Storage RLS: Allow anonymous reads from refund-files bucket (for admin viewer)
CREATE POLICY "Allow public reads from refund-files"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (bucket_id = 'refund-files');

-- =====================================================
-- EMAIL NOTIFICATION (using pg_net + Resend)
-- Only enable this AFTER setting up Resend API key
-- =====================================================

-- STEP 1: Store your Resend API key in Supabase Vault (run this FIRST, separately):
   SELECT vault.create_secret('re_4KP7SqYB_GRbbrkxRLs5brpLn4niqaLaD', 'resend_api_key');

-- STEP 2: Then run everything below:

-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the email notification function
CREATE OR REPLACE FUNCTION notify_refund_request()
RETURNS TRIGGER AS $$
DECLARE
    resend_key TEXT;
    email_body TEXT;
    viewer_url TEXT := 'https://dash.vantagequant.com/whopadmin/';
BEGIN
    -- Get API key from vault
    SELECT decrypted_secret INTO resend_key
    FROM vault.decrypted_secrets
    WHERE name = 'resend_api_key'
    LIMIT 1;

    IF resend_key IS NULL THEN
        RAISE LOG 'Resend API key not found in vault';
        RETURN NEW;
    END IF;

    -- Build email HTML
    email_body := '<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;background:#f7f7f8;padding:40px 20px;margin:0">'
        || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5e7;overflow:hidden">'
        || '<div style="background:#FF6243;padding:24px;text-align:center;color:#fff">'
        || '<h1 style="margin:0;font-size:20px;font-weight:700">New Refund Request</h1>'
        || '<p style="margin:6px 0 0;font-size:13px;opacity:0.9">' || NEW.reference_number || '</p></div>'
        || '<div style="padding:24px">'
        || '<table style="width:100%;border-collapse:collapse;font-size:14px">'
        || '<tr><td style="padding:8px 0;color:#6b6b6f;width:140px">Name</td><td style="padding:8px 0;font-weight:600">' || NEW.first_name || ' ' || NEW.last_name || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Email</td><td style="padding:8px 0">' || NEW.email || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Phone</td><td style="padding:8px 0">' || COALESCE(NEW.phone, 'N/A') || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Amount Paid</td><td style="padding:8px 0;font-weight:600">$' || COALESCE(NEW.amount_paid::text, '0') || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Purchase Date</td><td style="padding:8px 0">' || COALESCE(NEW.purchase_date::text, 'N/A') || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Duration</td><td style="padding:8px 0">' || COALESCE(NEW.usage_duration, 'N/A') || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Compliant</td><td style="padding:8px 0;font-weight:600;color:' || CASE WHEN NEW.compliant THEN '#00b341' ELSE '#e5484d' END || '">' || CASE WHEN NEW.compliant THEN 'Yes' ELSE 'No' END || '</td></tr>'
        || '<tr><td style="padding:8px 0;color:#6b6b6f">Reason</td><td style="padding:8px 0">' || COALESCE(NEW.reason, 'N/A') || '</td></tr>'
        || '</table>'
        || '<div style="margin-top:24px;text-align:center">'
        || '<a href="' || viewer_url || '" style="display:inline-block;padding:12px 32px;background:#FF6243;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Full Request</a>'
        || '</div></div></div></body></html>';

    -- Send email via Resend API (using Resend free sender)
    PERFORM net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || resend_key,
            'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
            'from', 'VantageQuant Refunds <onboarding@resend.dev>',
            'to', ARRAY['reece@reecephillips.com', 'steele@lucentcapital.xyz', 'clientsupport@vantagequant.com'],
            'subject', 'New Refund Request: ' || NEW.reference_number || ' - ' || NEW.first_name || ' ' || NEW.last_name,
            'html', email_body
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Email notification failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_notify_refund_request ON refund_requests;
CREATE TRIGGER trigger_notify_refund_request
    AFTER INSERT ON refund_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_refund_request();
