import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Plane, CheckCircle, FileText, Download } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { processBkashPayment, executeBkashPayment, updateBookingStatus } from "@/utils/bookingService";
import { toast } from "sonner";

interface ConfirmationData {
  galileo_pnr?: string;
  airline_pnr?: string;
  confirmation_number?: string;
  passengers?: { name: string; type: string }[];
  etickets?: string[];
}

const BookingPayment = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { formatPrice } = useCurrency();
  const { methods: PAYMENT_METHODS } = usePaymentMethods();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("card");
  const [ticketFiles, setTicketFiles] = useState<{ name: string; url: string }[]>([]);

  useEffect(() => {
    if (!authLoading && !user) { navigate("/auth"); return; }
    if (!user || !id) return;

    supabase.from("bookings").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data || data.status !== "Needs Payment") {
          toast.error("Booking not found or payment not required");
          navigate("/dashboard");
          return;
        }
        setBooking(data);
        setLoading(false);

        // Load ticket files
        supabase.storage.from("ticket-files").list(data.id).then(({ data: files }) => {
          if (files && files.length > 0) {
            setTicketFiles(files.map(f => ({
              name: f.name,
              url: supabase.storage.from("ticket-files").getPublicUrl(`${data.id}/${f.name}`).data.publicUrl,
            })));
          }
        });
      });
  }, [id, user, authLoading]);

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!booking) return null;

  const cd = (booking.confirmation_data || {}) as ConfirmationData;
  const total = Number(booking.total);

  const refs = [
    cd.confirmation_number && { label: "Confirmation Number", value: cd.confirmation_number },
    cd.galileo_pnr && { label: "CRS PNR", value: cd.galileo_pnr },
    cd.airline_pnr && { label: "Airline PNR", value: cd.airline_pnr },
  ].filter(Boolean) as { label: string; value: string }[];

  const handlePay = async () => {
    setPaying(true);
    const isBkash = selectedPayment === "bkash";

    if (isBkash) {
      try {
        const bkResult = await processBkashPayment(total, booking.booking_id);
        if (!bkResult.success) {
          toast.error(bkResult.error || "bKash payment initiation failed");
          setPaying(false);
          return;
        }
        if (bkResult.bkashURL) {
          sessionStorage.setItem("bkash_paymentID", bkResult.paymentID || "");
          sessionStorage.setItem("bkash_id_token", bkResult.id_token || "");
          sessionStorage.setItem("bkash_booking_db_id", booking.id);
          sessionStorage.setItem("bkash_booking_data", JSON.stringify({
            type: booking.type, title: booking.title, subtitle: booking.subtitle,
            details: booking.details, total: booking.total, bookingId: booking.booking_id,
          }));
          window.location.href = bkResult.bkashURL;
          return;
        }
        if (bkResult.paymentID && bkResult.id_token) {
          const execResult = await executeBkashPayment(bkResult.paymentID, bkResult.id_token);
          if (execResult.success && execResult.transactionStatus === "Completed") {
            await updateBookingStatus(booking.id, "Paid");
            toast.success(`Payment successful! TrxID: ${execResult.trxID}`);
            navigate("/dashboard");
          } else {
            toast.error("bKash payment was not completed.");
          }
          setPaying(false);
          return;
        }
      } catch {
        toast.error("bKash payment failed.");
        setPaying(false);
        return;
      }
    }

    await updateBookingStatus(booking.id, "Paid");
    toast.success("Payment submitted! Your booking is now awaiting confirmation.");
    navigate("/dashboard");
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-orange-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Complete Payment</h1>
            <p className="text-muted-foreground text-sm">Your booking has been confirmed. Please complete the payment to proceed.</p>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Booking Summary</CardTitle>
                <Badge className="bg-orange-500/10 text-orange-600 border border-orange-200">Needs Payment</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Plane className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{booking.title}</p>
                  {booking.subtitle && <p className="text-sm text-muted-foreground">{booking.subtitle}</p>}
                </div>
              </div>

              <p className="font-mono text-xs text-muted-foreground">{booking.booking_id}</p>

              {refs.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Booking References</span>
                  </div>
                  {refs.map((ref) => (
                    <div key={ref.label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{ref.label}</span>
                      <span className="font-mono font-semibold text-foreground">{ref.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Ticket Files */}
              {ticketFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticket Documents</p>
                  {ticketFiles.map((file) => (
                    <a key={file.name} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm text-primary font-medium truncate">{file.name}</span>
                      <Download className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                    </a>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-3 flex justify-between items-center">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="text-2xl font-bold text-primary">{formatPrice(total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={selectedPayment} onValueChange={setSelectedPayment} className="space-y-3">
                {PAYMENT_METHODS.map((method) => (
                  <div key={method.id} className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${selectedPayment === method.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                    <RadioGroupItem value={method.id} id={method.id} />
                    <Label htmlFor={method.id} className="flex-1 cursor-pointer">
                      <span className="text-sm font-medium">{method.label}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <Button className="w-full h-12 text-base font-semibold" onClick={handlePay} disabled={paying}>
            {paying ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CreditCard className="h-5 w-5 mr-2" />}
            {paying ? "Processing..." : `Pay ${formatPrice(total)}`}
          </Button>
        </motion.div>
      </div>
    </Layout>
  );
};

export default BookingPayment;
