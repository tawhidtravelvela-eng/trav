DROP POLICY IF EXISTS "Safe api_settings are publicly readable" ON public.api_settings;

CREATE POLICY "Safe api_settings are publicly readable"
ON public.api_settings
FOR SELECT
TO public
USING (
  (provider = ANY (ARRAY['local_inventory'::text, 'api_markup'::text, 'currency_rates'::text, 'taxes_fees'::text, 'site_general'::text, 'site_seo'::text, 'site_branding'::text, 'site_themes'::text, 'site_accounts'::text, 'site_contact'::text, 'site_notifications'::text, 'site_social'::text, 'site_tracking'::text, 'site_apps'::text, 'site_booking'::text, 'site_payment'::text, 'site_footer'::text, 'site_terms'::text, 'site_privacy'::text, 'site_refund'::text, 'travelvela'::text, 'travelport'::text, 'amadeus'::text, 'airline_commissions'::text, 'travelvela_hotel'::text]))
  OR has_role(auth.uid(), 'admin'::app_role)
);