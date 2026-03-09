
-- Create api_settings table for storing API credentials
CREATE TABLE public.api_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/manage API settings
CREATE POLICY "Admins can manage api_settings"
  ON public.api_settings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_api_settings_updated_at
  BEFORE UPDATE ON public.api_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default Travelport row
INSERT INTO public.api_settings (provider, settings, is_active)
VALUES ('travelport', '{"target_branch": "", "username": "", "password": "", "endpoint": "https://americas.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService"}'::jsonb, false);
