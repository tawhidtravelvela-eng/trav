
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-files', 'ticket-files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for ticket-files
CREATE POLICY "Admins can manage ticket files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'ticket-files' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'ticket-files' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read ticket files" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'ticket-files');

-- Storage policies for blog-images
CREATE POLICY "Admins can manage blog images" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'blog-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'blog-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read blog images" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'blog-images');
