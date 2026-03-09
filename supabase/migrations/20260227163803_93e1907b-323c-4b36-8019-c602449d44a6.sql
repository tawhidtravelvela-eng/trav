INSERT INTO public.api_settings (provider, is_active, settings)
SELECT 'local_inventory', true, '{"type": "flights"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.api_settings WHERE provider = 'local_inventory');