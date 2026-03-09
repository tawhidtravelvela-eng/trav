import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link, useLocation } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { toast } from "sonner";
import { saveBooking, processBkashPayment, executeBkashPayment, updateBookingStatus } from "@/utils/bookingService";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { useTenant } from "@/hooks/useTenant";
import { trackHotelInteraction } from "@/utils/hotelTracking";
import { useAuth } from "@/contexts/AuthContext";

interface Hotel {
  id: string; name: string; city: string; price: number; source?: string;
}

const HotelBooking = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const { formatPrice, currency: displayCurrency } = useCurrency();
  const taxSettings = useTaxSettings();
  const { user } = useAuth();
  const { tenant } = useTenant();

  const isTravelvelaHotel = id?.startsWith("tv-");
  const isTripjackHotel = id?.startsWith("tj-");
  const isApiHotel = isTravelvelaHotel || isTripjackHotel;
  const stateHotel = (location.state as any)?.hotel as Hotel | undefined;

  useEffect(() => {
    if (isApiHotel && stateHotel) {
      setHotel({ id: stateHotel.id, name: stateHotel.name, city: stateHotel.city, price: stateHotel.price, source: stateHotel.source });
      setPageLoading(false);
    } else if (isApiHotel) {
      const roomPrice = Number(searchParams.get("price")) || 0;
      const hotelName = searchParams.get("hotelName") || "Hotel";
      const hotelCity = searchParams.get("city") || "";
      setHotel({ id: id || "", name: hotelName, city: hotelCity, price: roomPrice, source: isTripjackHotel ? "tripjack" : "travelvela" });
      setPageLoading(false);
    } else {
      supabase.from("hotels").select("id, name, city, price").eq("id", id).maybeSingle().then(({ data }) => {
        setHotel(data as any);
        setPageLoading(false);
      });
    }
  }, [id, isApiHotel, isTripjackHotel, stateHotel, searchParams]);

  const roomName = searchParams.get("room") || "Standard Room";
  const roomPrice = Number(searchParams.get("price")) || hotel?.price || 0;
  const paramCheckin = searchParams.get("checkin") || "";
  const paramCheckout = searchParams.get("checkout") || "";
  const paramAdults = Number(searchParams.get("adults")) || 1;
  const paramChildren = Number(searchParams.get("children")) || 0;
  const paramRooms = Number(searchParams.get("rooms")) || 1;

  // Calculate nights from dates, fallback to 1
  const calcNights = () => {
    if (paramCheckin && paramCheckout) {
      const diff = new Date(paramCheckout).getTime() - new Date(paramCheckin).getTime();
      const n = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return n > 0 ? n : 1;
    }
    return 1;
  };
  const nights = calcNights();

  const userFullName = user?.user_metadata?.full_name || "";
  const [firstName, ...lastParts] = userFullName.split(" ");
  const [form, setForm] = useState({
    firstName: firstName || "", lastName: lastParts.join(" ") || "", email: user?.email || "", phone: "",
    checkIn: paramCheckin, checkOut: paramCheckout,
    guests: String(paramAdults + paramChildren),
    specialRequests: "",
  });
  const [loading, setLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("card");
  const { methods: paymentMethods } = usePaymentMethods();
  if (pageLoading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!hotel) return <Layout><div className="container mx-auto px-4 py-20 text-center"><h2 className="text-2xl font-bold">Hotel not found</h2></div></Layout>;

  const subtotal = Math.round(roomPrice * nights);
  const convenienceFee = Math.round(subtotal * (taxSettings.convenienceFeePercentage / 100));
  const total = Math.round(subtotal + convenienceFee);

  // For API hotels, prices are in their native currency — use source for currency conversion
  const hotelSource = isApiHotel ? (hotel?.source || (isTripjackHotel ? "tripjack" : "travelvela")) : undefined;
  const fmt = (price: number) => formatPrice(Math.round(price), hotelSource);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to book a hotel");
      navigate("/auth", { state: { returnTo: window.location.pathname + window.location.search } });
      return;
    }
    if (!form.firstName || !form.lastName || !form.email) { toast.error("Please fill all required fields"); return; }
    setLoading(true);

    // Track booking interaction
    trackHotelInteraction({
      hotelId: hotel.id,
      hotelName: hotel.name,
      hotelCity: hotel.city,
      hotelStars: 0,
      action: "book",
    });
    const bookingData = {
      type: "Hotel",
      title: hotel.name,
      subtitle: `${roomName} • ${hotel.city}`,
      details: [
        { label: "Room", value: roomName },
        { label: "Nights", value: `${nights}` },
        { label: "Rooms", value: `${paramRooms}` },
        { label: "Guests", value: `${paramAdults} Adult${paramAdults > 1 ? 's' : ''}${paramChildren > 0 ? `, ${paramChildren} Child${paramChildren > 1 ? 'ren' : ''}` : ''}` },
        { label: "Guest Name", value: `${form.firstName} ${form.lastName}` },
        { label: "Email", value: form.email },
        ...(form.phone ? [{ label: "Phone", value: form.phone }] : []),
        ...(form.checkIn ? [{ label: "Check-in", value: form.checkIn }] : []),
        ...(form.checkOut ? [{ label: "Check-out", value: form.checkOut }] : []),
        ...(form.specialRequests ? [{ label: "Special Requests", value: form.specialRequests }] : []),
      ],
      total,
      bookingId: `HT-${Date.now().toString(36).toUpperCase()}`,
      confirmationData: {
        api_source: hotel.source || "local_inventory",
        original_currency: hotel.source === "tripjack" ? "INR" : hotel.source === "travelvela" ? "BDT" : displayCurrency,
        original_price: Math.round(Number(hotel.price) * nights * paramRooms),
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
          <Link to={`/hotels/${hotel.id}`} className="text-primary-foreground/70 hover:text-primary-foreground text-sm mb-2 inline-block">← Back to Hotel</Link>
          <h1 className="text-2xl font-bold text-primary-foreground">Book Your Stay</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Guest Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required /></div>
                  <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required /></div>
                  <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
                  <div><Label>Check-in</Label><Input type="date" value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} /></div>
                  <div><Label>Check-out</Label><Input type="date" value={form.checkOut} onChange={(e) => update("checkOut", e.target.value)} /></div>
                  <div><Label>Guests</Label><Input type="number" min={1} max={6} value={form.guests} onChange={(e) => update("guests", e.target.value)} /></div>
                </div>
                <div className="mt-4"><Label>Special Requests</Label><Input value={form.specialRequests} onChange={(e) => update("specialRequests", e.target.value)} placeholder="Late check-in, extra pillows, etc." /></div>
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
              <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Order Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-semibold text-foreground">{hotel.name}</p>
                  <p className="text-sm text-muted-foreground">{roomName} • {hotel.city}</p>
                </div>
                {paramCheckin && paramCheckout && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Check-in</span><span className="font-medium text-foreground">{paramCheckin}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Check-out</span><span className="font-medium text-foreground">{paramCheckout}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Guests</span><span className="font-medium text-foreground">{paramAdults} Adult{paramAdults > 1 ? 's' : ''}{paramChildren > 0 ? `, ${paramChildren} Child` : ''}</span></div>
                  </div>
                )}
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{fmt(roomPrice)} × {nights} night{nights > 1 ? 's' : ''}</span><span>{fmt(subtotal)}</span></div>
                   {convenienceFee > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Convenience Fee</span><span>{fmt(convenienceFee)}</span></div>}
                  <div className="border-t border-border pt-2 flex justify-between"><span className="font-semibold">Total</span><span className="text-xl font-bold text-primary">{fmt(total)}</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HotelBooking;
