
CREATE OR REPLACE FUNCTION public.upsert_popular_route(
  p_from_code text,
  p_to_code text,
  p_from_city text,
  p_to_city text,
  p_price numeric,
  p_currency text,
  p_airline text,
  p_duration text,
  p_stops integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.popular_routes (from_code, to_code, from_city, to_city, lowest_price, currency, airline, duration, stops, search_count, last_searched_at)
  VALUES (p_from_code, p_to_code, p_from_city, p_to_city, p_price, p_currency, p_airline, p_duration, p_stops, 1, now())
  ON CONFLICT (from_code, to_code)
  DO UPDATE SET
    search_count = popular_routes.search_count + 1,
    lowest_price = LEAST(popular_routes.lowest_price, EXCLUDED.lowest_price),
    currency = CASE WHEN EXCLUDED.lowest_price < popular_routes.lowest_price THEN EXCLUDED.currency ELSE popular_routes.currency END,
    airline = CASE WHEN EXCLUDED.lowest_price < popular_routes.lowest_price THEN EXCLUDED.airline ELSE popular_routes.airline END,
    duration = CASE WHEN EXCLUDED.lowest_price < popular_routes.lowest_price THEN EXCLUDED.duration ELSE popular_routes.duration END,
    stops = CASE WHEN EXCLUDED.lowest_price < popular_routes.lowest_price THEN EXCLUDED.stops ELSE popular_routes.stops END,
    from_city = COALESCE(NULLIF(EXCLUDED.from_city, ''), popular_routes.from_city),
    to_city = COALESCE(NULLIF(EXCLUDED.to_city, ''), popular_routes.to_city),
    last_searched_at = now();
END;
$$;
