INSERT INTO public.api_settings (provider, is_active, settings)
VALUES ('tripjack_hotel', false, '{"environment": "test"}'::jsonb)
ON CONFLICT (provider) DO NOTHING;