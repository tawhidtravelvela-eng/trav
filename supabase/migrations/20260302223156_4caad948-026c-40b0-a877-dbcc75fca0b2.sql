
-- Create airports table for comprehensive airport data
CREATE TABLE public.airports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  iata_code text NOT NULL UNIQUE,
  name text NOT NULL,
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  latitude numeric,
  longitude numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_airports_iata ON public.airports (iata_code);
CREATE INDEX idx_airports_city ON public.airports (city);
CREATE INDEX idx_airports_country ON public.airports (country);

-- Enable RLS
ALTER TABLE public.airports ENABLE ROW LEVEL SECURITY;

-- Airports are publicly readable
CREATE POLICY "Airports are publicly readable"
ON public.airports
FOR SELECT
USING (true);

-- Admins can manage airports
CREATE POLICY "Admins can manage airports"
ON public.airports
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_airports_updated_at
BEFORE UPDATE ON public.airports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
