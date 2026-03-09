
CREATE TABLE public.flight_price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code text NOT NULL,
  to_code text NOT NULL,
  travel_date text NOT NULL,
  cabin_class text NOT NULL DEFAULT 'Economy',
  adults int NOT NULL DEFAULT 1,
  children int NOT NULL DEFAULT 0,
  infants int NOT NULL DEFAULT 0,
  lowest_price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  source text NOT NULL DEFAULT 'tripjack',
  cached_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '1 hour'),
  UNIQUE(from_code, to_code, travel_date, cabin_class, adults, children, infants)
);

ALTER TABLE public.flight_price_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached prices
CREATE POLICY "Flight price cache is publicly readable"
  ON public.flight_price_cache FOR SELECT
  USING (true);

-- Anyone can insert/update cache (upsert)
CREATE POLICY "Anyone can insert flight price cache"
  ON public.flight_price_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update flight price cache"
  ON public.flight_price_cache FOR UPDATE
  USING (true);

-- Function to upsert cache entry
CREATE OR REPLACE FUNCTION public.upsert_flight_price_cache(
  p_from_code text,
  p_to_code text,
  p_travel_date text,
  p_cabin_class text,
  p_adults int,
  p_children int,
  p_infants int,
  p_lowest_price numeric,
  p_currency text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.flight_price_cache (from_code, to_code, travel_date, cabin_class, adults, children, infants, lowest_price, currency, source, cached_at, expires_at)
  VALUES (p_from_code, p_to_code, p_travel_date, p_cabin_class, p_adults, p_children, p_infants, p_lowest_price, p_currency, p_source, now(), now() + interval '1 hour')
  ON CONFLICT (from_code, to_code, travel_date, cabin_class, adults, children, infants)
  DO UPDATE SET
    lowest_price = EXCLUDED.lowest_price,
    currency = EXCLUDED.currency,
    source = EXCLUDED.source,
    cached_at = now(),
    expires_at = now() + interval '1 hour';
END;
$$;
