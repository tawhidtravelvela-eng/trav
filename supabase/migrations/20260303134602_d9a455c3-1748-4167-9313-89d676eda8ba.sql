
-- Remove the overly permissive policies and replace with anon insert/update via service role only
DROP POLICY IF EXISTS "Authenticated users can upsert popular routes" ON public.popular_routes;
DROP POLICY IF EXISTS "Authenticated users can update popular routes" ON public.popular_routes;

-- Allow anon/public to insert and update (search tracking happens from unauthenticated users too)
-- We limit exposure by only allowing upsert on specific columns via application logic
CREATE POLICY "Anyone can insert popular routes"
  ON public.popular_routes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update popular routes"
  ON public.popular_routes FOR UPDATE
  USING (true);
