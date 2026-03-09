
-- Tenant payment settings: stores per-tenant payment gateway credentials
CREATE TABLE public.tenant_payment_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'stripe', 'bkash', 'nagad'
  is_active BOOLEAN NOT NULL DEFAULT false,
  supported_currencies TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'BDT', 'USD'}
  credentials JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

ALTER TABLE public.tenant_payment_settings ENABLE ROW LEVEL SECURITY;

-- Tenant admins can manage their own payment settings
CREATE POLICY "Tenant admins can manage own payment settings"
  ON public.tenant_payment_settings FOR ALL
  USING (tenant_id = (
    SELECT ur.tenant_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role 
    LIMIT 1
  ))
  WITH CHECK (tenant_id = (
    SELECT ur.tenant_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role 
    LIMIT 1
  ));

-- Super admins can manage all
CREATE POLICY "Super admins can manage all tenant payment settings"
  ON public.tenant_payment_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add tenant payment preferences to tenants.settings
-- We'll use the existing settings JSONB column:
-- settings.allow_global_payment_fallback (default: true)
-- settings.accept_payment_only_with_balance (default: false)

-- Function to get tenant wallet balance (sum of credits - debits)
CREATE OR REPLACE FUNCTION public.get_tenant_wallet_balance(_tenant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END),
    0
  )
  FROM public.wallet_transactions
  WHERE tenant_id = _tenant_id AND user_id = (
    SELECT ur.user_id FROM user_roles ur 
    WHERE ur.tenant_id = _tenant_id AND ur.role = 'admin'::app_role 
    LIMIT 1
  )
$$;

-- Create a tenant_wallet_transactions table for tenant-level wallet (separate from user wallets)
CREATE TABLE public.tenant_wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'credit', -- 'credit' or 'debit'
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view own wallet transactions"
  ON public.tenant_wallet_transactions FOR SELECT
  USING (tenant_id = (
    SELECT ur.tenant_id FROM user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'::app_role 
    LIMIT 1
  ));

CREATE POLICY "Super admins can manage all tenant wallet transactions"
  ON public.tenant_wallet_transactions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Update the wallet balance function to use tenant_wallet_transactions
CREATE OR REPLACE FUNCTION public.get_tenant_wallet_balance(_tenant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END),
    0
  )
  FROM public.tenant_wallet_transactions
  WHERE tenant_id = _tenant_id
$$;
