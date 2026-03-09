
CREATE TABLE public.popular_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code text NOT NULL,
  to_code text NOT NULL,
  from_city text NOT NULL DEFAULT '',
  to_city text NOT NULL DEFAULT '',
  search_count integer NOT NULL DEFAULT 1,
  lowest_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  airline text NOT NULL DEFAULT '',
  duration text NOT NULL DEFAULT '',
  stops integer NOT NULL DEFAULT 0,
  last_searched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (from_code, to_code)
);

ALTER TABLE public.popular_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Popular routes are publicly readable"
  ON public.popular_routes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can upsert popular routes"
  ON public.popular_routes FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update popular routes"
  ON public.popular_routes FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Admins can manage popular routes"
  ON public.popular_routes FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_popular_routes_updated_at
  BEFORE UPDATE ON public.popular_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
