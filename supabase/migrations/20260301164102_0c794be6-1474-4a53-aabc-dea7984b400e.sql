DROP POLICY "Safe api_settings are publicly readable" ON api_settings;
CREATE POLICY "Safe api_settings are publicly readable" ON api_settings FOR SELECT USING (
  provider = ANY (ARRAY['local_inventory','api_markup','currency_rates','taxes_fees','site_general','site_seo','site_branding','site_themes','site_accounts','site_contact','site_notifications','site_social','site_tracking','site_apps','site_booking','site_payment','travelvela','travelport','amadeus'])
  OR has_role(auth.uid(), 'admin'::app_role)
);