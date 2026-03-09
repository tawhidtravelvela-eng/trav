INSERT INTO public.api_settings (provider, is_active, settings)
VALUES ('travelvela', false, '{}')
ON CONFLICT DO NOTHING;