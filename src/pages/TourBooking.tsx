import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Map, Loader2 } from "lucide-react";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { toast } from "sonner";
import { saveBooking, processBkashPayment, executeBkashPayment, updateBookingStatus } from "@/utils/bookingService";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { useTenant } from "@/hooks/useTenant";

interface Tour {
  id: string; name: string; destination: string; duration: string; price: number;
}

const TourBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tour, setTour] = useState<Tour | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const { formatPrice, currency: displayCurrency } = useCurrency();
  const taxSettings = useTaxSettings();
  const { tenant } = useTenant();

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", travelers: "2", preferredDate: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("card");
  const { methods: paymentMethods } = usePaymentMethods();

  useEffect(() => {
    supabase.from("tours").select("id, name, destination, duration, price").eq("id", id).maybeSingle().then(({ data }) => {
      setTour(data as any);
      setPageLoading(false);
    });
  }, [id]);

  if (pageLoading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!tour) return <Layout><div className="container mx-auto px-4 py-20 text-center"><h2 className="text-2xl font-bold">Tour not found</h2></div></Layout>;

  const travelers = Math.max(1, Number(form.travelers) || 1);
  const subtotal = Number(tour.price) * travelers;
  const convenienceFee = Math.round(subtotal * (taxSettings.convenienceFeePercentage / 100));
  const total = subtotal + convenienceFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) { toast.error("Please fill all required fields"); return; }
    setLoading(true);
    const bookingData = {
      type: "Tour",
      title: tour.name,
      subtitle: `${tour.destination} • ${tour.duration}`,
      details: [
        { label: "Destination", value: tour.destination },
        { label: "Duration", value: tour.duration },
        { label: "Travelers", value: String(travelers) },
        { label: "Booked by", value: `${form.firstName} ${form.lastName}` },
        { label: "Email", value: form.email },
        ...(form.phone ? [{ label: "Phone", value: form.phone }] : []),
        ...(form.preferredDate ? [{ label: "Preferred Date", value: form.preferredDate }] : []),
        ...(form.notes ? [{ label: "Notes", value: form.notes }] : []),
      ],
      total,
      bookingId: `TR-${Date.now().toString(36).toUpperCase()}`,
      confirmationData: {
        api_source: "local_inventory",
        original_currency: displayCurrency,
        original_price: total,
        display_currency: displayCurrency,
        display_total: total,
      },
    };
    // ALL bookings start as Pending — only marked Paid after actual payment confirmation
    const dbId = await saveBooking(bookingData, "Pending");

    if (!dbId) {
      toast.error("Failed to save booking. Please try again.");
      setLoading(false);
      return;
    }

    const isBkash = selectedPayment === "bkash";

    if (isBkash) {
      try {
        const bkResult = await processBkashPayment(total, bookingData.bookingId);
        if (!bkResult.success) { toast.error(bkResult.error || "bKash payment initiation failed"); setLoading(false); return; }
        if (bkResult.bkashURL) {
          sessionStorage.setItem("bkash_paymentID", bkResult.paymentID || "");
          sessionStorage.setItem("bkash_id_token", bkResult.id_token || "");
          sessionStorage.setItem("bkash_booking_db_id", dbId);
          sessionStorage.setItem("bkash_booking_data", JSON.stringify(bookingData));
          window.location.href = bkResult.bkashURL;
          return;
        }
        if (bkResult.paymentID && bkResult.id_token) {
          const execResult = await executeBkashPayment(bkResult.paymentID, bkResult.id_token);
          if (execResult.success && execResult.transactionStatus === "Completed") {
            await updateBookingStatus(dbId, "Paid");
            toast.success(`bKash payment successful! TrxID: ${execResult.trxID}`);
            navigate("/booking/confirmation", { state: { ...bookingData, bkashTrxID: execResult.trxID, paymentStatus: "Paid", dbId } });
          } else {
            toast.error("bKash payment was not completed. Booking saved as Pending.");
            navigate("/booking/confirmation", { state: { ...bookingData, paymentStatus: "Pending", dbId } });
          }
          return;
        }
      } catch { toast.error("bKash payment failed. Booking saved as Pending."); setLoading(false); return; }
    }

    // For card/bank/other methods — booking is saved as Pending, admin confirms payment manually
    navigate("/booking/confirmation", { state: { ...bookingData, paymentStatus: "Pending", dbId } });
  };

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Layout>
      <div className="bg-hero-gradient py-8">
        <div className="container mx-auto px-4">
          <Link to={`/tours/${tour.id}`} className="text-primary-foreground/70 hover:text-primary-foreground text-sm mb-2 inline-block">← Back to Tour</Link>
          <h1 className="text-2xl font-bold text-primary-foreground">Book: {tour.name}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Traveler Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required /></div>
                  <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required /></div>
                  <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
                  <div><Label>Number of Travelers</Label><Input type="number" min={1} max={15} value={form.travelers} onChange={(e) => update("travelers", e.target.value)} /></div>
                  <div><Label>Preferred Start Date</Label><Input type="date" value={form.preferredDate} onChange={(e) => update("preferredDate", e.target.value)} /></div>
                </div>
                <div className="mt-4"><Label>Special Requests</Label><Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Dietary requirements, accessibility needs, etc." /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Payment Method</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <label key={method.id} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPayment === method.id ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30"}`}>
                      <input type="radio" name="payment" value={method.id} checked={selectedPayment === method.id} onChange={() => setSelectedPayment(method.id)} className="sr-only" />
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedPayment === method.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{method.label}</p>
                        <p className="text-xs text-muted-foreground">{method.description}</p>
                      </div>
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Processing..." : `Confirm & Pay ${formatPrice(total)}`}
            </Button>
          </form>

          <div>
            <Card className="sticky top-24">
              <CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5 text-primary" /> Order Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-semibold text-foreground">{tour.name}</p>
                  <p className="text-sm text-muted-foreground">{tour.destination} • {tour.duration}</p>
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{formatPrice(tour.price)} × {travelers} travelers</span><span>{formatPrice(subtotal)}</span></div>
                   {convenienceFee > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Convenience Fee</span><span>{formatPrice(convenienceFee)}</span></div>}
                   <div className="border-t border-border pt-2 flex justify-between"><span className="font-semibold">Total</span><span className="text-xl font-bold text-primary">{formatPrice(total)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TourBooking;
