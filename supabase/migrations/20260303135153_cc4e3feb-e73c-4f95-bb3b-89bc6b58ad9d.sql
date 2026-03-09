
CREATE POLICY "Admins can delete popular routes"
  ON public.popular_routes FOR DELETE
  USING (has_role(auth.uid(), 'admin'));
