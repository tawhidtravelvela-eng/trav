
-- Update RLS policy on api_settings to include tripjack_flight in public read list
DROP POLICY IF EXISTS "Safe api_settings are publicly readable" ON public.api_settings;

CREATE POLICY "Safe api_settings are publicly readable"
ON public.api_settings
FOR SELECT
TO authenticated, anon
USING (
  (provider = ANY (ARRAY[
    'local_inventory', 'api_markup', 'currency_rates', 'taxes_fees',
    'site_general', 'site_seo', 'site_branding', 'site_themes',
    'site_accounts', 'site_contact', 'site_notifications', 'site_social',
    'site_tracking', 'site_apps', 'site_booking', 'site_payment',
    'site_footer', 'site_terms', 'site_privacy', 'site_refund',
    'travelvela', 'travelport', 'amadeus', 'airline_commissions',
    'travelvela_hotel', 'tripjack_hotel', 'tripjack_flight'
  ]::text[]))
  OR has_role(auth.uid(), 'admin'::app_role)
);
