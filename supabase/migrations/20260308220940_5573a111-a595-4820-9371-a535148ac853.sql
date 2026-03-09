
-- Add missing columns
ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.popular_routes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Hotels data
INSERT INTO public.hotels (id, name, city, rating, reviews, price, image, amenities, stars, is_active, created_at)
VALUES
('ada54958-ce57-476d-9e72-5ea76e7a13a2','Grand Palace Hotel','Paris',4.8,2340,250,'dest-paris','["WiFi","Pool","Spa","Restaurant","Gym"]'::jsonb,5,true,'2026-02-27 13:11:27.452392+00'),
('91514563-23a8-46d1-b4e4-eb09d3c8b781','Tokyo Bay Resort','Tokyo',4.7,1890,180,'dest-tokyo','["WiFi","Restaurant","Bar","Gym"]'::jsonb,4,true,'2026-02-27 13:11:27.452392+00'),
('c57ae804-0fcb-4a11-ac4e-ad3efed45ff7','Bali Zen Villas','Bali',4.9,3200,320,'dest-bali','["WiFi","Pool","Spa","Restaurant","Beach Access"]'::jsonb,5,true,'2026-02-27 13:11:27.452392+00'),
('5dd36b87-dea0-4eb9-8a05-aa450caa6634','Burj View Suites','Dubai',4.6,1560,400,'dest-dubai','["WiFi","Pool","Spa","Restaurant","Gym","Bar"]'::jsonb,5,true,'2026-02-27 13:11:27.452392+00'),
('c7c236c9-0a3b-46f3-86cc-0ec9d3873564','Aegean Blue Hotel','Santorini',4.8,980,280,'dest-santorini','["WiFi","Pool","Restaurant","Sea View"]'::jsonb,4,true,'2026-02-27 13:11:27.452392+00'),
('4532d67d-5b5e-4de3-b312-64f6fe266d33','Manhattan Central Inn','New York',4.4,4100,199,'dest-newyork','["WiFi","Restaurant","Gym","Bar"]'::jsonb,4,true,'2026-02-27 13:11:27.452392+00')
ON CONFLICT (id) DO NOTHING;

-- Offers data
INSERT INTO public.offers (id, title, description, discount, color, is_active, created_at)
VALUES
('ae8a3435-022a-41b6-b965-618e01322c93','Summer Sale','Flights & Hotels','40% OFF','primary',true,'2026-03-03 07:59:54.161211+00'),
('79865e24-f964-4266-abd1-6f41771a1755','Hotel Deals','Luxury stays at budget prices','10% OFF','accent',true,'2026-03-03 07:59:54.161211+00'),
('9f137e8a-07da-4922-a64b-1634e00ea357','Honeymoon Special','Free room upgrade on packages','FREE UPGRADE','success',true,'2026-03-03 07:59:54.161211+00')
ON CONFLICT (id) DO NOTHING;

-- Provider groups data
INSERT INTO public.provider_groups (id, name, description, providers, created_at)
VALUES
('cb3d35b4-00e5-45d9-9ab9-ff2f091b7e0c','APAC','Asia-Pacific region — Travelport + Tripjack','{"amadeus":false,"travelport":true,"travelvela":false,"tripjack":true}'::jsonb,'2026-03-07 18:45:43.151033+00'),
('5b78950f-9b8e-4048-91d5-076d65814ac2','Europe','Europe region — Amadeus + Travelport','{"amadeus":true,"travelport":true,"travelvela":false,"tripjack":false}'::jsonb,'2026-03-07 18:45:43.151033+00'),
('447d9a4c-4ebd-4ec9-a20c-9689d77ffdb4','Global','Full access to all providers','{"amadeus":true,"travelport":true,"travelvela":true,"tripjack":true}'::jsonb,'2026-03-07 18:45:43.151033+00')
ON CONFLICT (id) DO NOTHING;

-- Popular routes data
INSERT INTO public.popular_routes (id, from_code, to_code, from_city, to_city, search_count, lowest_price, currency, airline, duration, stops, last_searched_at, created_at)
VALUES
('58612889-1634-4a08-832b-6be035f8352d','DAC','CGP','Dhaka','Chittagong',38,4500,'BDT','BG','45m',0,'2026-03-03 13:58:40.627823+00','2026-03-03 13:58:40.627823+00'),
('90bb15ed-8320-47d6-b9fa-2a6de70f43c3','DAC','MLE','DAC','DAC',1,47490,'INR','8D','24h 16m',3,'2026-03-08 09:06:25.496583+00','2026-03-08 09:06:25.496583+00'),
('1280e38f-048e-49dd-8ddb-44bc34a11008','DAC','KUL','Dhaka','Kuala Lumpur',25,28500,'BDT','MH','4h 15m',0,'2026-03-03 13:58:40.627823+00','2026-03-03 13:58:40.627823+00'),
('65df622b-4b21-4ffa-a424-b7ef2b0b7029','DAC','DXB','DAC','DXB',49,28217,'INR','AI','8h 30m',1,'2026-03-08 10:49:21.676184+00','2026-03-03 13:55:25.780713+00'),
('9cd0464c-8e49-4e92-a49b-fd2ebcd37e7f','DAC','ROR','DAC','ROR',12,225392,'INR','CZ','41h 0m',2,'2026-03-06 21:03:01.275356+00','2026-03-06 20:50:47.660625+00'),
('71395c88-f9cd-4784-8626-ce1beb500a11','DAC','FCO','DAC','FCO',9,38787,'INR','MU','33h 35m',2,'2026-03-06 21:16:24.061608+00','2026-03-06 21:03:59.395375+00'),
('58b94490-d5b6-4f08-8192-bc2e9c984e26','CKG','DAC','CKG','DAC',1,44728,'BDT','CZ','20h 15m',1,'2026-03-08 16:18:52.395111+00','2026-03-08 16:18:52.395111+00'),
('c75ed1f3-220e-49f5-83cb-41b64b6fe915','DAC','CAN','DAC','CAN',33,22063,'INR','6E','7h 50m',1,'2026-03-08 16:53:09.579912+00','2026-03-04 15:07:36.975762+00'),
('bd8c88da-2daa-4da7-a9ef-593d070e081e','DAC','CKG','DAC','CKG',127,24953,'INR','MU','17h 30m',1,'2026-03-08 17:41:08.363734+00','2026-03-03 18:27:42.29487+00'),
('8e9a64db-d3cb-4593-8cce-52b7fe42513e','DAC','DAC','DAC','USM',1,215161,'BDT','SQ','7h 5m',1,'2026-03-08 17:42:29.05368+00','2026-03-08 17:42:29.05368+00'),
('263188a7-0dd1-4610-8f08-7526f867342a','DAC','BKK','DAC','DAC',23,22800,'BDT','TG','3h 30m',0,'2026-03-08 17:48:05.017973+00','2026-03-03 13:58:40.627823+00'),
('86644807-bef0-45ea-bbdd-c11586fb0e43','DAC','PVG','DAC','PVG',1,30051,'BDT','MU','6h 40m',1,'2026-03-03 20:23:21.341559+00','2026-03-03 20:23:21.341559+00'),
('e531f8ba-5111-468c-afc0-c5090a1159c0','DAC','CDG','DAC','CDG',18,38787,'INR','MU','20h 55m',2,'2026-03-06 21:49:02.63136+00','2026-03-06 21:21:07.840801+00'),
('19d11d50-eed4-492c-b46f-ef03229fd8a4','DAC','CXB','DAC','CXB',41,5049,'BDT','BS','1h 5m',0,'2026-03-05 21:39:27.494046+00','2026-03-03 13:58:40.627823+00'),
('7ba08535-90fc-4dd1-9b25-c64742456e79','DAC','SIN','DAC','SIN',16,31200,'BDT','SQ','4h 45m',0,'2026-03-04 13:28:36.503955+00','2026-03-03 13:58:40.627823+00'),
('8daed13b-42a7-4cb9-86d8-3f4820dc885f','CAN','DAC','CAN','DAC',2,18267,'BDT','UL','11h 30m',1,'2026-03-04 16:17:51.670869+00','2026-03-04 15:10:31.704778+00'),
('3aad3311-3037-4232-bc99-0f05c0f3db50','DAC','DEL','DAC','DEL',63,10720,'INR','6E','16h 10m',1,'2026-03-07 21:34:04.111952+00','2026-03-07 16:27:37.090335+00'),
('5561811f-f33c-4937-9575-354e2ae1a665','DAC','CCU','DAC','CCU',42,6259,'INR','6E','1h 5m',0,'2026-03-07 21:53:11.216374+00','2026-03-06 20:17:07.88747+00'),
('0696343e-77cc-4797-a7f6-25ef573c288a','DAC','SHJ','DAC','SHJ',1,39426,'INR','X1','15h 35m',1,'2026-03-07 16:03:43.317328+00','2026-03-07 16:03:43.317328+00')
ON CONFLICT (id) DO NOTHING;

-- Hotel interactions data
INSERT INTO public.hotel_interactions (id, hotel_id, hotel_name, city, stars, action, session_id, user_id, created_at)
VALUES
('a367edbc-9855-4e17-a204-dad8d913744a','hsid6808994338-41618602','SAPPHIRE GUEST HOUSE','Kolkata',3,'view','e119e407-2eda-40d4-ac9c-0657ef70462d',NULL,'2026-03-05 23:08:25.220511+00'),
('3dd3baa2-497c-4f44-9f04-fbea424d94ec','hsid6808994338-41618602','SAPPHIRE GUEST HOUSE','Kolkata',3,'view','e119e407-2eda-40d4-ac9c-0657ef70462d',NULL,'2026-03-05 23:08:44.917506+00'),
('5dca3e48-deee-477b-b115-f485751060aa','hsid6808994338-41618602','SAPPHIRE GUEST HOUSE','Kolkata',3,'view','e119e407-2eda-40d4-ac9c-0657ef70462d',NULL,'2026-03-05 23:11:11.326032+00'),
('2058e9bb-d37c-49fc-979b-64f150d7f9a7','hsid1673366645-31981013','ITC Royal Bengal, a Luxury Collection Hotel, Kolkata','Kolkata',5,'view','3f080520-9a8b-432c-b315-de5d0c2999c2',NULL,'2026-03-05 23:11:43.05981+00'),
('71411a55-dfae-46b5-9edc-fc6a60a439f3','hsid1673366645-31981013','ITC Royal Bengal, a Luxury Collection Hotel, Kolkata','Kolkata',5,'click','3f080520-9a8b-432c-b315-de5d0c2999c2',NULL,'2026-03-05 23:11:43.46401+00'),
('7c250dff-9aa3-4aef-86b9-b7a25534d94e','hsid6808994338-41618602','SAPPHIRE GUEST HOUSE','Kolkata',3,'view','e119e407-2eda-40d4-ac9c-0657ef70462d',NULL,'2026-03-05 23:14:22.74352+00'),
('05ebb2ca-133d-455b-a6f7-ee06941559a8','hsid6701909147-31981013','ITC Royal Bengal, a Luxury Collection Hotel, Kolkata','Kolkata',5,'view','9d587638-caa6-4100-86fe-93568d37277f',NULL,'2026-03-05 23:15:36.965854+00'),
('1c0275f7-32f6-45d2-9990-817004835e02','hsid6701909147-31981013','ITC Royal Bengal, a Luxury Collection Hotel, Kolkata','Kolkata',5,'click','9d587638-caa6-4100-86fe-93568d37277f',NULL,'2026-03-05 23:15:36.995855+00'),
('7a1e8475-8cd2-4cc0-bbb7-89f31b52ab90','hsid6808994338-41618602','SAPPHIRE GUEST HOUSE','Kolkata',3,'view','e119e407-2eda-40d4-ac9c-0657ef70462d',NULL,'2026-03-05 23:18:38.581788+00'),
('7b2996c2-b32b-4ae7-8340-4a321bfe0b25','hsid7585180694-31981013','ITC Royal Bengal, a Luxury Collection Hotel, Kolkata','Kolkata',5,'view','3614ea92-b9d6-4430-909a-a8894f449fd9',NULL,'2026-03-06 06:56:36.878553+00'),
('60e1dca5-9209-4906-a130-878b09d32b3e','hsid7585180694-31981013','ITC Royal Bengal, a Luxury Collection Hotel, Kolkata','Kolkata',5,'click','3614ea92-b9d6-4430-909a-a8894f449fd9',NULL,'2026-03-06 06:56:36.878551+00'),
('d02b0599-50c3-4bab-86b8-edd6041b523a','hsid3218963219-16312832','ITC Sonar, a Luxury Collection Hotel, Kolkata','Kolkata',5,'view','b53804f9-8e54-4026-bb1e-a1bbd927e044',NULL,'2026-03-07 14:05:09.509215+00'),
('f042a581-0114-4c0b-ac00-de2ccbb56f51','hsid3218963219-16312832','ITC Sonar, a Luxury Collection Hotel, Kolkata','Kolkata',5,'view','b53804f9-8e54-4026-bb1e-a1bbd927e044',NULL,'2026-03-07 14:05:09.647456+00'),
('15ebddb7-f2aa-46eb-91f8-b018b9d35ca5','hsid3218963219-16312832','ITC Sonar, a Luxury Collection Hotel, Kolkata','Kolkata',5,'click','b53804f9-8e54-4026-bb1e-a1bbd927e044',NULL,'2026-03-07 14:05:09.725789+00')
ON CONFLICT (id) DO NOTHING;
