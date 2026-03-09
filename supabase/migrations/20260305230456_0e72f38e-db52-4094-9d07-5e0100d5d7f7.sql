-- Fix security definer view by making it invoker
DROP VIEW IF EXISTS public.hotel_popularity;
CREATE OR REPLACE VIEW public.hotel_popularity WITH (security_invoker = true) AS
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