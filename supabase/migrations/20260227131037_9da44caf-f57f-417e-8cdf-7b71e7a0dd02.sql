
-- Flights table
CREATE TABLE public.flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airline text NOT NULL,
  from_city text NOT NULL,
  to_city text NOT NULL,
  departure text NOT NULL,
  arrival text NOT NULL,
  duration text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  stops integer NOT NULL DEFAULT 0,
  class text NOT NULL DEFAULT 'Economy',
  seats integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Flights are publicly readable" ON public.flights
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage flights" ON public.flights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Hotels table
CREATE TABLE public.hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text NOT NULL,
  rating numeric NOT NULL DEFAULT 0,
  reviews integer NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  image text,
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  stars integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hotels are publicly readable" ON public.hotels
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage hotels" ON public.hotels
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Tours table
CREATE TABLE public.tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  destination text NOT NULL,
  duration text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'International',
  rating numeric NOT NULL DEFAULT 0,
  image text,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tours are publicly readable" ON public.tours
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage tours" ON public.tours
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER update_flights_updated_at BEFORE UPDATE ON public.flights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_hotels_updated_at BEFORE UPDATE ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tours_updated_at BEFORE UPDATE ON public.tours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
