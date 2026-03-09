
-- Table for tenant-specific API credentials
CREATE TABLE public.tenant_api_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

ALTER TABLE public.tenant_api_settings ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all
CREATE POLICY "Admins can manage tenant_api_settings"
ON public.tenant_api_settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Tenant admins can manage their own tenant's settings
CREATE POLICY "Tenant admins can manage own settings"
ON public.tenant_api_settings FOR ALL
TO authenticated
USING (
  tenant_id = (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin' LIMIT 1)
)
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin' LIMIT 1)
);

-- Updated_at trigger
CREATE TRIGGER update_tenant_api_settings_updated_at
BEFORE UPDATE ON public.tenant_api_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
