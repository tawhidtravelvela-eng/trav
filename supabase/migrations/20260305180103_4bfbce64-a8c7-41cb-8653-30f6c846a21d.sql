
-- Ticket requests table for reissue/refund requests
CREATE TABLE public.ticket_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'refund',
  status text NOT NULL DEFAULT 'pending',
  reason text NOT NULL DEFAULT '',
  new_travel_date text,
  admin_notes text DEFAULT '',
  quote_amount numeric DEFAULT 0,
  charges numeric DEFAULT 0,
  refund_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON public.ticket_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own requests" ON public.ticket_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own requests" ON public.ticket_requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all requests" ON public.ticket_requests FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Wallet transactions table
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'credit',
  description text NOT NULL DEFAULT '',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet transactions" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all wallet transactions" ON public.wallet_transactions FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger for ticket_requests
CREATE TRIGGER update_ticket_requests_updated_at
  BEFORE UPDATE ON public.ticket_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
