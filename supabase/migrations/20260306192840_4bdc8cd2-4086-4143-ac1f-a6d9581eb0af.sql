
CREATE TABLE public.tripjack_hotels (
  tj_hotel_id TEXT PRIMARY KEY,
  unica_id TEXT,
  name TEXT NOT NULL DEFAULT '',
  rating INTEGER DEFAULT 0,
  property_type TEXT DEFAULT 'Hotel',
  city_name TEXT DEFAULT '',
  city_code TEXT DEFAULT '',
  state_name TEXT DEFAULT '',
  country_name TEXT DEFAULT '',
  country_code TEXT DEFAULT '',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  image_url TEXT,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tripjack_hotels_city ON public.tripjack_hotels (city_name);
CREATE INDEX idx_tripjack_hotels_country ON public.tripjack_hotels (country_name);
CREATE INDEX idx_tripjack_hotels_not_deleted ON public.tripjack_hotels (is_deleted) WHERE is_deleted = false;

ALTER TABLE public.tripjack_hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of tripjack hotels"
ON public.tripjack_hotels
FOR SELECT
TO anon, authenticated
USING (true);
