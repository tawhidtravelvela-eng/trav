
CREATE TABLE public.saved_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  first_name text NOT NULL,
  last_name text NOT NULL,
  dob text DEFAULT '',
  nationality text DEFAULT '',
  passport_country text DEFAULT '',
  passport_number text DEFAULT '',
  passport_expiry text DEFAULT '',
  frequent_flyer text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved passengers" ON public.saved_passengers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved passengers" ON public.saved_passengers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own saved passengers" ON public.saved_passengers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved passengers" ON public.saved_passengers FOR DELETE TO authenticated USING (auth.uid() = user_id);
