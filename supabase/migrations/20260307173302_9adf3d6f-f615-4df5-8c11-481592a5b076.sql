
-- Add tenant_id to user_roles for tenant-scoped admins
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Create index for tenant-scoped role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id ON public.user_roles(tenant_id);

-- Function to get the tenant_id of an admin user (returns null for super admins)
CREATE OR REPLACE FUNCTION public.get_admin_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.user_roles 
  WHERE user_id = _user_id AND role = 'admin' 
  LIMIT 1
$$;
