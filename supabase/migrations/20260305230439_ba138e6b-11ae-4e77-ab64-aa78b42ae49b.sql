-- Hotel interaction tracking for AI-powered ranking
CREATE TABLE public.hotel_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id text NOT NULL,
  hotel_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  stars integer NOT NULL DEFAULT 0,
  action text NOT NULL DEFAULT 'view',
  session_id text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_interactions_hotel_id ON public.hotel_interactions(hotel_id);
CREATE INDEX idx_hotel_interactions_created_at ON public.hotel_interactions(created_at);

ALTER TABLE public.hotel_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert interactions"
  ON public.hotel_interactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all interactions"
  ON public.hotel_interactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.hotel_popularity AS
SELECT 
  hotel_id,
  hotel_name,
  city,
  stars,
  COUNT(*) FILTER (WHERE action = 'view') as view_count,
  COUNT(*) FILTER (WHERE action = 'click') as click_count,
  COUNT(*) FILTER (WHERE action = 'book') as booking_count,
  CASE WHEN COUNT(*) FILTER (WHERE action = 'view') > 0 
    THEN ROUND(COUNT(*) FILTER (WHERE action = 'click')::numeric / COUNT(*) FILTER (WHERE action = 'view')::numeric, 3)
    ELSE 0 END as ctr,
  CASE WHEN COUNT(*) FILTER (WHERE action = 'click') > 0 
    THEN ROUND(COUNT(*) FILTER (WHERE action = 'book')::numeric / COUNT(*) FILTER (WHERE action = 'click')::numeric, 3)
    ELSE 0 END as conversion_rate,
  COUNT(*) FILTER (WHERE action = 'view') * 1 
  + COUNT(*) FILTER (WHERE action = 'click') * 5 
  + COUNT(*) FILTER (WHERE action = 'book') * 20 as popularity_score
FROM public.hotel_interactions
WHERE created_at > now() - interval '90 days'
GROUP BY hotel_id, hotel_name, city, stars;