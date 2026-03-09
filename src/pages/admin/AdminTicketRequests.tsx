import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/contexts/CurrencyContext";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Clock, CheckCircle2, XCircle, Send, Loader2, Wallet, CreditCard, Eye } from "lucide-react";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";

interface TicketRequest {
  id: string;
  booking_id: string;
  user_id: string;
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
  booking?: { booking_id: string; title: string; total: number; status: string };
  profile?: { full_name: string | null; email: string | null };
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20" },
  quoted: { label: "Quoted", color: "bg-primary/10 text-primary border-primary/20" },
  accepted: { label: "Accepted", color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20" },
  processing: { label: "Processing", color: "bg-primary/10 text-primary border-primary/20" },
  completed: { label: "Completed", color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20" },
  rejected: { label: "Rejected", color: "bg-destructive/10 text-destructive border-destructive/20" },
  cancelled: { label: "Cancelled", color: "bg-muted text-muted-foreground border-border" },
};

const AdminTicketRequests = () => {
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [quoteDialog, setQuoteDialog] = useState<TicketRequest | null>(null);
  const [viewDialog, setViewDialog] = useState<TicketRequest | null>(null);
  const [completeDialog, setCompleteDialog] = useState<TicketRequest | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [charges, setCharges] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [refundMethodOverride, setRefundMethodOverride] = useState<string>("");
  const { formatPrice } = useCurrency();
  const { adminTenantId } = useAdminTenantFilter();

  const fetchRequests = async () => {
    setLoading(true);
    let query = supabase
      .from("ticket_requests" as any)
      .select("*")
      .order("created_at", { ascending: false });
    
    if (adminTenantId) {
      query = query.eq("tenant_id", adminTenantId);
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Failed to load requests");
      setLoading(false);
      return;
    }

    const items = (data || []) as any[];

    // Enrich with booking + profile data
    if (items.length > 0) {
      const bookingIds = [...new Set(items.map((r: any) => r.booking_id))];
      const userIds = [...new Set(items.map((r: any) => r.user_id))];

      const [bookingsRes, profilesRes] = await Promise.all([
        supabase.from("bookings").select("id, booking_id, title, total, status").in("id", bookingIds),
        supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds),
      ]);

      const bookingsMap = new Map((bookingsRes.data || []).map(b => [b.id, b]));
      const profilesMap = new Map((profilesRes.data || []).map(p => [p.user_id, p]));

      items.forEach((r: any) => {
        r.booking = bookingsMap.get(r.booking_id) || null;
        r.profile = profilesMap.get(r.user_id) || null;
      });
    }

    setRequests(items);
    setLoading(false);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  // Send quote to customer
  const handleSendQuote = async () => {
    if (!quoteDialog) return;
    const amt = parseFloat(quoteAmount);
    const chrg = parseFloat(charges) || 0;
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid quote amount");
      return;
    }

    setActionLoading(true);
    const { error } = await supabase
      .from("ticket_requests" as any)
      .update({
        status: "quoted",
        quote_amount: amt,
        charges: chrg,
        admin_notes: adminNotes.trim(),
      } as any)
      .eq("id", quoteDialog.id);
    setActionLoading(false);

    if (error) {
      toast.error("Failed to send quote");
      return;
    }

    toast.success("Quote sent to customer");
    setQuoteDialog(null);
    setQuoteAmount("");
    setCharges("");
    setAdminNotes("");
    fetchRequests();
  };

  // Reject request
  const handleReject = async (req: TicketRequest) => {
    const { error } = await supabase
      .from("ticket_requests" as any)
      .update({ status: "rejected", admin_notes: "Request rejected by admin" } as any)
      .eq("id", req.id);

    if (error) { toast.error("Failed"); return; }
    toast.success("Request rejected");
    fetchRequests();
  };

  // Mark as processing
  const handleProcess = async (req: TicketRequest) => {
    const { error } = await supabase
      .from("ticket_requests" as any)
      .update({ status: "processing" } as any)
      .eq("id", req.id);

    if (error) { toast.error("Failed"); return; }
    toast.success("Marked as processing");
    fetchRequests();
  };

  // Complete the request (refund to wallet or gateway)
  const handleComplete = async () => {
    if (!completeDialog) return;
    setActionLoading(true);

    const req = completeDialog;
    const method = refundMethodOverride || req.refund_method || "wallet";

    // If refund to wallet, create wallet transaction
    if (req.type === "refund" && method === "wallet" && req.quote_amount > 0) {
      const { error: walletError } = await supabase
        .from("wallet_transactions" as any)
        .insert({
          user_id: req.user_id,
          amount: req.quote_amount,
          type: "credit",
          description: `Refund for booking ${req.booking?.booking_id || req.booking_id}`,
          reference_id: req.id,
        });
      if (walletError) {
        toast.error("Failed to credit wallet: " + walletError.message);
        setActionLoading(false);
        return;
      }
    }

    // Update request status
    const { error } = await supabase
      .from("ticket_requests" as any)
      .update({
        status: "completed",
        refund_method: method,
        admin_notes: adminNotes.trim() || req.admin_notes,
      } as any)
      .eq("id", req.id);

    setActionLoading(false);

    if (error) {
      toast.error("Failed to complete");
      return;
    }

    toast.success(req.type === "refund" ? `Refund completed via ${method}` : "Reissue completed");
    setCompleteDialog(null);
    setAdminNotes("");
    setRefundMethodOverride("");
    fetchRequests();
  };

  // Count badges
  const pendingCount = requests.filter(r => r.status === "pending").length;
  const acceptedCount = requests.filter(r => r.status === "accepted").length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Ticket Requests</h1>
        <p className="text-sm text-muted-foreground">Manage reissue and refund requests</p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge className="bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border border-[hsl(var(--warning))]/20">
              {pendingCount} pending
            </Badge>
          )}
          {acceptedCount > 0 && (
            <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border border-[hsl(var(--success))]/20">
              {acceptedCount} accepted
            </Badge>
          )}
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">All ({requests.length})</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
            <TabsTrigger value="quoted" className="text-xs">Quoted</TabsTrigger>
            <TabsTrigger value="accepted" className="text-xs">Accepted</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No requests found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase font-semibold">Customer</TableHead>
                  <TableHead className="text-xs uppercase font-semibold">Booking</TableHead>
                  <TableHead className="text-xs uppercase font-semibold">Type</TableHead>
                  <TableHead className="text-xs uppercase font-semibold">Status</TableHead>
                  <TableHead className="text-xs uppercase font-semibold">Amount</TableHead>
                  <TableHead className="text-xs uppercase font-semibold">Date</TableHead>
                  <TableHead className="text-xs uppercase font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((req) => {
                  const cfg = statusConfig[req.status] || statusConfig.pending;
                  return (
                    <TableRow key={req.id} className="hover:bg-muted/20">
                      <TableCell>
                        <p className="text-sm font-medium text-foreground">{req.profile?.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{req.profile?.email || "—"}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-xs text-foreground">{req.booking?.booking_id || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">{req.booking?.title || "—"}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {req.type === "reissue"
                            ? <RefreshCw className="w-3.5 h-3.5 text-primary" />
                            : <RotateCcw className="w-3.5 h-3.5 text-accent" />
                          }
                          <span className="text-sm capitalize">{req.type}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs border ${cfg.color}`}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {req.quote_amount > 0 ? (
                          <span className="text-sm font-semibold">{formatPrice(req.quote_amount)}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewDialog(req)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {req.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                                setQuoteDialog(req);
                                setQuoteAmount("");
                                setCharges("");
                                setAdminNotes("");
                              }}>
                                <Send className="w-3.5 h-3.5 mr-1" /> Quote
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => handleReject(req)}>
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {req.status === "accepted" && (
                            <>
                              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleProcess(req)}>
                                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Process
                              </Button>
                            </>
                          )}
                          {req.status === "processing" && (
                            <Button size="sm" className="h-8 text-xs" onClick={() => {
                              setCompleteDialog(req);
                              setRefundMethodOverride(req.refund_method || "wallet");
                              setAdminNotes(req.admin_notes || "");
                            }}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Complete
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View dialog */}
      <Dialog open={!!viewDialog} onOpenChange={() => setViewDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {viewDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 capitalize">
                  {viewDialog.type === "reissue" ? <RefreshCw className="w-5 h-5 text-primary" /> : <RotateCcw className="w-5 h-5 text-accent" />}
                  {viewDialog.type} Request Details
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Customer:</span><p className="font-medium">{viewDialog.profile?.full_name || "—"}</p></div>
                  <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{viewDialog.profile?.email || "—"}</p></div>
                  <div><span className="text-muted-foreground">Booking:</span><p className="font-mono font-medium">{viewDialog.booking?.booking_id || "—"}</p></div>
                  <div><span className="text-muted-foreground">Original Amount:</span><p className="font-medium">{formatPrice(viewDialog.booking?.total || 0)}</p></div>
                  {viewDialog.new_travel_date && <div><span className="text-muted-foreground">New Date:</span><p className="font-medium">{viewDialog.new_travel_date}</p></div>}
                  {viewDialog.refund_method && <div><span className="text-muted-foreground">Refund Method:</span><p className="font-medium capitalize">{viewDialog.refund_method}</p></div>}
                  {viewDialog.quote_amount > 0 && <div><span className="text-muted-foreground">Quote:</span><p className="font-bold text-primary">{formatPrice(viewDialog.quote_amount)}</p></div>}
                  {viewDialog.charges > 0 && <div><span className="text-muted-foreground">Charges:</span><p className="font-medium">{formatPrice(viewDialog.charges)}</p></div>}
                </div>
                <div>
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="font-medium mt-1 bg-muted/50 rounded-lg p-3">{viewDialog.reason}</p>
                </div>
                {viewDialog.admin_notes && (
                  <div>
                    <span className="text-muted-foreground">Admin Notes:</span>
                    <p className="font-medium mt-1 bg-primary/5 rounded-lg p-3">{viewDialog.admin_notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Quote dialog */}
      <Dialog open={!!quoteDialog} onOpenChange={() => setQuoteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {quoteDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-primary" />
                  Send {quoteDialog.type === "reissue" ? "Reissue" : "Refund"} Quote
                </DialogTitle>
                <DialogDescription>
                  {quoteDialog.booking?.booking_id} — Original: {formatPrice(quoteDialog.booking?.total || 0)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm">
                    {quoteDialog.type === "reissue" ? "Charges (fare difference + fees)" : "Refund Charges / Penalty"}
                  </Label>
                  <Input type="number" placeholder="0" value={charges} onChange={(e) => setCharges(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">
                    {quoteDialog.type === "reissue" ? "Total Amount to Pay" : "Refund Amount (after charges)"}
                  </Label>
                  <Input type="number" placeholder="Enter amount" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-sm">Notes to Customer</Label>
                  <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Optional notes…" rows={2} className="mt-1" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setQuoteDialog(null)}>Cancel</Button>
                <Button onClick={handleSendQuote} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                  Send Quote
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={!!completeDialog} onOpenChange={() => setCompleteDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {completeDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[hsl(var(--success))]" />
                  Complete {completeDialog.type === "reissue" ? "Reissue" : "Refund"}
                </DialogTitle>
                <DialogDescription>
                  {completeDialog.type === "refund"
                    ? `Refund ${formatPrice(completeDialog.quote_amount)} to the customer.`
                    : `Finalize the reissue for ${completeDialog.booking?.booking_id}.`
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {completeDialog.type === "refund" && (
                  <div>
                    <Label className="text-sm font-medium">Refund Method</Label>
                    <Select value={refundMethodOverride} onValueChange={setRefundMethodOverride}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wallet">
                          <div className="flex items-center gap-2"><Wallet className="w-4 h-4" /> Wallet Credit</div>
                        </SelectItem>
                        <SelectItem value="gateway">
                          <div className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payment Gateway</div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-sm">Admin Notes</Label>
                  <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Final notes…" rows={2} className="mt-1" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCompleteDialog(null)}>Cancel</Button>
                <Button onClick={handleComplete} disabled={actionLoading}>
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  {completeDialog.type === "refund" ? "Process Refund" : "Complete Reissue"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminTicketRequests;
