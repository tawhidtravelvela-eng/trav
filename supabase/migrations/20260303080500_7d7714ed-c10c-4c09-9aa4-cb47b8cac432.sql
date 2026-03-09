CREATE TABLE public.destinations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL DEFAULT '',
  image_url text,
  price numeric NOT NULL DEFAULT 0,
  rating numeric NOT NULL DEFAULT 4.5,
  flights integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Destinations are publicly readable" ON public.destinations FOR SELECT USING (true);
CREATE POLICY "Admins can manage destinations" ON public.destinations FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_destinations_updated_at BEFORE UPDATE ON public.destinations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();