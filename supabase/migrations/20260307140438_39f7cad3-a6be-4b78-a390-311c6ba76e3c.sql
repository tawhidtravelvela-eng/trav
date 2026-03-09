UPDATE api_settings SET is_active = true, updated_at = now() WHERE provider = 'travelvela_hotel';
UPDATE api_settings SET is_active = false, updated_at = now() WHERE provider = 'tripjack_hotel';