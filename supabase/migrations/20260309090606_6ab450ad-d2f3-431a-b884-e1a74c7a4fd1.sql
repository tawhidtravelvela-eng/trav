-- Fix 1: Replace public SELECT on api_settings with a policy that only exposes non-sensitive providers
DROP POLICY IF EXISTS "Public read api_settings" ON public.api_settings;

CREATE POLICY "Public read non-sensitive api_settings"
  ON public.api_settings FOR SELECT
  USING (
    provider IN (
      'site_branding', 'site_general', 'site_footer', 'site_contact', 'site_social',
      'site_seo', 'site_payment', 'currency_rates', 'taxes_fees',
      'site_privacy_policy', 'site_terms', 'site_refund_policy',
      'site_hero', 'site_stats', 'site_why_choose', 'site_newsletter',
      'site_app_download', 'site_trending', 'site_blog_section'
    )
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- Fix 2: Drop the permissive wallet INSERT policy (users should not self-credit)
DROP POLICY IF EXISTS "Users can insert wallet txns" ON public.wallet_transactions;