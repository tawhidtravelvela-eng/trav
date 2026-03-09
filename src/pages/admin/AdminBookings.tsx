import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, Eye, Loader2, CheckCircle, Pencil, Ticket, Link2, Upload, Search, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";

const statusColors: Record<string, string> = {
  Paid: "bg-blue-500/10 text-blue-600 border border-blue-200",
  Pending: "bg-warning text-warning-foreground",
  Confirmed: "bg-success text-success-foreground",
  Cancelled: "bg-destructive text-destructive-foreground",
  "Needs Payment": "bg-orange-500/10 text-orange-600 border border-orange-200",
  "Awaiting Payment": "bg-amber-500/10 text-amber-600 border border-amber-200",
};

const statusLabels: Record<string, string> = {
  Pending: "Payment Pending",
  Paid: "Paid – Awaiting Confirmation",
  Confirmed: "Confirmed",
  Cancelled: "Cancelled",
  "Needs Payment": "Needs Payment",
  "Awaiting Payment": "Awaiting Payment",
};

interface ConfirmationData {
  galileo_pnr?: string;
  airline_pnr?: string;
  tripjack_booking_id?: string;
  passengers?: { name: string; type: string }[];
  etickets?: string[];
  confirmation_number?: string;
}

interface Booking {
  id: string;
  booking_id: string;
  user_id: string;
  type: string;
  title: string;
  subtitle: string | null;
  total: number;
  status: string;
  created_at: string;
  details: any;
  confirmation_number?: string | null;
  confirmation_data?: ConfirmationData | null;
  profile?: { full_name: string | null; email: string | null };
}

const AdminBookings = () => {
  const [filter, setFilter] = useState("All");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewBooking, setViewBooking] = useState<Booking | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<Booking | null>(null);
  const [confirmTargetStatus, setConfirmTargetStatus] = useState<string>("Confirmed");
  const { formatPrice } = useCurrency();
  const { adminTenantId } = useAdminTenantFilter();

  // Confirmation form state
  const [formGalileoPnr, setFormGalileoPnr] = useState("");
  const [formAirlinePnr, setFormAirlinePnr] = useState("");
  const [formEtickets, setFormEtickets] = useState<string[]>([]);
  const [formConfirmationNumber, setFormConfirmationNumber] = useState("");

  // Generate payment link dialog
  const [linkDialog, setLinkDialog] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkResults, setLinkResults] = useState<Booking[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);

  // File upload state
  const [uploadBooking, setUploadBooking] = useState<Booking | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [bookingFiles, setBookingFiles] = useState<Record<string, { name: string; url: string }[]>>({});

  const fetchBookings = async () => {
    setLoading(true);
    let query = supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (adminTenantId) {
      query = query.eq("tenant_id", adminTenantId);
    }

    const { data: bookingsData } = await query;

    if (bookingsData && bookingsData.length > 0) {
      const userIds = [...new Set(bookingsData.map(b => b.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      setBookings(bookingsData.map(b => ({
        ...b,
        confirmation_number: (b as any).confirmation_number || null,
        confirmation_data: (b as any).confirmation_data || null,
        profile: profileMap.get(b.user_id) || undefined,
      })));
    } else {
      setBookings([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchBookings(); }, []);

  // Load files for all bookings
  const loadBookingFiles = async (bookingIds: string[]) => {
    const filesMap: Record<string, { name: string; url: string }[]> = {};
    for (const bid of bookingIds) {
      const { data: files } = await supabase.storage.from("ticket-files").list(bid);
      if (files && files.length > 0) {
        filesMap[bid] = files.map(f => ({
          name: f.name,
          url: supabase.storage.from("ticket-files").getPublicUrl(`${bid}/${f.name}`).data.publicUrl,
        }));
      }
    }
    setBookingFiles(filesMap);
  };

  useEffect(() => {
    if (bookings.length > 0) {
      loadBookingFiles(bookings.map(b => b.id));
    }
  }, [bookings]);

  const copyPaymentLink = (booking: Booking) => {
    const link = `${window.location.origin}/booking/pay/${booking.id}`;
    navigator.clipboard.writeText(link);
    toast.success("Payment link copied to clipboard!");
  };

  const searchForPaymentLink = async () => {
    if (!linkSearch.trim()) return;
    setLinkSearching(true);
    const q = linkSearch.trim();
    // Search by booking_id, confirmation_number, or confirmation_data PNRs
    const { data } = await supabase.from("bookings").select("*").or(
      `booking_id.ilike.%${q}%,confirmation_number.ilike.%${q}%`
    ).order("created_at", { ascending: false }).limit(10);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(b => b.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      setLinkResults(data.map(b => ({
        ...b,
        confirmation_number: (b as any).confirmation_number || null,
        confirmation_data: (b as any).confirmation_data || null,
        profile: profileMap.get(b.user_id) || undefined,
      })));
    } else {
      setLinkResults([]);
    }
    setLinkSearching(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadBooking || !e.target.files?.length) return;
    setUploadingFile(true);
    const file = e.target.files[0];
    const filePath = `${uploadBooking.id}/${file.name}`;
    const { error } = await supabase.storage.from("ticket-files").upload(filePath, file, { upsert: true });
    if (error) { toast.error("Failed to upload file"); setUploadingFile(false); return; }
    toast.success("Ticket file uploaded!");
    setUploadingFile(false);
    // Refresh files
    loadBookingFiles([uploadBooking.id]);
  };

  const deleteFile = async (bookingId: string, fileName: string) => {
    const { error } = await supabase.storage.from("ticket-files").remove([`${bookingId}/${fileName}`]);
    if (error) { toast.error("Failed to delete file"); return; }
    toast.success("File deleted");
    loadBookingFiles([bookingId]);
  };

  const filtered = filter === "All" ? bookings : bookings.filter((b) => b.status === filter);

  const openConfirmDialog = (booking: Booking, targetStatus: string = "Confirmed") => {
    const cd = booking.confirmation_data || {} as ConfirmationData;
    setConfirmDialog(booking);
    setConfirmTargetStatus(targetStatus);
    
    if (booking.type === "Flight") {
      setFormGalileoPnr(cd.galileo_pnr || "");
      setFormAirlinePnr(cd.airline_pnr || "");
      const paxCount = cd.passengers?.length || 0;
      setFormEtickets(cd.etickets && cd.etickets.length === paxCount ? [...cd.etickets] : Array(paxCount).fill(""));
    } else {
      setFormConfirmationNumber(booking.confirmation_number || cd.confirmation_number || "");
    }
  };

  const updateStatus = async (id: string, status: string) => {
    if (status === "Confirmed") {
      const booking = bookings.find(b => b.id === id);
      if (booking) openConfirmDialog(booking);
      return;
    }
    if (status === "Needs Payment") {
      const booking = bookings.find(b => b.id === id);
      if (booking) openConfirmDialog(booking, "Needs Payment");
      return;
    }
    const { error } = await supabase.from("bookings").update({ status } as any).eq("id", id);
    if (error) { toast.error("Failed to update status"); return; }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    toast.success(`Booking updated to ${statusLabels[status] || status}`);
  };

  const handleConfirm = async () => {
    if (!confirmDialog) return;
    const isFlight = confirmDialog.type === "Flight";
    const isNeedsPayment = confirmTargetStatus === "Needs Payment";

    if (isFlight) {
      // For "Needs Payment", require at least one of: confirmation number, CRS PNR, or airline PNR
      const hasAnyRef = formGalileoPnr.trim() || formAirlinePnr.trim() || formConfirmationNumber.trim();
      if (isNeedsPayment && !hasAnyRef) {
        toast.error("Please enter at least one: Confirmation Number, CRS PNR, or Airline PNR");
        return;
      }
      // For "Confirmed", require e-ticket
      if (!isNeedsPayment) {
        const hasEticket = formEtickets.some(t => t.trim());
        if (!hasEticket) { toast.error("Please enter at least one e-ticket number"); return; }
      }
    } else {
      if (!formConfirmationNumber.trim()) { toast.error("Please enter a confirmation number"); return; }
    }

    const cd = confirmDialog.confirmation_data || {} as ConfirmationData;
    const newConfData: ConfirmationData = isFlight
      ? { ...cd, galileo_pnr: formGalileoPnr.trim(), airline_pnr: formAirlinePnr.trim(), etickets: formEtickets.map(t => t.trim()), confirmation_number: formConfirmationNumber.trim() }
      : { ...cd, confirmation_number: formConfirmationNumber.trim() };

    const confirmNumber = isFlight
      ? (formConfirmationNumber.trim() || formAirlinePnr.trim() || formGalileoPnr.trim() || formEtickets.find(t => t.trim()) || "")
      : formConfirmationNumber.trim();

    const { error } = await supabase.from("bookings").update({
      status: confirmTargetStatus,
      confirmation_number: confirmNumber,
      confirmation_data: newConfData,
    } as any).eq("id", confirmDialog.id);

    if (error) { toast.error("Failed to update booking"); return; }
    setBookings((prev) => prev.map((b) =>
      b.id === confirmDialog.id
        ? { ...b, status: confirmTargetStatus, confirmation_number: confirmNumber, confirmation_data: newConfData }
        : b
    ));
    toast.success(isNeedsPayment ? "Booking set to Needs Payment — customer will be notified!" : "Booking confirmed!");
    setConfirmDialog(null);
  };

  const exportCSV = () => {
    const header = "Booking ID,Confirmation No,User,Email,Type,Title,Date,Amount,Status\n";
    const rows = filtered.map((b) =>
      `${b.booking_id},${b.confirmation_number || ""},${b.profile?.full_name || "N/A"},${b.profile?.email || "N/A"},${b.type},${b.title},${b.created_at.slice(0, 10)},${b.total},${b.status}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookings.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Bookings exported");
  };

  const renderFlightConfirmForm = () => {
    const cd = confirmDialog?.confirmation_data || {} as ConfirmationData;
    const passengers = cd.passengers || [];
    const isNeedsPayment = confirmTargetStatus === "Needs Payment";
    return (
      <div className="space-y-5">
        {isNeedsPayment && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700 dark:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-400">
            Please provide at least one reference (Confirmation Number, CRS PNR, or Airline PNR) before requesting payment from the customer.
          </div>
        )}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmation Number</Label>
          <Input value={formConfirmationNumber} onChange={(e) => setFormConfirmationNumber(e.target.value)} placeholder="e.g. CONF-12345" className="mt-1.5 font-mono" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CRS PNR</Label>
            <Input value={formGalileoPnr} onChange={(e) => setFormGalileoPnr(e.target.value)} placeholder="e.g. ABC123" className="mt-1.5 font-mono" />
            {cd.galileo_pnr && <p className="text-xs text-muted-foreground mt-1">Auto-fetched: <span className="font-mono font-medium">{cd.galileo_pnr}</span></p>}
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Airline PNR</Label>
            <Input value={formAirlinePnr} onChange={(e) => setFormAirlinePnr(e.target.value)} placeholder="e.g. XYZ789" className="mt-1.5 font-mono" />
            {cd.airline_pnr && <p className="text-xs text-muted-foreground mt-1">Auto-fetched: <span className="font-mono font-medium">{cd.airline_pnr}</span></p>}
          </div>
        </div>

        {!isNeedsPayment && passengers.length > 0 && (
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-Ticket Numbers</Label>
            {passengers.map((pax, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="min-w-[180px]">
                  <p className="text-sm font-medium text-foreground">{pax.name}</p>
                  <p className="text-xs text-muted-foreground">{pax.type}</p>
                </div>
                <Input
                  value={formEtickets[i] || ""}
                  onChange={(e) => {
                    const updated = [...formEtickets];
                    updated[i] = e.target.value;
                    setFormEtickets(updated);
                  }}
                  placeholder="e.g. 997-1234567890"
                  className="font-mono text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {!isNeedsPayment && passengers.length === 0 && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
            No passenger data found in booking. You can still confirm with PNR details above.
          </div>
        )}
      </div>
    );
  };

  const renderSimpleConfirmForm = () => (
    <div>
      <Label>Confirmation Number *</Label>
      <Input
        value={formConfirmationNumber}
        onChange={(e) => setFormConfirmationNumber(e.target.value)}
        placeholder="e.g. Reference code, booking ID"
        className="mt-1.5"
      />
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h2 className="text-2xl font-bold text-foreground">Booking Management</h2>
          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["All", "Pending", "Paid", "Needs Payment", "Confirmed", "Cancelled"].map((s) => (
                  <SelectItem key={s} value={s}>{s === "All" ? "All" : statusLabels[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setLinkDialog(true)}>
              <Link2 className="mr-2 h-4 w-4" /> Generate Link
            </Button>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No bookings found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking ID</TableHead>
                    <TableHead>Conf. No.</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Pax Info</TableHead>
                    <TableHead>Date</TableHead>
                     <TableHead>Amount</TableHead>
                     <TableHead>API Cost</TableHead>
                     <TableHead>AIT</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.booking_id}</TableCell>
                      <TableCell className="font-mono text-xs">{b.confirmation_number || "—"}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{b.profile?.full_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{b.profile?.email || "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{b.type}</TableCell>
                      <TableCell>{b.title}</TableCell>
                      <TableCell>
                        {(() => {
                          const details = b.details as any;
                          const items = Array.isArray(details) ? details : [];
                          const paxItems = items.filter((d: any) =>
                            /passenger|guest|pax|travell?er|name|full.?name/i.test(d.label)
                          );
                          if (paxItems.length === 0) {
                            const guestItem = items.find((d: any) => d.label === "Guest");
                            if (guestItem) return <span className="text-xs">{guestItem.value}</span>;
                            return <span className="text-xs text-muted-foreground">—</span>;
                          }
                          return (
                            <div className="space-y-0.5">
                              {paxItems.slice(0, 3).map((d: any, i: number) => (
                                <p key={i} className="text-xs">{d.value}</p>
                              ))}
                              {paxItems.length > 3 && <p className="text-xs text-muted-foreground">+{paxItems.length - 3} more</p>}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{b.created_at.slice(0, 10)}</TableCell>
                      <TableCell className="font-semibold">{formatPrice(Number(b.total))}</TableCell>
                      <TableCell>
                        {(() => {
                          const cd = b.confirmation_data as any;
                          if (!cd?.original_currency || !cd?.original_price) return <span className="text-xs text-muted-foreground">—</span>;
                          const src = cd.api_source || "—";
                          const srcLabel = src === "local_inventory" ? "Local" : src.charAt(0).toUpperCase() + src.slice(1);
                          return (
                            <div className="text-xs">
                              <span className="font-mono font-medium">{cd.original_currency} {Number(cd.original_price).toLocaleString()}</span>
                              <p className="text-muted-foreground">{srcLabel}</p>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const cd = b.confirmation_data as any;
                          const ait = cd?.aitAmount;
                          if (!ait || ait <= 0) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <div className="text-xs">
                              <span className="font-mono font-medium text-amber-600">{formatPrice(Number(ait))}</span>
                              {cd?.aitPct > 0 && <p className="text-muted-foreground">{cd.aitPct}%</p>}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[b.status] || ""}>{statusLabels[b.status] || b.status}</Badge>
                      </TableCell>
                       <TableCell>
                         <div className="flex items-center gap-1.5 flex-wrap">
                          <Button size="icon" variant="ghost" title="View Details" onClick={() => setViewBooking(b)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="E-Ticket / Confirmation" onClick={() => window.open(`/booking/ticket/${b.id}`, "_blank")}>
                            <Ticket className="h-4 w-4" />
                          </Button>
                          {b.status === "Needs Payment" && (
                            <Button size="icon" variant="ghost" title="Copy Payment Link" onClick={() => copyPaymentLink(b)}>
                              <Link2 className="h-4 w-4 text-orange-500" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="Upload Ticket File" onClick={() => setUploadBooking(b)}>
                            <Upload className="h-4 w-4" />
                          </Button>
                          {(b.status === "Paid" || b.status === "Confirmed") && (
                            <Button size="sm" variant={b.status === "Confirmed" ? "outline" : "default"} className="text-xs h-8" onClick={() => openConfirmDialog(b)}>
                              {b.status === "Confirmed" ? <><Pencil className="h-3 w-3 mr-1" /> Edit</> : <><CheckCircle className="h-3 w-3 mr-1" /> Confirm</>}
                            </Button>
                          )}
                          <Select value={b.status} onValueChange={(v) => updateStatus(b.id, v)}>
                            <SelectTrigger className="w-[140px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["Pending", "Paid", "Needs Payment", "Confirmed", "Cancelled"].map((s) => (
                                <SelectItem key={s} value={s}>{statusLabels[s] || s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                       </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* View Details Dialog */}
      <Dialog open={!!viewBooking} onOpenChange={() => setViewBooking(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Booking Details — {viewBooking?.booking_id}</DialogTitle>
          </DialogHeader>
          {viewBooking && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">User:</span> <span className="font-medium">{viewBooking.profile?.full_name || "Unknown"}</span></div>
                <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{viewBooking.profile?.email || "—"}</span></div>
                <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{viewBooking.type}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge className={statusColors[viewBooking.status] || ""}>{statusLabels[viewBooking.status] || viewBooking.status}</Badge></div>
                <div><span className="text-muted-foreground">Title:</span> <span className="font-medium">{viewBooking.title}</span></div>
                {viewBooking.subtitle && <div><span className="text-muted-foreground">Subtitle:</span> <span className="font-medium">{viewBooking.subtitle}</span></div>}
                <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{formatPrice(Number(viewBooking.total))}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{viewBooking.created_at.slice(0, 10)}</span></div>
                {(() => {
                  const cd = viewBooking.confirmation_data as any;
                  if (!cd?.original_currency || !cd?.original_price) return null;
                  const src = cd.api_source || "—";
                  const srcLabel = src === "local_inventory" ? "Local Inventory" : src.charAt(0).toUpperCase() + src.slice(1);
                  return (
                    <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Original API Cost (Admin Only)</p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{cd.original_currency} {Number(cd.original_price).toLocaleString()}</span>
                        {cd.original_base_price != null && (
                          <span className="text-muted-foreground">Base: {cd.original_currency} {Number(cd.original_base_price).toLocaleString()}</span>
                        )}
                        {cd.original_taxes != null && (
                          <span className="text-muted-foreground">Tax: {cd.original_currency} {Number(cd.original_taxes).toLocaleString()}</span>
                        )}
                        <Badge variant="outline" className="text-xs">{srcLabel}</Badge>
                      </div>
                    </div>
                  );
                })()}
                {viewBooking.confirmation_number && (
                  <div className="col-span-2"><span className="text-muted-foreground">Confirmation No:</span> <span className="font-mono font-semibold text-primary">{viewBooking.confirmation_number}</span></div>
                )}
              </div>

              {/* Show flight-specific confirmation data */}
              {viewBooking.type === "Flight" && viewBooking.confirmation_data && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <h4 className="font-semibold text-sm text-foreground">Ticketing Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {viewBooking.confirmation_data.galileo_pnr && (
                      <div><span className="text-muted-foreground">CRS PNR:</span> <span className="font-mono font-semibold">{viewBooking.confirmation_data.galileo_pnr}</span></div>
                    )}
                     {viewBooking.confirmation_data.airline_pnr && (
                      <div><span className="text-muted-foreground">Airline PNR:</span> <span className="font-mono font-semibold">{viewBooking.confirmation_data.airline_pnr}</span></div>
                    )}
                    {(viewBooking.confirmation_data as any).tripjack_booking_id && (
                      <div><span className="text-muted-foreground">Tripjack Booking ID:</span> <span className="font-mono font-semibold text-accent">{(viewBooking.confirmation_data as any).tripjack_booking_id}</span></div>
                    )}
                  </div>
                  {viewBooking.confirmation_data.passengers && viewBooking.confirmation_data.etickets && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-Tickets</p>
                      {viewBooking.confirmation_data.passengers.map((pax, i) => (
                        <div key={i} className="flex justify-between items-center text-sm bg-background rounded-md px-3 py-2 border">
                          <div>
                            <span className="font-medium">{pax.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({pax.type})</span>
                          </div>
                          <span className="font-mono text-sm">{viewBooking.confirmation_data?.etickets?.[i] || "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const details = viewBooking.details as any;
                if (!details) return null;
                const items: { label: string; value: string }[] = Array.isArray(details) ? details : [];
                if (items.length === 0) return <p className="text-sm text-muted-foreground">No additional details submitted.</p>;

                const paxRegex = /^(Passenger \d+|Pax \d+)/i;
                const paxItems: Record<string, { label: string; value: string }[]> = {};
                const generalItems: { label: string; value: string }[] = [];

                items.forEach((d) => {
                  const match = d.label.match(paxRegex);
                  if (match) {
                    const key = match[1].replace(/^Pax/i, "Passenger");
                    if (!paxItems[key]) paxItems[key] = [];
                    paxItems[key].push(d);
                  } else {
                    generalItems.push(d);
                  }
                });

                const paxKeys = Object.keys(paxItems);

                return (
                  <div className="space-y-4">
                    {generalItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-foreground">Booking Information</h4>
                        <div className="rounded-lg border bg-muted/30 divide-y">
                          {generalItems.map((d, i) => (
                            <div key={i} className="flex justify-between px-4 py-2 text-sm">
                              <span className="text-muted-foreground">{d.label}</span>
                              <span className="font-medium text-foreground text-right max-w-[60%]">{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {paxKeys.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-sm text-foreground">Passenger Details</h4>
                        {paxKeys.map((paxKey) => (
                          <div key={paxKey} className="rounded-lg border bg-muted/30 overflow-hidden">
                            <div className="px-4 py-2 bg-muted/50 border-b">
                              <span className="font-medium text-sm text-foreground">{paxKey}</span>
                            </div>
                            <div className="divide-y">
                              {paxItems[paxKey].map((d, i) => {
                                const cleanLabel = d.label.replace(paxRegex, "").replace(/^\s*/, "").replace(/^\.?\s*/, "") || "Name";
                                return (
                                  <div key={i} className="flex justify-between px-4 py-2 text-sm">
                                    <span className="text-muted-foreground">{cleanLabel}</span>
                                    <span className="font-medium text-foreground text-right max-w-[60%]">{d.value}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm / Edit Booking Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {confirmTargetStatus === "Needs Payment" ? "Set Needs Payment" : confirmDialog?.status === "Confirmed" ? "Edit Confirmation" : "Confirm Booking"} — {confirmDialog?.booking_id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{confirmDialog?.title}</span>
              {confirmDialog?.subtitle && <span className="ml-1">• {confirmDialog.subtitle}</span>}
            </div>
            {confirmDialog?.type === "Flight" ? renderFlightConfirmForm() : renderSimpleConfirmForm()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={handleConfirm} className={confirmTargetStatus === "Needs Payment" ? "bg-orange-500 hover:bg-orange-600" : ""}>
              <CheckCircle className="h-4 w-4 mr-2" /> {confirmTargetStatus === "Needs Payment" ? "Set Needs Payment" : confirmDialog?.status === "Confirmed" ? "Update" : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Payment Link Dialog */}
      <Dialog open={linkDialog} onOpenChange={() => { setLinkDialog(false); setLinkResults([]); setLinkSearch(""); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Payment Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Search by Booking ID, CRS PNR, Airline PNR, or Confirmation Number to generate a shareable payment link.</p>
            <div className="flex gap-2">
              <Input
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="e.g. FL-ABC123, PNR, or Conf. No."
                onKeyDown={(e) => e.key === "Enter" && searchForPaymentLink()}
              />
              <Button onClick={searchForPaymentLink} disabled={linkSearching}>
                {linkSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {linkResults.length > 0 && (
              <div className="space-y-2">
                {linkResults.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{b.title}</p>
                      <p className="text-xs text-muted-foreground font-mono">{b.booking_id}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`text-[10px] ${statusColors[b.status] || ""}`}>{statusLabels[b.status] || b.status}</Badge>
                        <span className="text-xs text-muted-foreground">{formatPrice(Number(b.total))}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-3">
                      {b.status === "Needs Payment" ? (
                        <Button size="sm" variant="outline" className="text-xs" onClick={() => { copyPaymentLink(b); }}>
                          <Link2 className="h-3 w-3 mr-1" /> Copy Link
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          {b.status === "Pending" ? "Set to 'Needs Payment' first" : "No payment needed"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {linkResults.length === 0 && linkSearch && !linkSearching && (
              <p className="text-sm text-muted-foreground text-center py-4">No bookings found matching your search.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Ticket File Dialog */}
      <Dialog open={!!uploadBooking} onOpenChange={() => setUploadBooking(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Ticket Files — {uploadBooking?.booking_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{uploadBooking?.title}</span>
              {uploadBooking?.subtitle && <span className="ml-1">• {uploadBooking.subtitle}</span>}
            </div>

            {/* Existing files */}
            {uploadBooking && bookingFiles[uploadBooking.id]?.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uploaded Files</Label>
                {bookingFiles[uploadBooking.id].map((file) => (
                  <div key={file.name} className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary font-medium truncate hover:underline">{file.name}</a>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteFile(uploadBooking.id, file.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload new file */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload New File</Label>
              <div className="mt-2">
                <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                  {uploadingFile ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to upload ticket file (PDF, image, etc.)</span>
                    </>
                  )}
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploadingFile} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" />
                </label>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminBookings;
