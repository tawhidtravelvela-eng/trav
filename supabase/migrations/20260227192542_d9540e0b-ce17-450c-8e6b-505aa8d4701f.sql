
CREATE TABLE public.airline_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  airline_code text NOT NULL UNIQUE,
  airline_name text NOT NULL DEFAULT '',
  cabin_baggage text NOT NULL DEFAULT '7 Kg',
  checkin_baggage text NOT NULL DEFAULT '20 Kg',
  cancellation_policy text NOT NULL DEFAULT 'Free cancellation within 24 hours of booking',
  date_change_policy text NOT NULL DEFAULT 'Date changes allowed with fare difference',
  name_change_policy text NOT NULL DEFAULT 'Name changes up to 48h before departure ($50 fee)',
  no_show_policy text NOT NULL DEFAULT 'No-show results in full fare forfeiture',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.airline_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage airline_settings" ON public.airline_settings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Airline settings are publicly readable" ON public.airline_settings FOR SELECT USING (true);
