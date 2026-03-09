
-- ============================================================
-- 1. ENUM TYPES
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- ============================================================
-- 2. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_blocked BOOLEAN DEFAULT false,
  user_type TEXT DEFAULT 'b2c',
  company_name TEXT DEFAULT '',
  approval_status TEXT DEFAULT 'approved',
  is_approved BOOLEAN DEFAULT true,
  billing_currency TEXT DEFAULT 'USD',
  tenant_id UUID
);

-- ============================================================
-- 3. USER ROLES (separate table per security best practice)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  tenant_id UUID,
  UNIQUE (user_id, role)
);

-- ============================================================
-- 4. TENANTS
-- ============================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  provider_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. PROVIDER GROUPS
-- ============================================================
CREATE TABLE public.provider_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  providers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from tenants to provider_groups
ALTER TABLE public.tenants
  ADD CONSTRAINT fk_tenants_provider_group
  FOREIGN KEY (provider_group_id) REFERENCES public.provider_groups(id) ON DELETE SET NULL;

-- ============================================================
-- 6. TENANT API KEYS
-- ============================================================
CREATE TABLE public.tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT 'Default',
  is_active BOOLEAN DEFAULT true,
  rate_limit_per_minute INT DEFAULT 60,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. TENANT API SETTINGS
-- ============================================================
CREATE TABLE public.tenant_api_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

-- ============================================================
-- 8. TENANT PAYMENT SETTINGS
-- ============================================================
CREATE TABLE public.tenant_payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  settings JSONB DEFAULT '{}'::jsonb,
  supported_currencies TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);

-- ============================================================
-- 9. API SETTINGS (global)
-- ============================================================
CREATE TABLE public.api_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 10. FLIGHTS (local inventory)
-- ============================================================
CREATE TABLE public.flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airline TEXT NOT NULL,
  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  departure TEXT DEFAULT '',
  arrival TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  price NUMERIC DEFAULT 0,
  stops INT DEFAULT 0,
  class TEXT DEFAULT 'Economy',
  seats INT DEFAULT 100,
  markup_percentage NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 11. HOTELS
-- ============================================================
CREATE TABLE public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  rating NUMERIC DEFAULT 0,
  reviews INT DEFAULT 0,
  price NUMERIC DEFAULT 0,
  image TEXT,
  amenities JSONB DEFAULT '[]'::jsonb,
  stars INT DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 12. TOURS
-- ============================================================
CREATE TABLE public.tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  duration TEXT DEFAULT '',
  price NUMERIC DEFAULT 0,
  category TEXT DEFAULT 'International',
  rating NUMERIC DEFAULT 0,
  image TEXT,
  highlights JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 13. BOOKINGS
-- ============================================================
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  booking_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Flight',
  title TEXT NOT NULL,
  subtitle TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pending',
  details JSONB DEFAULT '[]'::jsonb,
  confirmation_number TEXT,
  confirmation_data JSONB,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 14. AIRPORTS
-- ============================================================
CREATE TABLE public.airports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iata_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT DEFAULT '',
  latitude NUMERIC,
  longitude NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 15. BANNERS
-- ============================================================
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 16. OFFERS
-- ============================================================
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  discount TEXT DEFAULT '',
  color TEXT DEFAULT 'primary',
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 17. TESTIMONIALS
-- ============================================================
CREATE TABLE public.testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  text TEXT NOT NULL,
  rating INT DEFAULT 5,
  avatar TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 18. BLOG CATEGORIES
-- ============================================================
CREATE TABLE public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 19. BLOG POSTS
-- ============================================================
CREATE TABLE public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT NOT NULL DEFAULT '',
  featured_image TEXT,
  category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft',
  author_name TEXT DEFAULT '',
  published_at TIMESTAMPTZ,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 20. POPULAR ROUTES
-- ============================================================
CREATE TABLE public.popular_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  from_city TEXT DEFAULT '',
  to_city TEXT DEFAULT '',
  search_count INT DEFAULT 1,
  lowest_price NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  airline TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  stops INT DEFAULT 0,
  last_searched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (from_code, to_code)
);

-- ============================================================
-- 21. WALLET TRANSACTIONS
-- ============================================================
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'credit',
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'completed',
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 22. TICKET REQUESTS (reissue/refund)
-- ============================================================
CREATE TABLE public.ticket_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'refund',
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT DEFAULT '',
  new_travel_date TEXT,
  admin_notes TEXT DEFAULT '',
  quote_amount NUMERIC DEFAULT 0,
  charges NUMERIC DEFAULT 0,
  refund_method TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 23. SAVED PASSENGERS
-- ============================================================
CREATE TABLE public.saved_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT '',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob TEXT DEFAULT '',
  nationality TEXT DEFAULT '',
  passport_country TEXT DEFAULT '',
  passport_number TEXT DEFAULT '',
  passport_expiry TEXT DEFAULT '',
  frequent_flyer TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 24. AIRLINE SETTINGS
-- ============================================================
CREATE TABLE public.airline_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airline_code TEXT NOT NULL UNIQUE,
  airline_name TEXT DEFAULT '',
  cabin_baggage TEXT DEFAULT '7 Kg',
  checkin_baggage TEXT DEFAULT '20 Kg',
  cancellation_policy TEXT DEFAULT '',
  date_change_policy TEXT DEFAULT '',
  name_change_policy TEXT DEFAULT '',
  no_show_policy TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 25. FLIGHT PRICE CACHE
-- ============================================================
CREATE TABLE public.flight_price_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code TEXT NOT NULL,
  to_code TEXT NOT NULL,
  travel_date DATE NOT NULL,
  lowest_price NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  source TEXT DEFAULT '',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_code, to_code, travel_date)
);

-- ============================================================
-- 26. NEWSLETTER SUBSCRIBERS
-- ============================================================
CREATE TABLE public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_tenant_id ON public.profiles(tenant_id);
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_tenant_id ON public.bookings(tenant_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_airports_iata ON public.airports(iata_code);
CREATE INDEX idx_airports_active ON public.airports(is_active);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts(status);
CREATE INDEX idx_wallet_user_id ON public.wallet_transactions(user_id);
CREATE INDEX idx_ticket_requests_booking ON public.ticket_requests(booking_id);
CREATE INDEX idx_saved_passengers_user ON public.saved_passengers(user_id);
CREATE INDEX idx_flight_cache ON public.flight_price_cache(from_code, to_code);
CREATE INDEX idx_tenant_api_keys_key ON public.tenant_api_keys(api_key);
