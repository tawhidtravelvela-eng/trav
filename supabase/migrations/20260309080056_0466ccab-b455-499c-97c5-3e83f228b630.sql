
-- Ensure travelvela_hotel row exists and is disabled
INSERT INTO public.api_settings (provider, is_active, settings)
VALUES ('travelvela_hotel', false, '{}')
ON CONFLICT (provider) DO UPDATE SET is_active = false;

-- Ensure tripjack_hotel is disabled
UPDATE public.api_settings SET is_active = false WHERE provider = 'tripjack_hotel';

-- Ensure agoda_hotel is enabled
INSERT INTO public.api_settings (provider, is_active, settings)
VALUES ('agoda_hotel', true, '{}')
ON CONFLICT (provider) DO UPDATE SET is_active = true;
