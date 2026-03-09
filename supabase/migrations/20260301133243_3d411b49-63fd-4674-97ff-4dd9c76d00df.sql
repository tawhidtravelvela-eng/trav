
-- Drop the overly broad public read policy on api_settings
DROP POLICY IF EXISTS "Api settings are publicly readable" ON public.api_settings;

-- Create a restricted public read policy that only allows reading safe providers
-- This excludes providers containing sensitive API credentials
CREATE POLICY "Safe api_settings are publicly readable"
ON public.api_settings
FOR SELECT
USING (
  provider IN (
    'local_inventory',
    'api_markup',
    'currency_rates',
    'taxes_fees',
    'site_general',
    'site_seo',
    'site_branding',
    'site_themes',
    'site_accounts',
    'site_contact',
    'site_notifications',
    'site_social',
    'site_tracking',
    'site_apps',
    'site_booking',
    'site_payment'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);
