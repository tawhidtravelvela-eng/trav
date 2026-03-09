
-- Tenants table: maps domains to tenant configs
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Anyone can read active tenants (needed for domain resolution)
CREATE POLICY "Active tenants are publicly readable"
ON public.tenants FOR SELECT
USING (is_active = true);

-- Admins can manage all tenants
CREATE POLICY "Admins can manage tenants"
ON public.tenants FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for fast domain lookups
CREATE INDEX idx_tenants_domain ON public.tenants (domain) WHERE is_active = true;
