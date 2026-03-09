import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Map, Loader2, Clock, MapPin, Star, Users, CalendarDays, Shield, CheckCircle, Minus, Plus } from "lucide-react";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { toast } from "sonner";
import { saveBooking, processBkashPayment, executeBkashPayment, updateBookingStatus } from "@/utils/bookingService";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { useTenant } from "@/hooks/useTenant";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ViatorTourBooking = () => {
  const { productCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatPrice, currency: displayCurrency } = useCurrency();
  const taxSettings = useTaxSettings();
  const { tenant } = useTenant();

  const [product, setProduct] = useState<any>(location.state?.product || null);
  const [loading, setLoading] = useState(!product);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("card");
  const { methods: paymentMethods } = usePaymentMethods();

  const initialTravelers = location.state?.travelers || 2;
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    travelers: String(initialTravelers),
    preferredDate: "",
    selectedOption: "",
    notes: "",
  });

  useEffect(() => {
    if (product) return;
    if (!productCode) return;
    const fetchProduct = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("viator-search", {
          body: { action: "product", productCode },
        });
        if (error) throw error;
        if (data?.success) setProduct(data.product);
        else toast.error(data?.error || "Product not found");
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productCode, product]);

  if (loading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!product) return <Layout><div className="container mx-auto px-4 py-20 text-center"><h2 className="text-2xl font-bold text-foreground">Tour not found</h2><Button className="mt-4" onClick={() => navigate("/tours")}>Back to Tours</Button></div></Layout>;

  // Extract product data
  const pricing = product.pricing || {};
  const price = pricing.summary?.fromPrice || product.price || 0;
  const currency = pricing.currency || product.currency || "USD";
  const reviews = product.reviews || {};
  const rating = reviews.combinedAverageRating || 0;
  const cancellation = product.cancellationPolicy || {};
  const productOptions = product.productOptions || [];
  const images = (product.images || []).map((img: any) => {
    const variants = img.variants || [];
    const best = variants.reduce((a: any, b: any) => ((b.width || 0) > (a.width || 0) ? b : a), variants[0] || {});
    return best.url || "";
  }).filter(Boolean);
  const heroImage = images[0] || "";

  let duration = "";
  const dur = product.duration || product.itinerary?.duration || {};
  if (dur.fixedDurationInMinutes) {
    const h = Math.floor(dur.fixedDurationInMinutes / 60);
    const m = dur.fixedDurationInMinutes % 60;
    duration = h > 0 ? `${h} hours${m > 0 ? ` ${m} min` : ""}` : `${m} min`;
  } else if (dur.variableDurationFromMinutes) {
    const fromH = Math.floor(dur.variableDurationFromMinutes / 60);
    const toH = Math.floor((dur.variableDurationToMinutes || dur.variableDurationFromMinutes) / 60);
    duration = `${fromH}-${toH} hours`;
  }

  const destination = product.destination?.name || product.location?.address?.city || "";

  // Pricing
  const travelers = Math.max(1, Number(form.travelers) || 1);
  const subtotal = price * travelers;
  const convenienceFee = Math.round(subtotal * (taxSettings.convenienceFeePercentage / 100));
  const total = subtotal + convenienceFee;

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email) {
      toast.error("Please fill all required fields");
      return;
    }
    if (!form.preferredDate) {
      toast.error("Please select a preferred date");
      return;
    }
    setSubmitting(true);

    const selectedOpt = productOptions.find((o: any) => o.productOptionCode === form.selectedOption);

    const bookingData = {
      type: "Tour",
      title: product.title,
      subtitle: `${destination} • ${duration || "Tour"}`,
      details: [
        { label: "Destination", value: destination },
        ...(duration ? [{ label: "Duration", value: duration }] : []),
        { label: "Travelers", value: String(travelers) },
        { label: "Preferred Date", value: form.preferredDate },
        ...(selectedOpt ? [{ label: "Tour Option", value: selectedOpt.description || selectedOpt.title || selectedOpt.productOptionCode }] : []),
        { label: "Booked by", value: `${form.firstName} ${form.lastName}` },
        { label: "Email", value: form.email },
        ...(form.phone ? [{ label: "Phone", value: form.phone }] : []),
        ...(form.notes ? [{ label: "Special Requests", value: form.notes }] : []),
      ],
      total,
      bookingId: `VT-${Date.now().toString(36).toUpperCase()}`,
      confirmationData: {
        api_source: "viator",
        product_code: productCode,
        product_title: product.title,
        product_option: form.selectedOption || null,
        original_currency: currency,
        original_price: total,
        display_currency: displayCurrency,
        display_total: total,
        viator_price_per_person: price,
        cancellation_policy: cancellation.description || "",
        hero_image: heroImage,
      },
      ...(tenant?.id ? { tenantId: tenant.id } : {}),
    };

    const dbId = await saveBooking(bookingData, "Pending");
    if (!dbId) {
      toast.error("Failed to save booking. Please try again.");
      setSubmitting(false);
      return;
    }

    const isBkash = selectedPayment === "bkash";
    if (isBkash) {
      try {
        const bkResult = await processBkashPayment(total, bookingData.bookingId);
        if (!bkResult.success) { toast.error(bkResult.error || "bKash payment initiation failed"); setSubmitting(false); return; }
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
      } catch { toast.error("bKash payment failed. Booking saved as Pending."); setSubmitting(false); return; }
    }

    navigate("/booking/confirmation", { state: { ...bookingData, paymentStatus: "Pending", dbId } });
  };

  return (
    <Layout>
      <div className="bg-hero-gradient py-8">
        <div className="container mx-auto px-4">
          <Link to={`/tours/viator/${productCode}`} className="text-primary-foreground/70 hover:text-primary-foreground text-sm mb-2 inline-block">← Back to Tour</Link>
          <h1 className="text-2xl font-bold text-primary-foreground">Book: {product.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {destination && <Badge variant="secondary" className="bg-card/80"><MapPin className="w-3 h-3 mr-1" />{destination}</Badge>}
            {duration && <Badge variant="secondary" className="bg-card/80"><Clock className="w-3 h-3 mr-1" />{duration}</Badge>}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
            {/* Traveler Details */}
            <Card>
              <CardHeader><CardTitle>Traveler Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => update("firstName", e.target.value)} required /></div>
                  <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => update("lastName", e.target.value)} required /></div>
                  <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></div>
                  <div>
                    <Label>Number of Travelers</Label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <button type="button" onClick={() => update("travelers", String(Math.max(1, Number(form.travelers) - 1)))} className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors" disabled={Number(form.travelers) <= 1}>
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center text-lg font-semibold text-foreground">{form.travelers}</span>
                      <button type="button" onClick={() => update("travelers", String(Math.min(15, Number(form.travelers) + 1)))} className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors" disabled={Number(form.travelers) >= 15}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div><Label>Preferred Date *</Label><Input type="date" value={form.preferredDate} onChange={(e) => update("preferredDate", e.target.value)} required min={new Date().toISOString().split("T")[0]} /></div>
                </div>
              </CardContent>
            </Card>

            {/* Tour Option */}
            {productOptions.length > 1 && (
              <Card>
                <CardHeader><CardTitle>Select Tour Option</CardTitle></CardHeader>
                <CardContent>
                  <Select value={form.selectedOption} onValueChange={(v) => update("selectedOption", v)}>
                    <SelectTrigger><SelectValue placeholder="Choose an option..." /></SelectTrigger>
                    <SelectContent>
                      {productOptions.map((opt: any) => (
                        <SelectItem key={opt.productOptionCode} value={opt.productOptionCode}>
                          {opt.description || opt.title || opt.productOptionCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {/* Special Requests */}
            <Card>
              <CardHeader><CardTitle>Special Requests</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Dietary requirements, accessibility needs, hotel pickup address, etc."
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Payment Method */}
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

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Processing..." : `Confirm & Pay ${formatPrice(total)}`}
            </Button>
          </form>

          {/* Sidebar */}
          <div>
            <Card className="sticky top-24">
              <CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5 text-primary" /> Order Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {heroImage && (
                  <div className="rounded-lg overflow-hidden aspect-video">
                    <img src={heroImage} alt={product.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground">{product.title}</p>
                  <p className="text-sm text-muted-foreground">{destination}{duration ? ` • ${duration}` : ""}</p>
                </div>

                {rating > 0 && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Star className="w-4 h-4 fill-accent text-accent" />
                    <span>{rating.toFixed(1)}</span>
                    <span>({reviews.totalReviews || 0} reviews)</span>
                  </div>
                )}

                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{formatPrice(price)} × {travelers} traveler{travelers > 1 ? "s" : ""}</span>
                    <span className="text-foreground">{formatPrice(subtotal)}</span>
                  </div>
                  {convenienceFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Convenience Fee</span>
                      <span className="text-foreground">{formatPrice(convenienceFee)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="text-xl font-bold text-primary">{formatPrice(total)}</span>
                  </div>
                </div>

                {cancellation.description && (
                  <div className="border-t border-border pt-3">
                    <div className="flex items-start gap-2">
                      <Shield className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">{cancellation.description}</p>
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Your booking will be confirmed by our team within 24 hours.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ViatorTourBooking;
