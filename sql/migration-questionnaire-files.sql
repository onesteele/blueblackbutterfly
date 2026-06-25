-- Migration: questionnaire-files storage bucket
-- Purpose: Stores files uploaded by customers in response to image-upload questions in questionnaires.
-- Files are only uploadable during questionnaire submission (not as free-form chat attachments).

-- Create the storage bucket (run via Supabase dashboard or this migration)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'questionnaire-files',
    'questionnaire-files',
    true,
    10485760, -- 10 MB per file
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: Allow authenticated customers to upload files to their own conversation folder
CREATE POLICY "Customers can upload questionnaire files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'questionnaire-files'
    -- Path format: {conversation_id}/{message_id}/q{qi}_{timestamp}.{ext}
    -- The conversation_id segment is validated on the app side
);

-- RLS: Allow public read access so admin can view uploaded files
CREATE POLICY "Anyone can read questionnaire files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'questionnaire-files');
