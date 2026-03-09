
-- Create ticket-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-files', 'ticket-files', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload files
CREATE POLICY "Admins can upload ticket files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-files'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update files
CREATE POLICY "Admins can update ticket files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ticket-files'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete files
CREATE POLICY "Admins can delete ticket files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ticket-files'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow authenticated users to read their booking files (public bucket, but we add policy for completeness)
CREATE POLICY "Anyone can read ticket files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ticket-files');
