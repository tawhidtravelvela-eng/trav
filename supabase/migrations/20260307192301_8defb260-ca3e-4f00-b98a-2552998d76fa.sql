
-- Add billing_currency to profiles with default USD
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS billing_currency TEXT NOT NULL DEFAULT 'USD';
