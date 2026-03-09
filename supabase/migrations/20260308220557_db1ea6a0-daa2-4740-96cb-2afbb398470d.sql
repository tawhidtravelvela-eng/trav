
-- Create hotel_interactions table
CREATE TABLE IF NOT EXISTS public.hotel_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id text NOT NULL,
  hotel_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  stars integer DEFAULT 0,
  action text NOT NULL DEFAULT 'view',
  session_id uuid,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.hotel_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert hotel_interactions" ON public.hotel_interactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin read hotel_interactions" ON public.hotel_interactions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service manage hotel_interactions" ON public.hotel_interactions FOR ALL USING (true);

-- Add missing profile columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_address text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trade_license text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
