
-- Add tenant_id to tenant-scoped tables
ALTER TABLE public.bookings ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.blog_posts ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.testimonials ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.banners ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.offers ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.destinations ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.ticket_requests ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;
ALTER TABLE public.wallet_transactions ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

-- Indexes for tenant filtering
CREATE INDEX idx_bookings_tenant ON public.bookings(tenant_id);
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_blog_posts_tenant ON public.blog_posts(tenant_id);
CREATE INDEX idx_testimonials_tenant ON public.testimonials(tenant_id);
CREATE INDEX idx_banners_tenant ON public.banners(tenant_id);
CREATE INDEX idx_offers_tenant ON public.offers(tenant_id);
CREATE INDEX idx_destinations_tenant ON public.destinations(tenant_id);
CREATE INDEX idx_ticket_requests_tenant ON public.ticket_requests(tenant_id);
CREATE INDEX idx_wallet_transactions_tenant ON public.wallet_transactions(tenant_id);

-- Helper function: get user's tenant_id from profiles
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Update handle_new_user trigger to capture tenant_id from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    (NEW.raw_user_meta_data->>'tenant_id')::uuid
  );
  RETURN NEW;
END;
$$;
