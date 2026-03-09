
-- Tenant API keys for external integration
CREATE TABLE public.tenant_api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  api_key text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Default',
  is_active boolean NOT NULL DEFAULT true,
  rate_limit_per_minute integer NOT NULL DEFAULT 30,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast key lookups
CREATE INDEX idx_tenant_api_keys_key ON public.tenant_api_keys(api_key) WHERE is_active = true;

-- RLS
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tenant API keys"
  ON public.tenant_api_keys FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant admins can view own keys"
  ON public.tenant_api_keys FOR SELECT
  USING (tenant_id = (
    SELECT ur.tenant_id FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    LIMIT 1
  ));

-- Function to generate a secure API key
CREATE OR REPLACE FUNCTION public.generate_tenant_api_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_key text;
BEGIN
  -- Generate a key like: tvl_sk_<32 random hex chars>
  new_key := 'tvl_sk_' || encode(gen_random_bytes(24), 'hex');
  RETURN new_key;
END;
$$;
