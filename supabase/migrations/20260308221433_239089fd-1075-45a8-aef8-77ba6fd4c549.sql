
-- Create tour_inquiries table
CREATE TABLE IF NOT EXISTS public.tour_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_name text NOT NULL DEFAULT '',
  visitor_email text NOT NULL DEFAULT '',
  visitor_phone text DEFAULT '',
  destination text DEFAULT '',
  travel_dates text DEFAULT '',
  duration text DEFAULT '',
  travelers integer DEFAULT 1,
  budget text DEFAULT '',
  interests text DEFAULT '',
  ai_itinerary text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  admin_notes text DEFAULT '',
  source text DEFAULT 'website',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tour_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public insert tour_inquiries" ON public.tour_inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin manage tour_inquiries" ON public.tour_inquiries FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create tripjack_cities table
CREATE TABLE IF NOT EXISTS public.tripjack_cities (
  id integer PRIMARY KEY,
  city_name text NOT NULL DEFAULT '',
  country_name text DEFAULT '',
  type text DEFAULT 'CITY',
  full_region_name text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tripjack_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tripjack_cities" ON public.tripjack_cities FOR SELECT USING (true);
CREATE POLICY "Service manage tripjack_cities" ON public.tripjack_cities FOR ALL USING (true);

-- Create tripjack_hotels table
CREATE TABLE IF NOT EXISTS public.tripjack_hotels (
  tj_hotel_id bigint PRIMARY KEY,
  unica_id bigint,
  name text NOT NULL DEFAULT '',
  rating integer DEFAULT 0,
  property_type text DEFAULT 'Hotel',
  city_name text DEFAULT '',
  city_code text DEFAULT '',
  state_name text DEFAULT '',
  country_name text DEFAULT '',
  country_code text DEFAULT '',
  latitude numeric,
  longitude numeric,
  address text DEFAULT '',
  postal_code text DEFAULT '',
  image_url text DEFAULT '',
  is_deleted boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tripjack_hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tripjack_hotels" ON public.tripjack_hotels FOR SELECT USING (true);
CREATE POLICY "Service manage tripjack_hotels" ON public.tripjack_hotels FOR ALL USING (true);

-- Add is_active to tours if missing
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Import tours data
INSERT INTO public.tours (id, name, destination, duration, price, category, rating, image, highlights, is_active, created_at)
VALUES
('2650592a-505c-4635-9cb4-229c7b5dab4e','Romantic Paris','Paris','5 Days',1299,'International',4.8,'dest-paris','["Eiffel Tower","Louvre Museum","Seine Cruise","Montmartre"]'::jsonb,true,'2026-02-27 13:11:27.452392+00'),
('5b8c4132-c606-4420-80b0-e3d871f68167','Japan Explorer','Tokyo','7 Days',2499,'International',4.9,'dest-tokyo','["Mt. Fuji","Shibuya","Kyoto Temples","Osaka Street Food"]'::jsonb,true,'2026-02-27 13:11:27.452392+00'),
('093b5c1b-5bd6-4889-b929-f44d6d10aeb5','Bali Paradise','Bali','6 Days',1599,'International',4.7,'dest-bali','["Rice Terraces","Uluwatu Temple","Snorkeling","Ubud Market"]'::jsonb,true,'2026-02-27 13:11:27.452392+00'),
('1ec17db4-629f-4e79-b485-883c8c320652','Dubai Luxury','Dubai','4 Days',1899,'International',4.6,'dest-dubai','["Burj Khalifa","Desert Safari","Dubai Mall","Palm Jumeirah"]'::jsonb,true,'2026-02-27 13:11:27.452392+00'),
('46d2c47f-6ee9-4fb4-a9b8-cd3ebd495d32','Greek Islands','Santorini','5 Days',1799,'International',4.9,'dest-santorini','["Oia Sunset","Wine Tasting","Volcanic Hot Springs","Beach Hopping"]'::jsonb,true,'2026-02-27 13:11:27.452392+00'),
('e41683bf-9fce-4caf-a19d-ab1b9174287e','NYC Adventure','New York','4 Days',999,'Domestic',4.5,'dest-newyork','["Statue of Liberty","Central Park","Broadway Show","Times Square"]'::jsonb,true,'2026-02-27 13:11:27.452392+00')
ON CONFLICT (id) DO NOTHING;
