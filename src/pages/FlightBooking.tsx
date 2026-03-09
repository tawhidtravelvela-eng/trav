import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, Loader2, ChevronDown, ChevronUp, Users, Clock, ArrowRight, Shield, CreditCard, Building2, Wallet, Briefcase, CalendarIcon, ExternalLink, Zap, Timer, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";
import { saveBooking, processBkashPayment, executeBkashPayment, updateBookingStatus } from "@/utils/bookingService";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { getAirlineName } from "@/data/airlines";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import BookingProgressModal, { type BookingModalStatus } from "@/components/flights/BookingProgressModal";
import FareVerificationDialog, { type FareVerificationState } from "@/components/flights/FareVerificationDialog";
import SavedPassengerPicker from "@/components/flights/SavedPassengerPicker";
import { useAuth } from "@/contexts/AuthContext";
import { detectCountry, type CountryInfo } from "@/utils/geolocation";
import PhoneInput from "@/components/ui/phone-input";
import CountryPicker from "@/components/ui/country-picker";
import AncillarySection, { type PaxSsrSelections, type SsrOption } from "@/components/flights/AncillarySection";

const fmtTime = (t: string) => {
  try { return format(parseISO(t), "HH:mm"); } catch { return t; }
};
const fmtDate = (t: string) => {
  try { return format(parseISO(t), "EEE, dd MMM yyyy"); } catch { return ""; }
};

const NATIONALITIES = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Australia", "Austria",
  "Bahrain", "Bangladesh", "Belgium", "Bhutan", "Brazil", "Brunei",
  "Cambodia", "Canada", "China", "Colombia", "Denmark", "Egypt",
  "Ethiopia", "Finland", "France", "Germany", "Greece", "Hong Kong",
  "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Japan", "Jordan", "Kenya", "Kuwait", "Laos", "Lebanon",
  "Malaysia", "Maldives", "Mexico", "Mongolia", "Morocco", "Myanmar",
  "Nepal", "Netherlands", "New Zealand", "Nigeria", "Norway", "Oman",
  "Pakistan", "Palestine", "Philippines", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Saudi Arabia", "Singapore", "South Africa",
  "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland",
  "Taiwan", "Thailand", "Turkey", "UAE", "UK", "USA",
  "Ukraine", "Uzbekistan", "Vietnam", "Yemen",
];

// Payment methods are now loaded dynamically via usePaymentMethods hook

interface Flight {
  id: string; airline: string; from_city: string; to_city: string;
  departure: string; arrival: string; duration: string; price: number;
  stops: number; class: string; flightNumber?: string; source?: string;
  segments?: any[]; basePrice?: number; taxes?: number;
  paxPricing?: Record<string, { base: number; taxes: number; total: number }> | null;
}

interface PassengerForm {
  title: string; firstName: string; lastName: string; dob: string;
  nationality: string; frequentFlyer: string; passportCountry: string;
  passportNumber: string; passportExpiry: string;
}

const emptyPassenger = (): PassengerForm => ({
  title: "", firstName: "", lastName: "", dob: "", nationality: "",
  frequentFlyer: "", passportCountry: "", passportNumber: "", passportExpiry: "",
});

function getClassDisplay(flight: { class: string; segments?: any[] }): string {
  const bookingCode = flight.segments?.[0]?.bookingCode;
  return bookingCode ? `${flight.class} ( ${bookingCode} )` : flight.class;
}

// Age calculation helpers — age is computed on the date of travel (first flight departure)
function getAgeOnDate(dob: string, travelDate: Date): number {
  const birth = new Date(dob);
  let age = travelDate.getFullYear() - birth.getFullYear();
  const m = travelDate.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && travelDate.getDate() < birth.getDate())) age--;
  return age;
}

function getDobRange(paxType: string, travelDate: Date): { minDate: Date; maxDate: Date; fromYear: number; toYear: number } {
  if (paxType === "Infant") {
    // Under 2 on travel date → born between (travelDate - 2years + 1day) and travelDate
    const maxDate = new Date(travelDate);
    const minDate = new Date(travelDate);
    minDate.setFullYear(minDate.getFullYear() - 2);
    minDate.setDate(minDate.getDate() + 1);
    return { minDate, maxDate, fromYear: minDate.getFullYear(), toYear: maxDate.getFullYear() };
  }
  if (paxType === "Child") {
    // 2–11 on travel date → born between (travelDate - 12years + 1day) and (travelDate - 2years)
    const maxDate = new Date(travelDate);
    maxDate.setFullYear(maxDate.getFullYear() - 2);
    const minDate = new Date(travelDate);
    minDate.setFullYear(minDate.getFullYear() - 12);
    minDate.setDate(minDate.getDate() + 1);
    return { minDate, maxDate, fromYear: minDate.getFullYear(), toYear: maxDate.getFullYear() };
  }
  // Adult: 12+ on travel date → born before (travelDate - 12years)
  const maxDate = new Date(travelDate);
  maxDate.setFullYear(maxDate.getFullYear() - 12);
  const minDate = new Date(1940, 0, 1);
  return { minDate, maxDate, fromYear: 1940, toYear: maxDate.getFullYear() };
}

const FlightBooking = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const { formatPrice, formatDirectPrice, currency: displayCurrency } = useCurrency();
  const taxSettings = useTaxSettings();
  const { branding } = useSiteBranding();
  const { methods: PAYMENT_METHODS, requestToBookOnly } = usePaymentMethods();
  const { user } = useAuth();
  const { tenant } = useTenant();

  const adultsFromState = (location.state as any)?.adults as number | undefined;
  const adultsFromParams = searchParams.get("adults");
  const adultCount = adultsFromState || (adultsFromParams ? parseInt(adultsFromParams) : 1);
  const childCount = parseInt(searchParams.get("children") || "0");
  const infantCount = parseInt(searchParams.get("infants") || "0");
  const totalPax = adultCount + childCount + infantCount;

  // Restore form data from sessionStorage if available (for seamless toggle with Flight Details)
  const FORM_STORAGE_KEY = `booking-form-${id}`;
  const savedForm = (() => {
    try { const s = sessionStorage.getItem(FORM_STORAGE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  })();

  const [passengers, setPassengers] = useState<PassengerForm[]>(() =>
    savedForm?.passengers || Array.from({ length: totalPax }, emptyPassenger)
  );
  const [collapsedPax, setCollapsedPax] = useState<Set<number>>(new Set());
  const [contactEmail, setContactEmail] = useState(savedForm?.contactEmail || "");
  const [contactPhone, setContactPhone] = useState(savedForm?.contactPhone || "");
  const [loading, setLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(savedForm?.selectedPayment || "card");
  const [priceVerified, setPriceVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [bookingModalStatus, setBookingModalStatus] = useState<BookingModalStatus>(null);
  const [bookingModalPnr, setBookingModalPnr] = useState<string | null>(null);
  const [bookingModalError, setBookingModalError] = useState<string>("");
  const [detectedCountry, setDetectedCountry] = useState<CountryInfo | null>(null);
  const [dobOpenIdx, setDobOpenIdx] = useState<number | null>(null);
  const [ppExpiryOpenIdx, setPpExpiryOpenIdx] = useState<number | null>(null);
  const [fareVerification, setFareVerification] = useState<FareVerificationState>(null);

  // GST info — optional, shown only for Indian nationals on Tripjack flights
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstNumber, setGstNumber] = useState("");
  const [gstCompanyName, setGstCompanyName] = useState("");
  const [gstCompanyAddress, setGstCompanyAddress] = useState("");
  const [gstCompanyEmail, setGstCompanyEmail] = useState("");
  const [gstCompanyPhone, setGstCompanyPhone] = useState("");

  // SSR / Ancillary selections (per passenger)
  const [ssrSelections, setSsrSelections] = useState<PaxSsrSelections[]>(() =>
    Array.from({ length: totalPax }, () => ({}))
  );
  const [reviewSsrData, setReviewSsrData] = useState<{ mealOptions?: SsrOption[]; baggageOptions?: SsrOption[] } | null>(null);

  // Determine if this is a Tripjack instant-purchase or hold-eligible flight
  const isTripjackFlight = flight?.source === "tripjack" && !!(flight as any)?.segments?.length;
  const tjConditions = (flight as any)?.tripjackConditions;
  const isInstantPurchase = isTripjackFlight && ((flight as any)?.isLcc || tjConditions?.isa === false);
  const isHoldEligible = isTripjackFlight && !isInstantPurchase;

  // Countdown timer
  const countdownSeconds = isInstantPurchase ? 10 * 60 : isHoldEligible ? 30 * 60 : 0;
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start timer once when countdownSeconds becomes > 0
  useEffect(() => {
    if (countdownSeconds <= 0) return;
    if (timerRef.current) return; // Already started

    setTimeLeft(countdownSeconds);
    setTimerExpired(false);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setTimerExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [countdownSeconds]);

  const fmtCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };
  const timerUrgent = timeLeft > 0 && timeLeft < 120;
  const timerProgress = countdownSeconds > 0 ? (timeLeft / countdownSeconds) * 100 : 100;

  // Persist form data to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ passengers, contactEmail, contactPhone, selectedPayment }));
    } catch {}
  }, [passengers, contactEmail, contactPhone, selectedPayment, FORM_STORAGE_KEY]);

  useEffect(() => {
    const stateFlight = (location.state as any)?.flight as Flight | undefined;
    if (stateFlight) {
      setFlight(stateFlight);
      setPageLoading(false);
      // Load SSR data from the verified flight state
      if ((stateFlight as any)?.tripjackSsrData) {
        setReviewSsrData((stateFlight as any).tripjackSsrData);
      }
      return;
    }
    supabase.from("flights").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setFlight(data as any); setPageLoading(false);
    });
  }, [id, location.state]);

  // Geolocation: auto-populate nationality, passport country & phone code
  useEffect(() => {
    detectCountry().then((country) => {
      if (!country) return;
      setDetectedCountry(country);
      // Auto-fill nationality & passport country for all passengers that are empty
      setPassengers((prev) =>
        prev.map((p) => ({
          ...p,
          nationality: p.nationality || country.name,
          passportCountry: p.passportCountry || country.name,
        }))
      );
      // Auto-fill phone with dial code if empty
      if (!contactPhone) {
        setContactPhone(country.dialCode + " ");
      }
    });
  }, []);

  // Check if any passenger is Indian national (for GST section visibility)
  const hasIndianNational = useMemo(() =>
    passengers.some((p) => {
      const nat = p.nationality?.toLowerCase();
      return nat === "india" || nat === "in";
    }), [passengers]);

  if (pageLoading) return <Layout><div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  if (!flight) return <Layout><div className="container mx-auto px-4 py-20 text-center"><h2 className="text-2xl font-bold">Flight not found</h2><Button className="mt-4" onClick={() => navigate("/flights")}>Back to Flights</Button></div></Layout>;

  const airlineName = getAirlineName(flight.airline);
  const basePrice = Math.round(Number(flight.price));
  const flightSource = flight.source;
  const paxP = (flight as any).paxPricing;
  const childPrice = paxP?.CHD ? Math.round(paxP.CHD.total) : Math.round(basePrice * 0.75);
  const infantPrice = paxP?.INF ? Math.round(paxP.INF.total) : Math.round(basePrice * 0.10);

  const adultTotal = basePrice * adultCount;
  const childTotal = childPrice * childCount;
  const infantTotal = infantPrice * infantCount;
  
  // Prices are already converted by backend — use directly
  const dispAdultTotal = basePrice * adultCount;
  const dispChildTotal = childPrice * childCount;
  const dispInfantTotal = infantPrice * infantCount;
  const dispSubtotal = dispAdultTotal + dispChildTotal + dispInfantTotal;
  const subtotal = adultTotal + childTotal + infantTotal;
  const ssrCost = ssrSelections.reduce((sum, sel) => sum + (sel.seat?.amount || 0) + (sel.baggage?.amount || 0) + (sel.meal?.amount || 0), 0);
  const subtotalWithSsr = subtotal + ssrCost;
  const convenienceFee = Math.round(subtotalWithSsr * (taxSettings.convenienceFeePercentage / 100));
  const dispSsrCost = ssrCost; // SSR amounts are already in display currency
  const dispConvenienceFee = Math.round((dispSubtotal + dispSsrCost) * (taxSettings.convenienceFeePercentage / 100));
  const dispTotal = dispSubtotal + dispSsrCost + dispConvenienceFee;
  const total = subtotalWithSsr + convenienceFee;
  const fmtDisp = (v: number) => `${CURRENCIES[displayCurrency].symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const updatePax = (idx: number, key: keyof PassengerForm, value: string) => {
    setPassengers((prev) => prev.map((p, i) => i === idx ? { ...p, [key]: value } : p));
  };

  const toggleCollapse = (idx: number) => {
    setCollapsedPax((prev) => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });
  };

  const getPaxLabel = (idx: number) => {
    if (idx < adultCount) return { type: "Adult", num: idx + 1 };
    if (idx < adultCount + childCount) return { type: "Child", num: idx - adultCount + 1 };
    return { type: "Infant", num: idx - adultCount - childCount + 1 };
  };

  const verifyPrice = async () => {
    // Travelport verification
    if (flight?.source === "travelport" && flight.segments?.length) {
      setVerifying(true);
      try {
        const studentFare = searchParams.get("studentFare") === "true";
        const { data, error } = await supabase.functions.invoke("travelport-price", {
          body: { segments: flight.segments, adults: adultCount, children: childCount, infants: infantCount, cabinClass: flight.class, studentFare },
        });
        if (error || !data?.verified) {
          toast.info("Price verification unavailable. Proceeding with displayed fare.");
          setVerifying(false);
          return true;
        }
        if (Math.abs(data.totalPrice - basePrice) > basePrice * 0.05) {
          toast.warning(`Fare has changed. New price: ${data.currency} ${data.totalPrice}`);
        }
        setPriceVerified(true);
        setVerifying(false);
        return true;
      } catch {
        toast.error("Could not verify price. Proceeding with displayed fare.");
        setVerifying(false);
        return true;
      }
    }
    // Amadeus verification
    if (flight?.source === "amadeus" && (flight as any).amadeusRawOffer) {
      setVerifying(true);
      try {
        const { data, error } = await supabase.functions.invoke("amadeus-price", {
          body: { rawOffer: (flight as any).amadeusRawOffer },
        });
        if (error || !data?.success) {
          toast.info("Price verification unavailable. Proceeding with displayed fare.");
          setVerifying(false);
          return true;
        }
        if (data.verifiedRawOffer) (flight as any).amadeusRawOffer = data.verifiedRawOffer;
        if (Math.abs(data.totalPrice - (flight as any).rawApiPrice) > 1) {
          toast.warning(`Fare updated. New price: ${data.currency} ${data.totalPrice}`);
        }
        setPriceVerified(true);
        setVerifying(false);
        return true;
      } catch {
        toast.error("Could not verify price. Proceeding with displayed fare.");
        setVerifying(false);
        return true;
      }
    }
    return true;
  };

  // Helper: build common passenger/booking data
  const buildBookingPayload = (pnr: string | null, airlinePnr: string | null) => {
    const passengerDetails = passengers.map((p, i) => ([
      { label: `Passenger ${i + 1}`, value: `${p.title} ${p.firstName} ${p.lastName}` },
      ...(p.dob ? [{ label: `Pax ${i + 1} DOB`, value: p.dob }] : []),
      ...(p.nationality ? [{ label: `Pax ${i + 1} Nationality`, value: p.nationality }] : []),
      ...(p.passportNumber ? [{ label: `Pax ${i + 1} Passport No.`, value: p.passportNumber }] : []),
      ...(p.passportCountry ? [{ label: `Pax ${i + 1} Passport Country`, value: p.passportCountry }] : []),
      ...(p.passportExpiry ? [{ label: `Pax ${i + 1} Passport Expiry`, value: p.passportExpiry }] : []),
      ...(p.frequentFlyer ? [{ label: `Pax ${i + 1} Frequent Flyer`, value: p.frequentFlyer }] : []),
    ])).flat();

    const passengerNames = passengers.map((p, i) => ({
      name: `${p.title} ${p.firstName} ${p.lastName}`,
      type: i < adultCount ? "Adult" : i < adultCount + childCount ? "Child" : "Infant",
    }));

    return {
      type: "Flight",
      title: `${flight!.from_city} → ${flight!.to_city}`,
      subtitle: `${airlineName}${flight!.flightNumber ? ` (${flight!.flightNumber})` : ""} • ${flight!.class}`,
      details: [
        { label: "Departure", value: flight!.departure },
        { label: "Arrival", value: flight!.arrival },
        { label: "Duration", value: flight!.duration },
        { label: "Stops", value: String(flight!.stops || 0) },
        { label: "Passengers", value: String(totalPax) },
        ...(pnr ? [{ label: "PNR", value: pnr }] : []),
        ...passengerDetails,
        { label: "Contact Email", value: contactEmail },
        ...(contactPhone ? [{ label: "Contact Phone", value: contactPhone }] : []),
        { label: "Payment Method", value: PAYMENT_METHODS.find((m) => m.id === selectedPayment)?.label || selectedPayment },
      ],
      total,
      bookingId: `FL-${Date.now().toString(36).toUpperCase()}`,
      confirmationData: {
        galileo_pnr: pnr || "",
        airline_pnr: airlinePnr || "",
        passengers: passengerNames,
        etickets: passengerNames.map(() => ""),
        // Store original API price info for admin reference
        api_source: flight!.source || "database",
        original_currency: (flight as any).originalCurrency || (flight as any).currency || displayCurrency,
        original_price: (flight as any).originalPrice || Math.round(Number(flight!.price)),
        original_base_price: (flight as any).originalBasePrice,
        original_taxes: (flight as any).originalTaxes,
        aitAmount: (flight as any).aitAmount || 0,
        aitPct: (flight as any).aitPct || 0,
        display_currency: displayCurrency,
        display_total: dispTotal,
        ancillaries: ssrSelections.map((sel, idx) => {
          const paxName = passengerNames[idx]?.name || `Passenger ${idx + 1}`;
          const items: { type: string; description: string; amount: number; currency?: string }[] = [];
          if (sel.seat) items.push({ type: "Seat", description: `Seat ${sel.seat.number}`, amount: sel.seat.amount, currency: sel.seat.currency });
          if (sel.baggage) items.push({ type: "Baggage", description: sel.baggage.description, amount: sel.baggage.amount, currency: sel.baggage.currency });
          if (sel.meal) items.push({ type: "Meal", description: sel.meal.description, amount: sel.meal.amount, currency: sel.meal.currency });
          return items.length > 0 ? { passenger: paxName, items } : null;
        }).filter(Boolean),
      },
    };
  };

  const buildApiPassengers = () => passengers.map((p, i) => ({
    title: p.title, firstName: p.firstName, lastName: p.lastName,
    dob: p.dob || undefined, nationality: p.nationality || undefined,
    passportNumber: p.passportNumber || undefined, passportCountry: p.passportCountry || undefined,
    passportExpiry: p.passportExpiry || undefined,
    frequentFlyer: p.frequentFlyer || undefined,
    type: (i < adultCount ? "ADT" : i < adultCount + childCount ? "CNN" : "INF") as "ADT" | "CNN" | "INF",
  }));

  // Build GST info for Tripjack if enabled
  const buildGstInfo = () => {
    if (!gstEnabled || !gstNumber) return undefined;
    return {
      gstNumber: gstNumber.trim(),
      companyName: gstCompanyName.trim() || undefined,
      companyAddress: gstCompanyAddress.trim() || undefined,
      email: gstCompanyEmail.trim() || undefined,
      phone: gstCompanyPhone.trim() || undefined,
    };
  };

  // Re-verify Tripjack fare before instant purchase — uses FareVerificationDialog
  const reverifyTripjackFare = async (): Promise<{ ok: boolean; newTotalFare?: number }> => {
    const priceId = (flight as any)?.tripjackPriceId;
    if (!priceId) return { ok: true };

    // Show fare verification dialog
    setFareVerification({ status: "verifying" });

    try {
      const { data, error } = await supabase.functions.invoke("tripjack-review", {
        body: { priceIds: [priceId], targetCurrency: displayCurrency },
      });

      if (error || !data?.success) {
        return new Promise((resolve) => {
          setFareVerification({
            status: "unavailable",
            message: data?.error || "Fare is no longer available. Please search again.",
            onSearchAgain: () => {
              setFareVerification(null);
              navigate("/flights");
              resolve({ ok: false });
            },
          });
        });
      }

      // Update bookingId if changed
      if (data.bookingId) (flight as any).tripjackBookingId = data.bookingId;
      if (data.totalPriceInfo) (flight as any).tripjackTotalPriceInfo = data.totalPriceInfo;
      if (data.conditions) (flight as any).tripjackConditions = data.conditions;
      // Capture SSR data from review
      if (data.ssrData) setReviewSsrData(data.ssrData);

      const newTotalFare = data.totalPriceInfo?.totalFareDetail?.fC?.TF;

      // Check for fare alert (price changes)
      // Tripjack review returns raw INR prices — convert to display currency
      if (data.fareAlert) {
        const oldFare = data.fareAlert.oldFare || 0;
        const newFare = data.fareAlert.newFare || 0;
        if (Math.abs(newFare - oldFare) > 1) {
          const markupPct = (flight as any).appliedMarkupPct || 0;
          // Compute conversion ratio: display price / raw API price
          const originalApiPrice = (flight as any).rawApiPrice || (flight as any).originalPrice || oldFare;
          const conversionRatio = originalApiPrice > 0 ? flight!.price / originalApiPrice : 1;

          const newMarkedUpRaw = markupPct > 0
            ? newFare * (1 + markupPct / 100)
            : newFare;
          const newDisplayPrice = Math.round(newMarkedUpRaw * conversionRatio);
          const oldDisplayPrice = Math.round(
            (markupPct > 0 ? oldFare * (1 + markupPct / 100) : oldFare) * conversionRatio
          );
          const diff = newDisplayPrice - oldDisplayPrice;

          flight!.price = newDisplayPrice;
          (flight as any).rawApiPrice = newFare;

          return new Promise((resolve) => {
            setFareVerification({
              status: "price_changed",
              type: diff > 0 ? "increased" : "decreased",
              oldPrice: oldDisplayPrice.toLocaleString(),
              newPrice: newDisplayPrice.toLocaleString(),
              diff: Math.abs(diff).toLocaleString(),
              onProceed: () => {
                setFareVerification(null);
                resolve({ ok: true, newTotalFare });
              },
              onSearchAgain: () => {
                setFareVerification(null);
                navigate("/flights");
                resolve({ ok: false });
              },
            });
          });
        }
      }

      // Price verified — show success briefly
      return new Promise((resolve) => {
        setFareVerification({
          status: "verified",
          onProceed: () => {
            setFareVerification(null);
            resolve({ ok: true, newTotalFare });
          },
        });
      });
    } catch {
      setFareVerification(null);
      toast.info("Price verification unavailable. Proceeding with displayed fare.");
      return { ok: true };
    }
  };

  // Process payment (shared between both flows)
  const processPayment = async (bookingData: any, dbId: string): Promise<boolean> => {
    const isBkash = selectedPayment === "bkash";
    if (isBkash) {
      try {
        const bkResult = await processBkashPayment(total, bookingData.bookingId);
        if (!bkResult.success) {
          toast.error(bkResult.error || "bKash payment initiation failed");
          return false;
        }
        if (bkResult.bkashURL) {
          sessionStorage.setItem("bkash_paymentID", bkResult.paymentID || "");
          sessionStorage.setItem("bkash_id_token", bkResult.id_token || "");
          sessionStorage.setItem("bkash_booking_db_id", dbId);
          sessionStorage.setItem("bkash_booking_data", JSON.stringify(bookingData));
          window.location.href = bkResult.bkashURL;
          return true;
        }
        if (bkResult.paymentID && bkResult.id_token) {
          const execResult = await executeBkashPayment(bkResult.paymentID, bkResult.id_token);
          if (execResult.success && execResult.transactionStatus === "Completed") {
            await updateBookingStatus(dbId, "Paid");
            toast.success(`bKash payment successful! TrxID: ${execResult.trxID}`);
            navigate("/booking/confirmation", { state: { ...bookingData, bkashTrxID: execResult.trxID, paymentStatus: "Paid", dbId } });
            return true;
          } else {
            toast.error("bKash payment was not completed.");
            navigate("/booking/confirmation", { state: { ...bookingData, paymentStatus: "Pending", dbId } });
            return true;
          }
        }
      } catch {
        toast.error("bKash payment failed.");
        return false;
      }
    }
    // Card/bank — navigate to confirmation (admin confirms payment)
    navigate("/booking/confirmation", { state: { ...bookingData, paymentStatus: "Pending", dbId } });
    return true;
  };

  // Call Tripjack book API
  const callTripjackBook = async (paymentAmount?: number): Promise<{ success: boolean; pnr?: string; airlinePnr?: string; error?: string }> => {
    const tjBookingId = (flight as any)?.tripjackBookingId;
    if (!tjBookingId) return { success: false, error: "Missing booking reference. Please go back and select the flight again." };
    const apiPassengers = buildApiPassengers();
    const gstInfo = buildGstInfo();

    // Build SSR selections per passenger for Tripjack book API
    const ssrInfoPerPax = ssrSelections.map((sel) => {
      const ssrInfo: Record<string, any[]> = {};
      if (sel.seat) {
        ssrInfo.ssrSeatInfos = [{ code: sel.seat.number, ssrType: sel.seat.ssrType || 4, amount: sel.seat.amount, key: sel.seat.key }];
      }
      if (sel.baggage) {
        ssrInfo.ssrBaggageInfos = [{ code: sel.baggage.code, ssrType: sel.baggage.ssrType || 2, amount: sel.baggage.amount, key: sel.baggage.key }];
      }
      if (sel.meal) {
        ssrInfo.ssrMealInfos = [{ code: sel.meal.code, ssrType: sel.meal.ssrType || 3, amount: sel.meal.amount, key: sel.meal.key }];
      }
      return Object.keys(ssrInfo).length > 0 ? ssrInfo : undefined;
    });

    const { data, error } = await supabase.functions.invoke("tripjack-book", {
      body: {
        bookingId: tjBookingId,
        passengers: apiPassengers,
        contactEmail,
        contactPhone,
        ...(paymentAmount ? { paymentAmount } : {}),
        ...(gstInfo ? { gstInfo } : {}),
        ssrInfoPerPax: ssrInfoPerPax.some(Boolean) ? ssrInfoPerPax : undefined,
      },
    });
    if (error || !data?.success || !data?.pnr) {
      return { success: false, error: data?.error || error?.message || "Booking failed" };
    }
    return { success: true, pnr: data.pnr, airlinePnr: data.airlinePnr || undefined };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (timerExpired) {
      toast.error("Session expired. Please search again.");
      navigate("/flights");
      return;
    }
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (!p.title || !p.firstName || !p.lastName) {
        toast.error(`Please fill name and title for Passenger ${i + 1}`);
        setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
        return;
      }
      if (!p.dob) {
        toast.error(`Please enter date of birth for Passenger ${i + 1}`);
        setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
        return;
      }
      // Validate age category matches DOB on travel date
      if (p.dob && flight) {
        const travelDate = new Date(flight.departure);
        const age = getAgeOnDate(p.dob, travelDate);
        const { type: paxType } = getPaxLabel(i);
        if (paxType === "Infant" && (age >= 2 || age < 0)) {
          toast.error(`Passenger ${i + 1} (Infant) must be under 2 years on travel date. Current age: ${age}`);
          setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
          return;
        }
        if (paxType === "Child" && (age < 2 || age >= 12)) {
          toast.error(`Passenger ${i + 1} (Child) must be 2–11 years on travel date. Current age: ${age}`);
          setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
          return;
        }
        if (paxType === "Adult" && age < 12) {
          toast.error(`Passenger ${i + 1} (Adult) must be 12+ years on travel date. Current age: ${age}`);
          setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
          return;
        }
      }
      if (!p.nationality) {
        toast.error(`Please select nationality for Passenger ${i + 1}`);
        setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
        return;
      }
      // Determine passenger type for this index
      const paxTypeForValidation = i < adultCount ? "Adult" : i < adultCount + childCount ? "Child" : "Infant";
      
      if (!p.passportNumber) {
        toast.error(`Please enter passport number for Passenger ${i + 1}`);
        setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
        return;
      }
      if (!p.passportCountry) {
        toast.error(`Please select passport country for Passenger ${i + 1}`);
        setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
        return;
      }
      // Passport expiry is only required for adults per Tripjack API spec
      if (paxTypeForValidation === "Adult" && !p.passportExpiry) {
        toast.error(`Please enter passport expiry for Passenger ${i + 1}`);
        setCollapsedPax((prev) => { const s = new Set(prev); s.delete(i); return s; });
        return;
      }
    }
    if (!contactEmail) { toast.error("Please enter contact email"); return; }
    if (!contactPhone || contactPhone.length < 5) { toast.error("Please enter contact phone number"); return; }

    setLoading(true);

    // Travelport or Amadeus price verification
    if ((flight.source === "travelport" || flight.source === "amadeus") && !priceVerified) {
      const ok = await verifyPrice();
      if (!ok) { setLoading(false); return; }
    }

    const isTravelport = flight.source === "travelport" && flight.segments?.length;
    const isTravelVela = flight.source === "travelvela" && flight.segments?.length;
    const isAmadeus = flight.source === "amadeus" && (flight as any)?.amadeusRawOffer;

    // ========== TRIPJACK INSTANT PURCHASE FLOW ==========
    // Re-verify price → Save booking as "Awaiting Payment" → Payment → API Book (on confirmation page)
    if (isInstantPurchase) {
      // Step 1: Re-verify fare
      const { ok, newTotalFare } = await reverifyTripjackFare();
      if (!ok) { setLoading(false); return; }

      // Step 2: Save booking as "Awaiting Payment" with Tripjack data for post-payment API call
      const tjPaymentAmount = newTotalFare || (flight as any)?.tripjackTotalPriceInfo?.totalFareDetail?.fC?.TF;
      const bookingData = buildBookingPayload(null, null);
      // Store tripjack booking data needed to call API after payment
      (bookingData as any).confirmationData.tripjack_pending = {
        bookingId: (flight as any)?.tripjackBookingId,
        paymentAmount: tjPaymentAmount,
        passengers: buildApiPassengers(),
        contactEmail,
        contactPhone,
      };
      const dbId = await saveBooking(bookingData, "Awaiting Payment");
      if (!dbId) { toast.error("Failed to save booking."); setLoading(false); return; }

      // Step 3: Proceed to payment — after payment, confirmation page will call tripjack-book
      const paymentOk = await processPayment({ ...bookingData, dbId }, dbId);
      if (!paymentOk) { setLoading(false); return; }
      return;
    }

    // ========== TRIPJACK HOLD-ELIGIBLE FLOW ==========
    // API Book first (hold PNR) → Save booking → Payment
    if (isHoldEligible) {
      setBookingModalStatus("booking");
      setBookingModalPnr(null);
      setBookingModalError("");

      const result = await callTripjackBook(); // No payment amount = hold booking
      if (!result.success) {
        setBookingModalError(result.error || "Could not hold this booking.");
        setBookingModalStatus("failed");
        setLoading(false);
        return;
      }

      // Don't show Tripjack booking ID to customer — store it for admin only
      setBookingModalPnr("Booking confirmed!");
      setBookingModalStatus("success");
      await new Promise((r) => setTimeout(r, 2000));
      setBookingModalStatus(null);

      // Save booking — store TJ booking ID in confirmation_data for admin, not as customer-visible PNR
      const bookingData = buildBookingPayload(null, result.airlinePnr || null);
      (bookingData as any).confirmationData.tripjack_booking_id = result.pnr || "";
      const dbId = await saveBooking(bookingData, "Confirmed");
      if (!dbId) { toast.error("Failed to save booking."); setLoading(false); return; }

      // Proceed to payment
      const paymentOk = await processPayment(bookingData, dbId);
      if (!paymentOk) { setLoading(false); return; }
      return;
    }

    // ========== TRAVELPORT / TRAVELVELA / AMADEUS / OTHER FLOWS ==========
    let pnr: string | null = null;
    let airlinePnr: string | null = null;
    const isApiSourced = isTravelport || isTravelVela || isAmadeus;

    if (isApiSourced) {
      try {
        const apiPassengers = buildApiPassengers();
        setBookingModalStatus("booking");
        setBookingModalPnr(null);
        setBookingModalError("");

        let bookData: any = null;
        let bookError: any = null;

        if (isTravelport) {
          // Build ancillary selections for Travelport
          const tpAncillaries = ssrSelections.map((sel) => {
            const anc: Record<string, any> = {};
            if (sel.seat) anc.seat = { number: sel.seat.number, key: sel.seat.key, amount: sel.seat.amount };
            if (sel.baggage) anc.baggage = { code: sel.baggage.code, key: sel.baggage.key, amount: sel.baggage.amount, description: sel.baggage.description };
            if (sel.meal) anc.meal = { code: sel.meal.code, key: sel.meal.key, amount: sel.meal.amount, description: sel.meal.description };
            return Object.keys(anc).length > 0 ? anc : undefined;
          });

          const result = await supabase.functions.invoke("travelport-book", {
            body: {
              segments: flight.segments!.map((seg: any) => ({
                ...seg,
                key: seg?.key ?? seg?.segmentKey ?? seg?.Key ?? seg?.airSegmentKey ?? undefined,
              })),
              passengers: apiPassengers,
              contactEmail,
              contactPhone,
              cabinClass: flight.class,
              flightId: flight.id,
              ancillaries: tpAncillaries.some(Boolean) ? tpAncillaries : undefined,
            },
          });
          bookData = result.data;
          bookError = result.error;
        } else if (isAmadeus) {
          const result = await supabase.functions.invoke("amadeus-book", {
            body: {
              rawOffer: (flight as any).amadeusRawOffer,
              passengers: apiPassengers,
              contactEmail,
              contactPhone,
            },
          });
          bookData = result.data;
          bookError = result.error;
        } else if (isTravelVela) {
          const result = await supabase.functions.invoke("travelvela-book", {
            body: {
              segments: flight.segments,
              passengers: apiPassengers,
              contactEmail,
              contactPhone,
              cabinClass: flight.class,
              adults: adultCount,
              children: childCount,
              infants: infantCount,
            },
          });
          bookData = result.data;
          bookError = result.error;
        }

        if (bookError || !bookData?.success || !bookData?.pnr) {
          const errMsg = bookData?.error || bookError?.message || "Could not create booking with the airline. Please try again.";
          setBookingModalError(errMsg);
          setBookingModalStatus("failed");
          setLoading(false);
          return;
        }

        pnr = bookData.pnr;
        airlinePnr = bookData.airlinePnr || null;
        setBookingModalPnr(pnr);
        setBookingModalStatus("success");
        await new Promise((r) => setTimeout(r, 2000));
        setBookingModalStatus(null);
      } catch (err) {
        console.error("API PNR creation failed:", err);
        setBookingModalError("Failed to create airline booking. Please try again or contact support.");
        setBookingModalStatus("failed");
        setLoading(false);
        return;
      }
    }

    const bookingData = buildBookingPayload(pnr, airlinePnr);
    const initialStatus = pnr ? "Confirmed" : "Pending";
    const dbId = await saveBooking(bookingData, initialStatus);

    if (!dbId) {
      toast.error("Failed to save booking. Please try again.");
      setLoading(false);
      return;
    }

    const paymentOk = await processPayment(bookingData, dbId);
    if (!paymentOk) { setLoading(false); return; }
  };

  return (
    <Layout>
      {/* Header */}
      <div className="bg-hero-gradient py-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-20 w-32 h-32 border border-primary-foreground/20 rounded-full" />
          <div className="absolute -bottom-10 left-10 w-48 h-48 border border-primary-foreground/10 rounded-full" />
        </div>
        <div className="container mx-auto px-4 relative">
          <button onClick={() => {
            // Reconstruct search URL from flight data + booking params
            const params = new URLSearchParams();
            if (flight.from_city) params.set("from", flight.from_city);
            if (flight.to_city) params.set("to", flight.to_city);
            if (adultCount) params.set("adults", String(adultCount));
            if (childCount) params.set("children", String(childCount));
            if (infantCount) params.set("infants", String(infantCount));
            if (flight.class) params.set("class", flight.class);
            // Try to get the search date from sessionStorage or flight departure
            const storedDate = sessionStorage.getItem("lastSearchDate");
            if (storedDate) params.set("date", storedDate);
            navigate(`/flights?${params.toString()}`);
          }} className="text-primary-foreground/70 hover:text-primary-foreground text-sm inline-flex items-center gap-1 transition-colors mb-3">
            ← Back to Search
          </button>
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl md:text-3xl font-extrabold text-primary-foreground tracking-tight">Complete Your Booking</h1>
            <Link
              to={`/flights/${flight.id}?adults=${adultCount}&children=${childCount}&infants=${infantCount}`}
              state={{ flight }}
              className="group inline-flex items-center gap-1.5 text-primary-foreground/80 hover:text-primary-foreground text-sm font-medium transition-all duration-200 border-b border-dashed border-primary-foreground/30 hover:border-primary-foreground/70 pb-0.5"
            >
              <Plane className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-rotate-12" />
              View Flight Details
              <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 mt-4">
            <div className="flex items-center gap-2 bg-primary-foreground/15 backdrop-blur-sm rounded-full px-3.5 py-2 border border-primary-foreground/10">
              <img src={`https://pics.avs.io/64/64/${flight.airline}.png`} alt="" className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <span className="text-primary-foreground text-sm font-semibold">{airlineName}</span>
            </div>
            <div className="flex items-center gap-2 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-3.5 py-2 border border-primary-foreground/10">
              <span className="text-primary-foreground text-sm font-medium">{flight.from_city}</span>
              <ArrowRight className="w-3.5 h-3.5 text-primary-foreground/70" />
              <span className="text-primary-foreground text-sm font-medium">{flight.to_city}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-3.5 py-2 border border-primary-foreground/10">
              <Clock className="w-3.5 h-3.5 text-primary-foreground/70" />
              <span className="text-primary-foreground text-sm">{flight.duration}</span>
            </div>
            {flight.class && (
              <div className="flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-3.5 py-2 border border-primary-foreground/10">
                <Briefcase className="w-3.5 h-3.5 text-primary-foreground/70" />
                <span className="text-primary-foreground text-sm">{getClassDisplay(flight)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-primary-foreground/10 backdrop-blur-sm rounded-full px-3.5 py-2 border border-primary-foreground/10">
              <Users className="w-3.5 h-3.5 text-primary-foreground/70" />
              <span className="text-primary-foreground text-sm">{totalPax} Traveler{totalPax > 1 ? "s" : ""}</span>
            </div>
            {isInstantPurchase && (
              <div className="mt-3 inline-flex items-center gap-1.5 bg-amber-500/20 backdrop-blur-sm rounded-full px-3.5 py-2 border border-amber-400/30">
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span className="text-amber-100 text-xs font-semibold">Immediate Ticketing Required — Ticket will be issued instantly upon booking</span>
              </div>
            )}
          </div>
          {/* Countdown Timer — Sticky bar below header */}
          {countdownSeconds > 0 && (timeLeft > 0 || timerExpired) && (
            <div className={cn(
              "mt-5 rounded-xl overflow-hidden backdrop-blur-md transition-all duration-500",
              timerExpired
                ? "bg-destructive/20 border border-destructive/40"
                : timerUrgent
                  ? "bg-gradient-to-r from-amber-600/30 to-red-600/30 border border-amber-400/40"
                  : "bg-primary-foreground/10 border border-primary-foreground/15"
            )}>
              {/* Progress bar */}
              <div className="h-1 bg-primary-foreground/10 w-full">
                <div
                  className={cn(
                    "h-full transition-all duration-1000 ease-linear rounded-full",
                    timerExpired ? "bg-destructive" : timerUrgent ? "bg-amber-400" : "bg-primary-foreground/50"
                  )}
                  style={{ width: `${timerProgress}%` }}
                />
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Timer className={cn(
                    "w-4.5 h-4.5",
                    timerExpired ? "text-destructive" : timerUrgent ? "text-amber-300 animate-pulse" : "text-primary-foreground/70"
                  )} />
                  {timerExpired ? (
                    <span className="text-destructive text-sm font-bold">Session Expired</span>
                  ) : (
                    <span className={cn("text-sm font-medium", timerUrgent ? "text-amber-200" : "text-primary-foreground/80")}>
                      {isInstantPurchase ? "Complete payment within" : "Complete booking within"}
                    </span>
                  )}
                </div>
                {!timerExpired ? (
                  <div className={cn(
                    "flex items-center gap-1 rounded-lg px-3 py-1.5",
                    timerUrgent ? "bg-amber-500/30" : "bg-primary-foreground/15"
                  )}>
                    <span className={cn(
                      "text-xl font-mono font-extrabold tracking-wider tabular-nums",
                      timerUrgent ? "text-amber-100" : "text-primary-foreground"
                    )}>
                      {fmtCountdown(timeLeft)}
                    </span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => navigate("/flights")}
                    className="text-xs"
                  >
                    Search Again
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-muted/30 min-h-screen">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Forms */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
            {/* Pax type summary */}
            <div className="flex flex-wrap gap-3">
              {adultCount > 0 && (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-4 py-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{adultCount} Adult{adultCount > 1 ? "s" : ""}</span>
                </div>
              )}
              {childCount > 0 && (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-4 py-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{childCount} Child{childCount > 1 ? "ren" : ""}</span>
                </div>
              )}
              {infantCount > 0 && (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-4 py-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{infantCount} Infant{infantCount > 1 ? "s" : ""}</span>
                </div>
              )}
            </div>

            {/* Passenger Cards */}
            {passengers.map((pax, idx) => {
              const isCollapsed = collapsedPax.has(idx);
              const hasName = pax.firstName && pax.lastName;
              const { type: paxType, num: paxNum } = getPaxLabel(idx);
              return (
                <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                  <Card className="overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => hasName ? toggleCollapse(idx) : undefined}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-bold text-primary">{paxType[0]}{paxNum}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {paxType} {paxNum}
                            {hasName && <span className="text-muted-foreground font-normal ml-2">— {pax.title} {pax.firstName} {pax.lastName}</span>}
                          </p>
                          {idx === 0 && !hasName && <p className="text-xs text-muted-foreground">As per passport or government approved ID</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div onClick={(e) => e.stopPropagation()}>
                          <SavedPassengerPicker
                            paxIndex={idx}
                            currentPax={pax}
                            onSelect={(sp) => setPassengers(prev => prev.map((p, i) => i === idx ? sp : p))}
                            userId={user?.id}
                          />
                        </div>
                        {hasName && (isCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />)}
                      </div>
                    </div>

                    {!isCollapsed && (
                      <CardContent className="pt-0 pb-5 px-4 space-y-4 border-t border-border">
                        <div className="pt-4">
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">Title *</Label>
                          <div className="flex gap-2">
                            {(paxType === "Infant" ? ["MSTR", "MISS"] : ["MR.", "MS.", "MRS."]).map((t) => (
                              <button
                                key={t} type="button"
                                onClick={() => updatePax(idx, "title", t)}
                                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                                  pax.title === t
                                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                    : "border-border text-foreground hover:border-primary/50 hover:bg-muted/50"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Given Name / First Name *</Label>
                            <Input value={pax.firstName} onChange={(e) => updatePax(idx, "firstName", e.target.value)} required className="mt-1.5" placeholder="As per passport" />
                          </div>
                          <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Surname / Last Name *</Label>
                            <Input value={pax.lastName} onChange={(e) => updatePax(idx, "lastName", e.target.value)} required className="mt-1.5" placeholder="As per passport" />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {(() => {
                            const travelDate = flight ? new Date(flight.departure) : new Date();
                            const dobRange = getDobRange(paxType, travelDate);
                            const ageHint = paxType === "Infant" ? "Under 2 years on travel date"
                              : paxType === "Child" ? "2–11 years on travel date"
                              : "12+ years on travel date";
                            return (
                              <div>
                                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date of Birth *</Label>
                                <Popover open={dobOpenIdx === idx} onOpenChange={(o) => setDobOpenIdx(o ? idx : null)}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full mt-1.5 justify-start text-left font-normal h-10",
                                        !pax.dob && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                                      {pax.dob ? format(new Date(pax.dob), "dd MMM yyyy") : "Select date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0 z-[60]" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={pax.dob ? new Date(pax.dob) : undefined}
                                      onSelect={(date) => {
                                        updatePax(idx, "dob", date ? format(date, "yyyy-MM-dd") : "");
                                        if (date) setDobOpenIdx(null);
                                      }}
                                      disabled={(date) => date > dobRange.maxDate || date < dobRange.minDate}
                                      captionLayout="dropdown"
                                      fromYear={dobRange.fromYear}
                                      toYear={dobRange.toYear}
                                      defaultMonth={dobRange.maxDate}
                                      initialFocus
                                      className="p-3 pointer-events-auto"
                                    />
                                  </PopoverContent>
                                </Popover>
                                <p className="text-[10px] text-muted-foreground mt-1">{ageHint}</p>
                              </div>
                            );
                          })()}
                          <div>
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nationality *</Label>
                            <div className="mt-1.5">
                              <CountryPicker value={pax.nationality} onChange={(v) => updatePax(idx, "nationality", v)} placeholder="Select nationality" />
                            </div>
                          </div>
                        </div>

                        {paxType === "Adult" && (
                          <div className="sm:w-1/2">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frequent Flyer No. (Optional)</Label>
                            <Input value={pax.frequentFlyer} onChange={(e) => updatePax(idx, "frequentFlyer", e.target.value)} className="mt-1.5" />
                          </div>
                        )}

                        <div className="border-t border-border pt-4 mt-2">
                          <div className="flex items-center gap-2 mb-3">
                            <Shield className="w-4 h-4 text-primary" />
                            <h4 className="font-semibold text-sm">Passport Information</h4>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">Must be valid for 6 months from date of entry</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Country *</Label>
                              <div className="mt-1.5">
                                <CountryPicker value={pax.passportCountry} onChange={(v) => updatePax(idx, "passportCountry", v)} placeholder="Select country" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Number *</Label>
                              <Input value={pax.passportNumber} onChange={(e) => updatePax(idx, "passportNumber", e.target.value)} required className="mt-1.5" />
                            </div>
                          </div>
                          <div className="sm:w-1/2 mt-4">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passport Expiry Date *</Label>
                            <Popover open={ppExpiryOpenIdx === idx} onOpenChange={(o) => setPpExpiryOpenIdx(o ? idx : null)}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full mt-1.5 justify-start text-left font-normal h-10",
                                    !pax.passportExpiry && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                                  {pax.passportExpiry ? format(new Date(pax.passportExpiry), "dd MMM yyyy") : "Select date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                                <Calendar
                                  mode="single"
                                  selected={pax.passportExpiry ? new Date(pax.passportExpiry) : undefined}
                                  onSelect={(date) => {
                                    updatePax(idx, "passportExpiry", date ? format(date, "yyyy-MM-dd") : "");
                                    if (date) setPpExpiryOpenIdx(null);
                                  }}
                                  disabled={(date) => date < new Date()}
                                  captionLayout="dropdown"
                                  fromYear={new Date().getFullYear()}
                                  toYear={new Date().getFullYear() + 15}
                                  initialFocus
                                  className="p-3 pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Save passenger button at bottom of form */}
                        {pax.firstName && pax.lastName && (
                          <div className="border-t border-border pt-3 mt-2" onClick={(e) => e.stopPropagation()}>
                            <SavedPassengerPicker
                              paxIndex={idx}
                              currentPax={pax}
                              onSelect={(sp) => setPassengers(prev => prev.map((p, i) => i === idx ? sp : p))}
                              userId={user?.id}
                              showSaveButton
                            />
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                </motion.div>
              );
            })}

            {/* Ancillary Add-ons (Seats, Baggage, Meals) */}
            <AncillarySection
              bookingId={(flight as any)?.tripjackBookingId || null}
              flightSource={flightSource || ""}
              segments={flight.segments}
              adults={adultCount}
              children={childCount}
              infants={infantCount}
              passengerCount={totalPax}
              passengerLabels={passengers.map((p, i) => {
                const { type, num } = getPaxLabel(i);
                return { type, num, name: p.firstName ? `${p.firstName} ${p.lastName}` : "" };
              })}
              selections={ssrSelections}
              onSelectionsChange={setSsrSelections}
              formatAmount={(amt) => fmtDisp(Math.round(amt))}
              reviewSsrData={reviewSsrData}
              displayCurrency={displayCurrency}
            />

            {/* Contact Details */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Plane className="w-3.5 h-3.5 text-primary" />
                  </div>
                  Contact Details
                </h3>
                <p className="text-xs text-muted-foreground mt-1">We'll send your booking confirmation here</p>
              </div>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email Address *</Label>
                    <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required className="mt-1.5" placeholder="you@example.com" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone Number *</Label>
                    <div className="mt-1.5">
                      <PhoneInput
                        value={contactPhone}
                        onChange={setContactPhone}
                        defaultCountryCode={detectedCountry?.code || "BD"}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GST Information — Optional, shown only for Indian nationals on Tripjack flights */}
            {isTripjackFlight && hasIndianNational && (
              <Card>
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      GST Information
                    </h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-muted-foreground">Add GST</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={gstEnabled}
                        onClick={() => setGstEnabled(!gstEnabled)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                          gstEnabled ? "bg-primary" : "bg-muted"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
                          gstEnabled ? "translate-x-4" : "translate-x-0"
                        )} />
                      </button>
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Optional — for Indian GST invoice (corporate or personal)</p>
                </div>
                {gstEnabled && (
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GST Number</Label>
                        <Input value={gstNumber} onChange={(e) => setGstNumber(e.target.value.toUpperCase())} className="mt-1.5" placeholder="e.g. 22AAAAA0000A1Z5" maxLength={15} />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company / Individual Name</Label>
                        <Input value={gstCompanyName} onChange={(e) => setGstCompanyName(e.target.value)} className="mt-1.5" placeholder="Registered name" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company Address</Label>
                      <Input value={gstCompanyAddress} onChange={(e) => setGstCompanyAddress(e.target.value)} className="mt-1.5" placeholder="Registered address" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Email</Label>
                        <Input type="email" value={gstCompanyEmail} onChange={(e) => setGstCompanyEmail(e.target.value)} className="mt-1.5" placeholder="gst@company.com" />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Phone</Label>
                        <Input value={gstCompanyPhone} onChange={(e) => setGstCompanyPhone(e.target.value)} className="mt-1.5" placeholder="Phone number" />
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {/* Payment Method */}
            {requestToBookOnly ? (
              <Card>
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5 text-primary" />
                    </div>
                    Payment
                  </h3>
                </div>
                <CardContent className="pt-4">
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm text-muted-foreground">Payment is not available online for this booking.</p>
                    <p className="text-xs text-muted-foreground">Your request will be submitted and our team will contact you for payment arrangements.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <CreditCard className="w-3.5 h-3.5 text-primary" />
                    </div>
                    Payment Method
                  </h3>
                </div>
                <CardContent className="pt-4 space-y-3">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon;
                    return (
                      <label
                        key={method.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          selectedPayment === method.id
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <input type="radio" name="payment" value={method.id} checked={selectedPayment === method.id} onChange={() => setSelectedPayment(method.id)} className="sr-only" />
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          selectedPayment === method.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{method.label}</p>
                          <p className="text-xs text-muted-foreground">{method.description}</p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPayment === method.id ? "border-primary" : "border-muted-foreground/30"
                        }`}>
                          {selectedPayment === method.id && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                      </label>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            <Button type="submit" size="lg" className="w-full text-base gap-2" disabled={loading || verifying || timerExpired}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                : verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying Fare...</>
                : timerExpired ? <><AlertTriangle className="w-4 h-4" /> Session Expired</>
                : requestToBookOnly ? <><Shield className="w-4 h-4" /> Request to Book</>
                : isInstantPurchase ? <><Zap className="w-4 h-4" /> Confirm & Pay {fmtDisp(dispTotal)}</>
                : isHoldEligible ? <><Shield className="w-4 h-4" /> Book Now {fmtDisp(dispTotal)}</>
                : <><Shield className="w-4 h-4" /> Confirm & Pay {fmtDisp(dispTotal)}</>
              }
            </Button>
            <p className="text-xs text-center text-muted-foreground pb-2">
              By making payment I agree to {branding.site_name}'s{" "}
              <Link to="/privacy-policy" className="text-primary hover:underline font-medium">Privacy Policy</Link>,{" "}
              <Link to="/refund-policy" className="text-primary hover:underline font-medium">Refund Policy</Link> and{" "}
              <Link to="/return-policy" className="text-primary hover:underline font-medium">Return Policy</Link>.
            </p>
          </form>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 overflow-hidden shadow-lg border-0">
              <div className="bg-primary/5 p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-card flex items-center justify-center border border-border overflow-hidden">
                    <img src={`https://pics.avs.io/64/64/${flight.airline}.png`} alt={airlineName} className="w-7 h-7 object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const parent = e.currentTarget.parentElement;
                        if (parent) parent.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>';
                      }}
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{airlineName}</p>
                    <p className="text-xs text-muted-foreground">{getClassDisplay(flight)}</p>
                  </div>
                </div>
              </div>

              <CardContent className="p-4 space-y-4">
                {fmtDate(flight.departure) && (
                  <p className="text-xs font-medium text-center text-muted-foreground bg-muted rounded-md py-1.5">
                    {fmtDate(flight.departure)}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <div className="text-center flex-1">
                    <p className="text-xl font-bold">{fmtTime(flight.departure)}</p>
                    <p className="text-sm font-semibold text-primary">{flight.from_city}</p>
                  </div>
                  <div className="flex flex-col items-center flex-1">
                    <p className="text-[10px] text-muted-foreground mb-1">{flight.duration}</p>
                    <div className="w-full flex items-center">
                      <div className="h-px flex-1 bg-primary/30" />
                      <Plane className="w-4 h-4 text-primary mx-1 rotate-90 shrink-0" />
                      <div className="h-px flex-1 bg-primary/30" />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{flight.stops === 0 ? "Non-stop" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`}</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-xl font-bold">{fmtTime(flight.arrival)}</p>
                    <p className="text-sm font-semibold text-primary">{flight.to_city}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-3 space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fare Breakdown</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Adult × {adultCount}</span>
                    <span className="font-medium">{fmtDisp(dispAdultTotal)}</span>
                  </div>
                  {adultCount > 1 && (
                    <p className="text-xs text-muted-foreground pl-2">({formatPrice(basePrice, flightSource)} per adult)</p>
                  )}
                  {childCount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Child × {childCount}</span>
                        <span className="font-medium">{fmtDisp(dispChildTotal)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-2">({formatPrice(childPrice, flightSource)} per child)</p>
                    </>
                  )}
                  {infantCount > 0 && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Infant × {infantCount}</span>
                        <span className="font-medium">{fmtDisp(dispInfantTotal)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-2">({formatPrice(infantPrice, flightSource)} per infant)</p>
                    </>
                  )}
                  {ssrCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Add-ons</span>
                      <span className="font-medium">{fmtDisp(dispSsrCost)}</span>
                    </div>
                  )}
                  {convenienceFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Convenience Fee</span>
                      <span className="font-medium">{fmtDisp(dispConvenienceFee)}</span>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="bg-primary rounded-xl p-4 -mx-0.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-primary-foreground/70 text-xs font-medium">You Pay</p>
                      <p className="text-2xl font-extrabold text-primary-foreground tracking-tight">{fmtDisp(dispTotal)}</p>
                    </div>
                    <div className="bg-primary-foreground/15 rounded-lg px-3 py-1.5">
                      <p className="text-primary-foreground text-xs font-semibold">{totalPax} Traveler{totalPax > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      </div>

      {/* Booking Progress Modal */}
      <BookingProgressModal
        status={bookingModalStatus}
        pnr={bookingModalPnr}
        errorMessage={bookingModalError}
        onClose={() => { setBookingModalStatus(null); setLoading(false); }}
      />
      <FareVerificationDialog
        state={fareVerification}
        onClose={() => { setFareVerification(null); setLoading(false); }}
      />
    </Layout>
  );
};

export default FlightBooking;
