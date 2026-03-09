
-- Provider groups table for region-based API routing
CREATE TABLE public.provider_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  providers jsonb NOT NULL DEFAULT '{"travelport": false, "amadeus": false, "travelvela": false, "tripjack": false}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add unique constraint on name
ALTER TABLE public.provider_groups ADD CONSTRAINT provider_groups_name_unique UNIQUE (name);

-- Add provider_group_id FK to tenants
ALTER TABLE public.tenants ADD COLUMN provider_group_id uuid REFERENCES public.provider_groups(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.provider_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider groups are publicly readable"
  ON public.provider_groups FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage provider groups"
  ON public.provider_groups FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed some default groups
INSERT INTO public.provider_groups (name, description, providers) VALUES
  ('APAC', 'Asia-Pacific region — Travelport + Tripjack', '{"travelport": true, "amadeus": false, "travelvela": false, "tripjack": true}'::jsonb),
  ('Europe', 'Europe region — Amadeus + Travelport', '{"travelport": true, "amadeus": true, "travelvela": false, "tripjack": false}'::jsonb),
  ('Global', 'Full access to all providers', '{"travelport": true, "amadeus": true, "travelvela": true, "tripjack": true}'::jsonb);
