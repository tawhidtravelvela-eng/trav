import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, Home, Loader2, Ticket, Plane, Armchair, Luggage, UtensilsCrossed } from "lucide-react";
import { motion } from "framer-motion";
import { useCurrency } from "@/contexts/CurrencyContext";
import { executeBkashPayment, updateBookingStatus } from "@/utils/bookingService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BookingProgressModal, { type BookingModalStatus } from "@/components/flights/BookingProgressModal";

interface BookingState {
  type: string;
  title: string;
  subtitle: string;
  details: { label: string; value: string }[];
  total: number;
  bookingId: string;
  bkashTrxID?: string;
  paymentStatus?: string;
  dbId?: string;
  isTravelVela?: boolean;
  confirmationData?: Record<string, any>;
}

// Call Tripjack book API after payment for instant-ticketing flights
async function callTripjackBookApi(pendingData: any): Promise<{ success: boolean; pnr?: string; airlinePnr?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("tripjack-book", {
    body: {
      bookingId: pendingData.bookingId,
      passengers: pendingData.passengers,
      contactEmail: pendingData.contactEmail,
      contactPhone: pendingData.contactPhone,
      ...(pendingData.paymentAmount ? { paymentAmount: pendingData.paymentAmount } : {}),
    },
  });
  if (error || !data?.success || !data?.pnr) {
    return { success: false, error: data?.error || error?.message || "Booking failed after payment" };
  }
  return { success: true, pnr: data.pnr, airlinePnr: data.airlinePnr || undefined };
}

const BookingConfirmation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatPrice } = useCurrency();
  const [booking, setBooking] = useState<BookingState | null>(location.state as BookingState | null);
  const [bkashProcessing, setBkashProcessing] = useState(false);
  const [ticketingStatus, setTicketingStatus] = useState<BookingModalStatus>(null);
  const [ticketingPnr, setTicketingPnr] = useState<string | null>(null);
  const [ticketingError, setTicketingError] = useState("");

  const isPaid = booking?.paymentStatus === "Paid" || !!booking?.bkashTrxID;

  // Process Tripjack instant-ticketing after payment confirmation
  const processTripjackTicketing = async (bookingState: BookingState, dbId: string) => {
    // Check if there's pending tripjack booking data
    const pendingData = bookingState.confirmationData?.tripjack_pending;
    if (!pendingData) return;

    setTicketingStatus("booking");
    setTicketingPnr(null);
    setTicketingError("");

    const result = await callTripjackBookApi(pendingData);

    if (!result.success) {
      setTicketingError(result.error || "Ticketing failed after payment. Our team will process this manually.");
      setTicketingStatus("failed");
      await updateBookingStatus(dbId, "Payment Received - Pending Ticketing");
      return;
    }

    // Update booking — store TJ booking ID for admin only, not as customer-visible PNR
    const updatedConfData = { ...bookingState.confirmationData };
    delete updatedConfData.tripjack_pending;
    updatedConfData.tripjack_booking_id = result.pnr || "";
    updatedConfData.airline_pnr = result.airlinePnr || "";

    await supabase.from("bookings").update({
      status: "Confirmed",
      confirmation_data: updatedConfData as any,
    }).eq("id", dbId);

    setTicketingPnr(null);
    setTicketingStatus("success");

    // Update local booking state
    setBooking((prev) => prev ? {
      ...prev,
      confirmationData: updatedConfData,
    } : prev);

    toast.success("Ticket issued successfully!");

    // Hide modal after brief display
    await new Promise((r) => setTimeout(r, 3000));
    setTicketingStatus(null);
  };

  // Handle bKash callback redirect
  useEffect(() => {
    const paymentID = searchParams.get("paymentID") || sessionStorage.getItem("bkash_paymentID");
    const idToken = sessionStorage.getItem("bkash_id_token");
    const dbId = sessionStorage.getItem("bkash_booking_db_id");
    const savedData = sessionStorage.getItem("bkash_booking_data");
    const bkashStatus = searchParams.get("status");

    if (paymentID && idToken && dbId && savedData && !booking?.bkashTrxID) {
      sessionStorage.removeItem("bkash_paymentID");
      sessionStorage.removeItem("bkash_id_token");
      sessionStorage.removeItem("bkash_booking_db_id");
      sessionStorage.removeItem("bkash_booking_data");

      const bookingData = JSON.parse(savedData) as BookingState;

      if (bkashStatus === "cancel" || bkashStatus === "failure") {
        setBooking({ ...bookingData, paymentStatus: "Pending" });
        toast.error("bKash payment was cancelled or failed. Booking saved as Payment Pending.");
        return;
      }

      setBkashProcessing(true);
      setBooking(bookingData);

      executeBkashPayment(paymentID, idToken).then(async (result) => {
        if (result.success && result.transactionStatus === "Completed") {
          await updateBookingStatus(dbId, "Paid");
          toast.success(`bKash payment successful! TrxID: ${result.trxID}`);
          const updatedBooking = { ...bookingData, bkashTrxID: result.trxID, paymentStatus: "Paid", dbId };
          setBooking(updatedBooking);
          setBkashProcessing(false);

          // After payment success, process instant-ticketing if applicable
          await processTripjackTicketing(updatedBooking, dbId);
        } else {
          setBooking({ ...bookingData, paymentStatus: "Pending" });
          toast.error("bKash payment could not be completed. Booking saved as Payment Pending.");
          setBkashProcessing(false);
        }
      }).catch(() => {
        setBooking({ ...bookingData, paymentStatus: "Pending" });
        setBkashProcessing(false);
        toast.error("bKash payment verification failed.");
      });
    }
  }, [searchParams]);

  // For non-bKash payments (card/bank), process instant-ticketing on arrival if payment is marked
  useEffect(() => {
    if (!booking?.dbId || !isPaid) return;
    const pendingData = booking.confirmationData?.tripjack_pending;
    if (!pendingData) return;
    // Only trigger once
    if (ticketingStatus !== null) return;
    processTripjackTicketing(booking, booking.dbId);
  }, [booking?.dbId, isPaid]);

  if (bkashProcessing) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground">Verifying bKash Payment...</h2>
          <p className="text-muted-foreground mt-2">Please wait while we confirm your payment.</p>
        </div>
      </Layout>
    );
  }

  if (!booking) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-foreground">No booking found</h2>
          <Button className="mt-4" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </Layout>
    );
  }

  const isTravelVelaPending = booking.isTravelVela && !isPaid;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="text-center mb-8">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${isPaid ? "bg-primary/10" : "bg-amber-500/10"}`}>
            {isPaid ? <CheckCircle className="w-10 h-10 text-primary" /> : <Clock className="w-10 h-10 text-amber-500" />}
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {isPaid ? "Payment Received" : isTravelVelaPending ? "Order Pending" : "Payment Pending"}
          </h1>
          <p className="text-muted-foreground">
            {isPaid
              ? "Your payment has been received and is awaiting confirmation. Our team will verify and confirm your booking shortly."
              : isTravelVelaPending
              ? "Your order is pending. Please wait for your order to be confirmed. Our team will review your booking and notify you when payment is required."
              : "Your booking has been placed but payment is pending. Once payment is confirmed by the gateway, your booking will be updated automatically."}
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Booking Details</CardTitle>
                <span className="text-sm font-mono bg-muted px-3 py-1 rounded-md text-foreground">{booking.bookingId}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-lg font-semibold text-foreground">{booking.title}</p>
                <p className="text-sm text-muted-foreground">{booking.subtitle}</p>
              </div>

              {booking.bkashTrxID && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">bKash Transaction ID</p>
                  <p className="font-mono font-medium text-foreground">{booking.bkashTrxID}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {booking.details.map((d) => (
                  <div key={d.label} className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{d.label}</p>
                    <p className="font-medium text-foreground">{d.value}</p>
                  </div>
                ))}
              </div>

              {/* Ancillary Selections */}
              {booking.confirmationData?.ancillaries && (booking.confirmationData.ancillaries as any[]).length > 0 && (
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Armchair className="w-4 h-4 text-primary" /> Add-on Services
                  </h3>
                  <div className="space-y-3">
                    {(booking.confirmationData.ancillaries as any[]).map((paxAnc: any, idx: number) => (
                      <div key={idx} className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-foreground mb-2">{paxAnc.passenger}</p>
                        <div className="space-y-1.5">
                          {paxAnc.items.map((item: any, iIdx: number) => (
                            <div key={iIdx} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                {item.type === "Seat" && <Armchair className="w-3 h-3" />}
                                {item.type === "Baggage" && <Luggage className="w-3 h-3" />}
                                {item.type === "Meal" && <UtensilsCrossed className="w-3 h-3" />}
                                <span>{item.description}</span>
                              </div>
                              {item.amount > 0 && (
                                <span className="font-medium text-foreground">{item.currency || ""} {item.amount}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="text-2xl font-bold text-primary">{formatPrice(booking.total)}</p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${isPaid ? "bg-primary/10" : "bg-amber-500/10"}`}>
                    {isPaid ? <CheckCircle className="w-4 h-4 text-primary" /> : <Clock className="w-4 h-4 text-amber-500" />}
                    <span className={`text-sm font-medium ${isPaid ? "text-primary" : "text-amber-500"}`}>
                      {isPaid ? "Awaiting Confirmation" : "Payment Pending"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {isPaid
                    ? "Payment received successfully. Your booking is awaiting confirmation from our team. You'll be notified once confirmed."
                    : isTravelVelaPending
                    ? "Your order has been placed and is awaiting review by our team. You will be notified when payment is required. You can track your booking status from your dashboard."
                    : "Your booking is saved with payment pending. Once the payment gateway confirms your payment, the status will update automatically. You can track it from your dashboard."}
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  {booking.dbId && (
                    <Button variant="outline" className="flex-1" onClick={() => window.open(`/booking/ticket/${booking.dbId}`, "_blank")}>
                      <Ticket className="w-4 h-4 mr-2" /> View E-Ticket
                    </Button>
                  )}
                  <Button className="flex-1" onClick={() => navigate("/dashboard")}>
                    <Home className="w-4 h-4 mr-2" /> Go to Dashboard
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Booking Progress Modal for post-payment ticketing */}
      <BookingProgressModal
        status={ticketingStatus}
        pnr={ticketingPnr}
        errorMessage={ticketingError}
        onClose={() => setTicketingStatus(null)}
      />
    </Layout>
  );
};

export default BookingConfirmation;
