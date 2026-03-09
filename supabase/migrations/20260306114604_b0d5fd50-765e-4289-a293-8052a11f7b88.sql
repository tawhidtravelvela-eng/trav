CREATE TABLE public.tripjack_cities (
  id INTEGER NOT NULL PRIMARY KEY,
  city_name TEXT NOT NULL DEFAULT '',
  country_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'CITY',
  full_region_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tripjack_cities_name ON public.tripjack_cities USING gin (to_tsvector('english', city_name));
CREATE INDEX idx_tripjack_cities_country ON public.tripjack_cities (country_name);

ALTER TABLE public.tripjack_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tripjack cities are publicly readable" ON public.tripjack_cities FOR SELECT USING (true);
CREATE POLICY "Service role can manage tripjack cities" ON public.tripjack_cities FOR ALL USING (true) WITH CHECK (true);