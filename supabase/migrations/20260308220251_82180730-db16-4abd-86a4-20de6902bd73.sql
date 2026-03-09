
-- Insert airline_settings
INSERT INTO public.airline_settings (id, airline_code, airline_name, cabin_baggage, checkin_baggage, cancellation_policy, date_change_policy, name_change_policy, no_show_policy, created_at)
VALUES 
  ('db9c328c-1832-4696-97d2-78a618448bdf', 'BG', 'Biman Bangladesh', '7 Kg', '10 Kg', 'Free cancellation within 24 hours of booking', 'As Per Airline', 'As Per Airline', 'As Per Airline', '2026-02-27 19:28:50.106068+00'),
  ('5ccd4984-08fc-42df-993e-ba05a74191ea', 'CZ', 'China Southern Airlines', '7 Kg', '23 Kg', 'Varies by fare class', 'Varies by fare class', 'Name changes up to 48h before departure ($50 fee)', 'No-show results in full fare forfeiture', '2026-03-03 01:01:54.981512+00'),
  ('e6f3a985-4038-48fb-9c79-fce4f48fa399', 'MU', 'China Eastern Airlines', '7 Kg', '23 Kg', 'Varies by fare class', 'Varies by fare class', 'Name changes up to 48h before departure ($50 fee)', 'No-show results in full fare forfeiture', '2026-03-03 01:01:54.981512+00')
ON CONFLICT (airline_code) DO NOTHING;

-- Insert blog_categories
INSERT INTO public.blog_categories (id, name, slug, created_at)
VALUES 
  ('3a9b8b75-ae21-45e3-bf74-a384599f3aa7', 'Travel', 'travel', '2026-03-01 09:05:39.072992+00'),
  ('84365e96-700a-4c88-9a13-e70541f5c70d', 'Tour', 'tour', '2026-03-01 09:05:51.01216+00'),
  ('9ed6ef1d-b5e1-4b2a-8eb1-6a113d2bc08f', 'Flight', 'flight', '2026-03-01 09:06:01.090816+00'),
  ('fcfee9c2-1794-4aa5-8bf4-0fa8cb6f7449', 'Travel Tips', 'travel-tips', '2026-03-01 09:42:04.598627+00'),
  ('6d5340c9-e7dc-45c6-aa19-39688f54a566', 'Destinations', 'destinations', '2026-03-01 09:42:04.598627+00'),
  ('1994ecc8-0228-4491-9fa7-00d150bd89bc', 'Budget Travel', 'budget-travel', '2026-03-01 09:42:04.598627+00')
ON CONFLICT (slug) DO NOTHING;

-- Insert banners
INSERT INTO public.banners (id, title, subtitle, image_url, link_url, is_active, sort_order, created_at)
VALUES
  ('fd065a59-ebd2-4031-af79-e1ea7e2b4e6a', 'banner 2', '', 'https://travelvela-html.vercel.app/images/offer-banner/2.avif', 'https://travelvela-html.vercel.app/images/offer-banner/2.avif', true, 2, '2026-03-01 10:12:00.403651+00'),
  ('a1bee4a8-8888-4339-ae15-c306d2e6508a', 'offer', '', 'https://travelvela-html.vercel.app/images/offer-banner/1.avif', 'https://travelvela-html.vercel.app/pricing.html', true, 1, '2026-03-01 10:11:33.554895+00'),
  ('63cec0cf-4d64-4e0d-8239-8ea2abff26ae', 'gfd', '', 'https://travelvela-html.vercel.app/images/offer-banner/2.avif', 'https://travelvela-html.vercel.app/images/offer-banner/2.avif', true, 3, '2026-03-01 10:12:20.586118+00')
ON CONFLICT (id) DO NOTHING;

-- Insert api_settings
INSERT INTO public.api_settings (id, provider, settings, is_active, created_at)
VALUES
  ('b1ab890f-ca84-4e18-b41a-78e97ff3db46', 'local_inventory', '{"type":"flights"}', false, '2026-02-27 16:38:01.442505+00'),
  ('86430c54-38ec-4282-bde4-11e3d9fd7999', 'travelvela', '{}', false, '2026-02-28 20:42:07.55977+00'),
  ('f473fc93-a72f-44f1-81fa-e1f45fbb9bcd', 'flight_markup', '{"type":"percentage","value":5}', true, '2026-02-27 18:45:28.747665+00'),
  ('cea2d7cc-4846-4ded-8089-69179598d7c2', 'site_general', '{"default_currency":"BDT","default_language":"English","maintenance_mode":false,"show_prices_bdt":true,"site_name":"Travel Vela","tagline":"Travel Simply","user_registration":true}', true, '2026-03-01 09:27:03.782371+00'),
  ('fe1d91f8-303f-4ade-8c19-d34e40991f8c', 'taxes_fees', '{"convenience_fee_percentage":0,"service_fee":0,"tax_percentage":0}', true, '2026-02-27 20:26:59.851389+00'),
  ('726ce839-62ce-4330-9bfa-59981115d120', 'travelvela_hotel', '{}', true, '2026-03-05 21:49:50.643685+00'),
  ('c891a08b-0f11-4606-aefb-b5b64edd973e', 'tripjack_hotel', '{"environment":"production","production_host":"api.tripjack.com"}', false, '2026-03-05 19:39:50.068189+00'),
  ('f718222f-4d41-4663-b467-726609312e14', 'ait_settings', '{"per_api":{"amadeus":0,"travelport":0.3,"travelvela":0,"tripjack":0}}', true, '2026-03-08 08:27:59.985811+00'),
  ('ed401a06-4015-44c8-ab6a-9071e888e518', 'amadeus', '{"environment":"test"}', false, '2026-02-27 16:36:07.813547+00'),
  ('f3d8950d-f005-4f0c-ae3a-1b581391fb77', 'travelport', '{"endpoint":"https://apac.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService","environment":"production","student_fare_enabled":true}', true, '2026-02-27 15:30:28.453661+00'),
  ('e7239b98-8cf9-4fb1-9a89-54f66f72282e', 'tripjack_flight', '{"environment":"production"}', true, '2026-03-05 20:16:27.587296+00'),
  ('9dc9f7ff-78a7-4616-a632-36b93be3a226', 'site_apps', '{"crisp_enabled":true,"crisp_website_id":"7b6ec17d-256a-41e8-9732-17ff58bd51e9","google_place_id":"","google_reviews":false,"tawkto":false,"tawkto_id":"","whatsapp_number":"","whatsapp_widget":true}', true, '2026-03-08 09:41:25.106574+00'),
  ('0d90080f-6179-4127-b6ee-b5663bda7ac9', 'site_payment', '{"bank_transfer_enabled":true,"bkash_enabled":true,"nagad_enabled":false,"sandbox_mode":true,"stripe_enabled":false,"stripe_pk":"","stripe_sk":""}', true, '2026-03-04 15:08:48.583663+00'),
  ('dd65d03a-8493-4af0-b682-0ffdcde4700c', 'site_contact', '{"address":"Bashori Bhaban, Police Line Road, Barishal","business_name":"Travel Vela","civil_aviation_license":"","email":"","iata_number":"","maps_url":"","phone":"01870802030","whatsapp":""}', true, '2026-03-04 16:45:21.513499+00'),
  ('5bcc887b-62df-4e43-a568-32df0edd0be6', 'api_markup', '{"airline_markups":{},"markup_percentage":2,"per_api":{"amadeus":{"airlines":{},"global":1},"travelport":{"airlines":{},"global":2},"travelvela":{"airlines":{},"global":1},"tripjack":{"airlines":{},"global":3}}}', true, '2026-02-27 19:00:53.475606+00'),
  ('c045246d-3197-475c-88cf-7c949ebee186', 'site_branding', '{"accent_color":"#10b981","color_accent":"#ff6b2c","color_accent_foreground":"#ffffff","color_background":"#f7fafd","color_border":"#d0e3f2","color_card":"#ffffff","color_card_foreground":"#0a1929","color_destructive":"#e53935","color_foreground":"#0a1929","color_muted":"#edf3f8","color_muted_foreground":"#5a7a99","color_primary":"#0092ff","color_primary_foreground":"#ffffff","color_secondary":"#e8f4ff","color_secondary_foreground":"#003d6b","favicon_url":"https://travelvela-html.vercel.app/images/favicon.png","footer_text":"© 2026 Travel Vela. All rights reserved.","logo_url":"https://travelvela-html.vercel.app/images/logo.png","primary_color":"#0092ff","secondary_color":"#f59e0b"}', true, '2026-03-01 09:28:10.92761+00')
ON CONFLICT (provider) DO UPDATE SET settings = EXCLUDED.settings, is_active = EXCLUDED.is_active;
