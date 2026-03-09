INSERT INTO public.api_settings (provider, is_active, settings)
SELECT 'amadeus', false, '{"environment": "test"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.api_settings WHERE provider = 'amadeus');