
-- ============================================================
-- DESTINATIONS TABLE
-- ============================================================
CREATE TABLE public.destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT DEFAULT '',
  image_url TEXT,
  price NUMERIC DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  flights INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DATABASE FUNCTIONS
-- ============================================================

-- has_role: check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- get_admin_tenant_id: returns the tenant_id for an admin user (null = super admin)
CREATE OR REPLACE FUNCTION public.get_admin_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'admin'
  LIMIT 1
$$;

-- get_tenant_wallet_balance: sum wallet transactions for a tenant
CREATE OR REPLACE FUNCTION public.get_tenant_wallet_balance(_tenant_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END),
    0
  )
  FROM public.wallet_transactions wt
  JOIN public.profiles p ON p.user_id = wt.user_id
  WHERE p.tenant_id = _tenant_id
$$;

-- generate_tenant_api_key: generates a random API key
CREATE OR REPLACE FUNCTION public.generate_tenant_api_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'tvk_' || encode(gen_random_bytes(32), 'hex');
END;
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Profiles insert on signup" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- USER ROLES
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- BOOKINGS
CREATE POLICY "Users can view own bookings" ON public.bookings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookings" ON public.bookings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON public.bookings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all bookings" ON public.bookings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- WALLET TRANSACTIONS
CREATE POLICY "Users can view own wallet" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert wallet txns" ON public.wallet_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage wallet" ON public.wallet_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- SAVED PASSENGERS
CREATE POLICY "Users can manage own passengers" ON public.saved_passengers FOR ALL TO authenticated USING (auth.uid() = user_id);

-- TICKET REQUESTS
CREATE POLICY "Users can view own requests" ON public.ticket_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create requests" ON public.ticket_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all requests" ON public.ticket_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PUBLIC READ tables (flights, hotels, tours, airports, banners, offers, testimonials, destinations, blog_posts, blog_categories, popular_routes, api_settings, airline_settings)
CREATE POLICY "Public read flights" ON public.flights FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage flights" ON public.flights FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read hotels" ON public.hotels FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage hotels" ON public.hotels FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read tours" ON public.tours FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage tours" ON public.tours FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read airports" ON public.airports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service manage airports" ON public.airports FOR ALL TO service_role USING (true);

CREATE POLICY "Public read banners" ON public.banners FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage banners" ON public.banners FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read offers" ON public.offers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage offers" ON public.offers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read testimonials" ON public.testimonials FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage testimonials" ON public.testimonials FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read destinations" ON public.destinations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage destinations" ON public.destinations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read blog_posts" ON public.blog_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage blog_posts" ON public.blog_posts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read blog_categories" ON public.blog_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage blog_categories" ON public.blog_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read popular_routes" ON public.popular_routes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage popular_routes" ON public.popular_routes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service manage popular_routes" ON public.popular_routes FOR ALL TO service_role USING (true);

CREATE POLICY "Public read api_settings" ON public.api_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage api_settings" ON public.api_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read airline_settings" ON public.airline_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage airline_settings" ON public.airline_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read flight_price_cache" ON public.flight_price_cache FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service manage flight_price_cache" ON public.flight_price_cache FOR ALL TO service_role USING (true);

CREATE POLICY "Anyone can subscribe newsletter" ON public.newsletter_subscribers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin read newsletter" ON public.newsletter_subscribers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- TENANTS
CREATE POLICY "Public read active tenants" ON public.tenants FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Admin manage tenants" ON public.tenants FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- PROVIDER GROUPS
CREATE POLICY "Admin manage provider_groups" ON public.provider_groups FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public read provider_groups" ON public.provider_groups FOR SELECT TO anon, authenticated USING (true);

-- TENANT API KEYS
CREATE POLICY "Admin manage tenant_api_keys" ON public.tenant_api_keys FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service manage tenant_api_keys" ON public.tenant_api_keys FOR ALL TO service_role USING (true);

-- TENANT API SETTINGS
CREATE POLICY "Admin manage tenant_api_settings" ON public.tenant_api_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service read tenant_api_settings" ON public.tenant_api_settings FOR SELECT TO service_role USING (true);

-- TENANT PAYMENT SETTINGS
CREATE POLICY "Admin manage tenant_payment_settings" ON public.tenant_payment_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
