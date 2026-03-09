
-- Add tripjack_hotel to the public readable providers list in api_settings RLS
DROP POLICY IF EXISTS "Safe api_settings are publicly readable" ON public.api_settings;

CREATE POLICY "Safe api_settings are publicly readable"
ON public.api_settings
FOR SELECT
TO authenticated, anon
USING (
  provider = ANY (ARRAY[
    'local_inventory', 'api_markup', 'currency_rates', 'taxes_fees',
    'site_general', 'site_seo', 'site_branding', 'site_themes',
    'site_accounts', 'site_contact', 'site_notifications', 'site_social',
    'site_tracking', 'site_apps', 'site_booking', 'site_payment',
    'site_footer', 'site_terms', 'site_privacy', 'site_refund',
    'travelvela', 'travelport', 'amadeus', 'airline_commissions',
    'travelvela_hotel', 'tripjack_hotel', 'tripjack_flight'
  ])
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Ensure tripjack_hotel row exists
INSERT INTO public.api_settings (provider, is_active, settings)
VALUES ('tripjack_hotel', false, '{"environment": "test"}'::jsonb)
ON CONFLICT DO NOTHING;
