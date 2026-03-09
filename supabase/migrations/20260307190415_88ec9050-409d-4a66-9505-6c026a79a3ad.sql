
-- 1) Create user_type enum
CREATE TYPE public.user_type AS ENUM ('b2c', 'corporate', 'b2b_agent');

-- 2) Add columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN user_type public.user_type NOT NULL DEFAULT 'b2c',
  ADD COLUMN company_name TEXT DEFAULT '',
  ADD COLUMN company_address TEXT DEFAULT '',
  ADD COLUMN trade_license TEXT DEFAULT '',
  ADD COLUMN phone TEXT DEFAULT '',
  ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN approved_by UUID,
  ADD COLUMN approved_at TIMESTAMPTZ;

-- B2C users are auto-approved
-- Corporate & B2B start as 'pending'

-- 3) Create b2b_access_requests table for white-label and BYOK requests
CREATE TABLE public.b2b_access_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'whitelabel',
  status TEXT NOT NULL DEFAULT 'pending',
  company_name TEXT NOT NULL DEFAULT '',
  domain_requested TEXT DEFAULT '',
  business_justification TEXT DEFAULT '',
  admin_notes TEXT DEFAULT '',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for b2b_access_requests
ALTER TABLE public.b2b_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own access requests"
  ON public.b2b_access_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own access requests"
  ON public.b2b_access_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all access requests"
  ON public.b2b_access_requests FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Update the handle_new_user trigger to handle user_type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_type public.user_type;
  v_approval_status TEXT;
  v_is_approved BOOLEAN;
BEGIN
  v_user_type := COALESCE((NEW.raw_user_meta_data->>'user_type')::public.user_type, 'b2c');
  
  IF v_user_type = 'b2c' THEN
    v_approval_status := 'approved';
    v_is_approved := true;
  ELSE
    v_approval_status := 'pending';
    v_is_approved := false;
  END IF;

  INSERT INTO public.profiles (user_id, email, full_name, tenant_id, user_type, company_name, trade_license, phone, is_approved, approval_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    v_user_type,
    COALESCE(NEW.raw_user_meta_data->>'company_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'trade_license', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    v_is_approved,
    v_approval_status
  );
  RETURN NEW;
END;
$function$;
