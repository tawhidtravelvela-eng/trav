
-- Fix flight_price_cache: add missing columns from CSV
ALTER TABLE public.flight_price_cache 
  ADD COLUMN IF NOT EXISTS cabin_class TEXT DEFAULT 'Economy',
  ADD COLUMN IF NOT EXISTS adults INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS children INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS infants INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ DEFAULT now();

-- Drop old unique constraint and add new one
ALTER TABLE public.flight_price_cache DROP CONSTRAINT IF EXISTS flight_price_cache_from_code_to_code_travel_date_key;
ALTER TABLE public.flight_price_cache ADD CONSTRAINT flight_price_cache_unique UNIQUE (from_code, to_code, travel_date, cabin_class, adults, children, infants);

-- Create b2b_access_requests table
CREATE TABLE public.b2b_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'api_access',
  status TEXT NOT NULL DEFAULT 'pending',
  company_name TEXT DEFAULT '',
  domain_requested TEXT DEFAULT '',
  business_justification TEXT DEFAULT '',
  admin_notes TEXT DEFAULT '',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE POLICY "Users can view own b2b requests" ON public.b2b_access_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create b2b requests" ON public.b2b_access_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage b2b requests" ON public.b2b_access_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Add updated_at column to airline_settings  
ALTER TABLE public.airline_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
