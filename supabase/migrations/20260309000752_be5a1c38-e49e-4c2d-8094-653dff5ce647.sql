-- Remove demo/seed tour records
DELETE FROM public.tours WHERE id IN (
  '2650592a-505c-4635-9cb4-229c7b5dab4e', -- Romantic Paris
  '5b8c4132-c606-4420-80b0-e3d871f68167', -- Japan Explorer
  '093b5c1b-5bd6-4889-b929-f44d6d10aeb5', -- Bali Paradise
  '1ec17db4-629f-4e79-b485-883c8c320652', -- Dubai Luxury
  '46d2c47f-6ee9-4fb4-a9b8-cd3ebd495d32', -- Greek Islands
  'e41683bf-9fce-4caf-a19d-ab1b9174287e'  -- NYC Adventure
);