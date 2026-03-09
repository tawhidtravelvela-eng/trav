import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useCurrency } from "@/contexts/CurrencyContext";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { RefreshCw, RotateCcw, Clock, CheckCircle2, XCircle, ArrowRight, AlertCircle, Wallet, CreditCard } from "lucide-react";

interface TicketRequest {
  id: string;
  booking_id: string;
  type: string;
  status: string;
  reason: string;
  new_travel_date: string | null;
  admin_notes: string;
  quote_amount: number;
  charges: number;
  refund_method: string | null;
  created_at: string;
  updated_at: string;
  booking?: { booking_id: string; title: string; total: number };
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending Review", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20", icon: Clock },
  quoted: { label: "Quote Received", color: "bg-primary/10 text-primary border-primary/20", icon: AlertCircle },
  accepted: { label: "Accepted", color: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  processing: { label: "Processing", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20", icon: RefreshCw },
  completed: { label: "Completed", color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  cancelled: { label: "Cancelled", color: "bg-muted text-muted-foreground border-border", icon: XCircle },
};

interface Props {
  userId: string;
  refreshKey: number;
}

export default function TicketRequestsList({ userId, refreshKey }: Props) {
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteDialog, setQuoteDialog] = useState<TicketRequest | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { formatPrice } = useCurrency();

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ticket_requests" as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching requests:", error);
      setLoading(false);
      return;
    }

    const items = (data || []) as any[];

    // Fetch booking info for each request
    if (items.length > 0) {
      const bookingIds = [...new Set(items.map((r: any) => r.booking_id))];
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("id, booking_id, title, total")
        .in("id", bookingIds);

      const bookingsMap = new Map((bookingsData || []).map(b => [b.id, b]));
      items.forEach((r: any) => {
        r.booking = bookingsMap.get(r.booking_id) || null;
      });
    }

    setRequests(items);
    setLoading(false);
  };

  useEffect(() => {
    if (userId) fetchRequests();
  }, [userId, refreshKey]);

  const handleAcceptQuote = async (request: TicketRequest) => {
    setActionLoading(true);
    const { error } = await supabase
      .from("ticket_requests" as any)
      .update({ status: "accepted" } as any)
      .eq("id", request.id);
    setActionLoading(false);

    if (error) {
      toast.error("Failed to accept quote");
      return;
    }

    toast.success(request.type === "reissue" ? "Reissue quote accepted! Admin will process your request." : "Refund accepted! Admin will process your refund.");
    setQuoteDialog(null);
    fetchRequests();
  };

  const handleRejectQuote = async (request: TicketRequest) => {
    setActionLoading(true);
    const { error } = await supabase
      .from("ticket_requests" as any)
      .update({ status: "cancelled" } as any)
      .eq("id", request.id);
    setActionLoading(false);

    if (error) {
      toast.error("Failed to cancel request");
      return;
    }

    toast.success("Request cancelled");
    setQuoteDialog(null);
    fetchRequests();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent mx-auto" />
        </CardContent>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <RefreshCw className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Requests Yet</h3>
          <p className="text-sm text-muted-foreground">Your reissue and refund requests will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {requests.map((req, i) => {
          const cfg = statusConfig[req.status] || statusConfig.pending;
          const StatusIcon = cfg.icon;
          return (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${req.type === "reissue" ? "bg-primary/10" : "bg-accent/10"}`}>
                      {req.type === "reissue"
                        ? <RefreshCw className="w-5 h-5 text-primary" />
                        : <RotateCcw className="w-5 h-5 text-accent" />
                      }
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground capitalize">{req.type} Request</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${cfg.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {req.booking?.booking_id || "—"} · {req.booking?.title || "Booking"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{req.reason}</p>
                    </div>

                    {/* Quote amount & actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {req.status === "quoted" && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {req.type === "reissue" ? "Reissue Fee" : "Refund Amount"}
                          </p>
                          <p className="text-sm font-bold text-foreground">{formatPrice(req.quote_amount)}</p>
                        </div>
                      )}
                      {req.status === "completed" && req.quote_amount > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">
                            {req.type === "reissue" ? "Paid" : "Refunded"}
                          </p>
                          <p className="text-sm font-bold text-[hsl(var(--success))]">{formatPrice(req.quote_amount)}</p>
                        </div>
                      )}
                      {req.status === "quoted" && (
                        <Button size="sm" onClick={() => setQuoteDialog(req)}>
                          Review <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Submitted {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {req.new_travel_date && <> · New date: {req.new_travel_date}</>}
                    {req.refund_method && <> · Refund to: {req.refund_method === "wallet" ? "Wallet" : "Payment Gateway"}</>}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Quote review dialog */}
      <Dialog open={!!quoteDialog} onOpenChange={() => setQuoteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {quoteDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {quoteDialog.type === "reissue"
                    ? <><RefreshCw className="w-5 h-5 text-primary" /> Reissue Quote</>
                    : <><RotateCcw className="w-5 h-5 text-primary" /> Refund Quote</>
                  }
                </DialogTitle>
                <DialogDescription>
                  Review the quote from our team for your {quoteDialog.type} request.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                {/* Booking info */}
                <div className="rounded-xl bg-muted/50 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Booking</span>
                    <span className="font-mono font-medium text-foreground">{quoteDialog.booking?.booking_id}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Original Amount</span>
                    <span className="font-medium text-foreground">{formatPrice(quoteDialog.booking?.total || 0)}</span>
                  </div>
                </div>

                {/* Quote details */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                  {quoteDialog.charges > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {quoteDialog.type === "reissue" ? "Reissue Charges" : "Refund Charges"}
                      </span>
                      <span className="font-medium text-foreground">{formatPrice(quoteDialog.charges)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-foreground">
                      {quoteDialog.type === "reissue" ? "Amount to Pay" : "Refund Amount"}
                    </span>
                    <span className="text-primary text-lg">{formatPrice(quoteDialog.quote_amount)}</span>
                  </div>
                  {quoteDialog.type === "refund" && quoteDialog.refund_method && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-primary/10">
                      {quoteDialog.refund_method === "wallet"
                        ? <><Wallet className="w-3.5 h-3.5" /> Refund to Wallet</>
                        : <><CreditCard className="w-3.5 h-3.5" /> Refund to Original Payment Method</>
                      }
                    </div>
                  )}
                </div>

                {/* Admin notes */}
                {quoteDialog.admin_notes && (
                  <div className="rounded-xl bg-muted/50 p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Admin Notes</p>
                    <p className="text-sm text-foreground">{quoteDialog.admin_notes}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => handleRejectQuote(quoteDialog)} disabled={actionLoading} className="flex-1">
                  Decline
                </Button>
                <Button onClick={() => handleAcceptQuote(quoteDialog)} disabled={actionLoading} className="flex-1">
                  {actionLoading ? "Processing…" : quoteDialog.type === "reissue" ? "Accept & Pay" : "Accept Refund"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
