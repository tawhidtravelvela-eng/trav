import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Plane, Clock, ArrowRight, Filter, SlidersHorizontal, Loader2, Wifi, Search, CalendarDays, Users, ArrowLeftRight, ChevronDown, Minus, Plus, ChevronUp, X, ChevronLeft, ChevronRight, Check, PlusCircle, Luggage, Briefcase, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";
import AirportPicker, { type Airport, airports, findAirportByCode } from "@/components/home/AirportPicker";
import FlightDetailsPanel from "@/components/flights/FlightDetailsPanel";
import FareVerificationDialog, { type FareVerificationState } from "@/components/flights/FareVerificationDialog";
import FlightSearchLoader from "@/components/flights/FlightSearchLoader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTenant } from "@/hooks/useTenant";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type TripType = "one-way" | "round-trip" | "multi-city";

interface MultiCityLeg {
  from: Airport | null;
  to: Airport | null;
  date?: Date;
}

// Format time from ISO string or simple time string
function formatFlightTime(timeStr: string): string {
  if (!timeStr) return "--:--";
  // If it's an ISO datetime string, parse it
  if (timeStr.includes("T")) {
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch { return timeStr; }
  }
  return timeStr;
}

// Format date from ISO string for display under time
function formatFlightDate(timeStr: string): string | null {
  if (!timeStr || !timeStr.includes("T")) return null;
  try {
    const d = new Date(timeStr);
    return format(d, "dd MMM");
  } catch { return null; }
}

import { AIRLINE_NAMES, getAirlineName } from "@/data/airlines";

function getOperatingCarrierText(flight: { airline: string; segments?: FlightSegment[] }): string | null {
  if (!flight.segments?.length) return null;
  // Collect unique operating carriers that differ from the marketing airline
  const ops = new Set<string>();
  for (const seg of flight.segments) {
    // Check explicit operatingCarrier field
    const op = seg.operatingCarrier;
    if (op && op !== flight.airline && op !== seg.carrier) {
      ops.add(op);
    }
    // Also detect when segment carrier differs from the flight's main airline (multi-carrier itinerary)
    if (seg.carrier && seg.carrier !== flight.airline) {
      ops.add(seg.carrier);
    }
  }
  if (ops.size === 0) return null;
  return "Operated by " + Array.from(ops).map(c => getAirlineName(c)).join(", ");
}

interface LayoverInfo {
  city: string;
  duration: string;
}

function getLayovers(segments?: FlightSegment[]): LayoverInfo[] {
  if (!segments || segments.length <= 1) return [];
  const layovers: LayoverInfo[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] as any;
    const arrTime = seg.arrival;
    const depTime = (segments[i + 1] as any).departure;
    // Resolve layover city: prefer explicit city name, then resolve IATA code to city
    const rawCode = seg.destination || seg.to || "";
    const cityFromName = seg.toCity || seg.destinationCity || "";
    let city = cityFromName;
    if (!city && rawCode) {
      const airport = findAirport(rawCode);
      city = airport?.city || rawCode;
    }
    if (!city) city = "???";
    let duration = "";
    if (arrTime && depTime) {
      const arr = arrTime.includes("T") ? new Date(arrTime).getTime() : null;
      const dep = depTime.includes("T") ? new Date(depTime).getTime() : null;
      if (arr && dep && dep > arr) {
        const mins = Math.round((dep - arr) / 60000);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
    }
    layovers.push({ city, duration });
  }
  return layovers;
}

function findAirport(code: string): Airport | null {
  return airports.find((a) => a.code === code) || null;
}

async function findAirportAsync(code: string): Promise<Airport | null> {
  const staticMatch = airports.find((a) => a.code === code);
  if (staticMatch) return staticMatch;
  return findAirportByCode(code);
}

interface FlightSegment {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  carrier?: string;
  flightNumber?: string;
  operatingCarrier?: string;
  operatingFlightNumber?: string;
  bookingCode?: string;
}

function getClassDisplay(flight: { class: string; segments?: FlightSegment[]; classOfBooking?: string }): string {
  const bookingCode = flight.segments?.[0]?.bookingCode || flight.classOfBooking;
  return bookingCode ? `${flight.class} (${bookingCode})` : flight.class;
}

interface Flight {
  id: string;
  airline: string;
  from_city: string;
  to_city: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  stops: number;
  class: string;
  source?: "database" | "travelport" | "amadeus" | "travelvela" | "tripjack";
  flightNumber?: string;
  currency?: string;
  isRefundable?: boolean;
  changePenalties?: any;
  cancelPenalties?: any;
  segments?: FlightSegment[];
  baggageAllowance?: { cabin?: string; checkin?: string } | null;
  basePrice?: number;
  taxes?: number;
  paxPricing?: Record<string, { base: number; taxes: number; total: number }> | null;
}

const Flights = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"price" | "duration">("price");
  const [maxPrice, setMaxPrice] = useState(2000);
  const [searchSource, setSearchSource] = useState<"database" | "travelport" | "both">("database");
  const { currency: displayCurrency } = useCurrency();
  const fmtPrice = (v: number) => `${CURRENCIES[displayCurrency].symbol}${Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const isMobile = useIsMobile();
  const [searchExpanded, setSearchExpanded] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  
  // Stop filter: null = all, 0 = nonstop, 1 = 1 stop, 2 = 2+
  const [stopFilter, setStopFilter] = useState<number | null>(null);
  // Airline filter: set of selected airline codes (empty = all)
  const [selectedAirlines, setSelectedAirlines] = useState<Set<string>>(new Set());
  // Modify search state
  const [modTripType, setModTripType] = useState<TripType>(searchParams.get("legs") ? "multi-city" : searchParams.get("returnDate") ? "round-trip" : "one-way");
  const [modFrom, setModFrom] = useState<Airport | null>(null);
  const [modTo, setModTo] = useState<Airport | null>(null);
  const [modDate, setModDate] = useState<Date | undefined>(undefined);
  const [modReturnDate, setModReturnDate] = useState<Date | undefined>(undefined);
  const [modDatePopoverOpen, setModDatePopoverOpen] = useState(false);
  const [modAdults, setModAdults] = useState(1);
  const [modChildren, setModChildren] = useState(0);
  const [modInfants, setModInfants] = useState(0);
  const [modClass, setModClass] = useState("Economy");
  const [modRegularFare, setModRegularFare] = useState(searchParams.get("studentFare") !== "true");
  const [modStudentFare, setModStudentFare] = useState(searchParams.get("studentFare") === "true");
  const [modDirectFlight, setModDirectFlight] = useState(searchParams.get("direct") === "true");
  const [modMultiCityLegs, setModMultiCityLegs] = useState<MultiCityLeg[]>([
    { from: null, to: null },
    { from: null, to: null },
  ]);

  const [complexBookingOpen, setComplexBookingOpen] = useState(false);
  const [fareVerification, setFareVerification] = useState<FareVerificationState>(null);

  const maxAdultPlusChild = 9;
  const modAdultChildTotal = modAdults + modChildren;

  const handleSetModAdults = (v: number) => {
    if (v + modChildren > maxAdultPlusChild) return;
    setModAdults(v);
    if (modInfants > v) setModInfants(v);
  };
  const handleSetModChildren = (v: number) => {
    if (modAdults + v > maxAdultPlusChild) return;
    setModChildren(v);
  };
  const handleSetModInfants = (v: number) => {
    if (v > modAdults) return;
    setModInfants(v);
  };

  const updateModMultiCityLeg = (index: number, field: keyof MultiCityLeg, value: any) => {
    setModMultiCityLegs(prev => prev.map((leg, i) => i === index ? { ...leg, [field]: value } : leg));
  };
  const addModMultiCityLeg = () => {
    if (modMultiCityLegs.length < 5) setModMultiCityLegs(prev => [...prev, { from: null, to: null }]);
  };
  const removeModMultiCityLeg = (index: number) => {
    if (modMultiCityLegs.length > 2) setModMultiCityLegs(prev => prev.filter((_, i) => i !== index));
  };

  // Sync modify search fields from URL params
  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const date = searchParams.get("date");
    const returnDate = searchParams.get("returnDate");
    const adults = searchParams.get("adults");
    const children = searchParams.get("children");
    const infants = searchParams.get("infants");
    const cabinClass = searchParams.get("class");
    const legsParam = searchParams.get("legs");

    const loadAirports = async () => {
      if (legsParam) {
        // Parse multi-city legs from URL
        const parsedLegs: MultiCityLeg[] = await Promise.all(
          legsParam.split(",").map(async (legStr) => {
            const [fromCode, toCode, dateStr] = legStr.split("_");
            const fromAirport = fromCode ? await findAirportAsync(fromCode) : null;
            const toAirport = toCode ? await findAirportAsync(toCode) : null;
            return {
              from: fromAirport,
              to: toAirport,
              date: dateStr ? new Date(dateStr + "T00:00:00") : undefined,
            };
          })
        );
        if (parsedLegs.length >= 2) setModMultiCityLegs(parsedLegs);
        setModTripType("multi-city");
      } else {
        if (from) {
          const airport = await findAirportAsync(from);
          if (airport) setModFrom(airport);
        }
        if (to) {
          const airport = await findAirportAsync(to);
          if (airport) setModTo(airport);
        }
      }
    };
    loadAirports();

    if (date) setModDate(new Date(date + "T00:00:00"));
    if (returnDate) setModReturnDate(new Date(returnDate + "T00:00:00"));
    if (adults) setModAdults(parseInt(adults));
    setModChildren(parseInt(children || "0"));
    setModInfants(parseInt(infants || "0"));
    if (cabinClass) setModClass(cabinClass);
  }, []); // Only on mount

  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const date = searchParams.get("date");
    const returnDate = searchParams.get("returnDate");
    const adults = searchParams.get("adults");
    const cabinClass = searchParams.get("class");
    const legsParam = searchParams.get("legs");
    const isMultiCity = !!legsParam;

    // Parse multi-city legs from URL
    const parsedLegs = legsParam
      ? legsParam.split(",").map(l => {
          const [f, t, d] = l.split("_");
          return { from: f, to: t, date: d };
        })
      : [];

    const hasStandardSearch = from && to && date;
    const hasMultiCitySearch = isMultiCity && parsedLegs.length >= 2 && parsedLegs.every(l => l.from && l.to);

    const fetchFlights = async () => {
      setLoading(true);

      const searchBody: any = {
        mode: "search",
        from: isMultiCity ? parsedLegs[0].from : from,
        to: isMultiCity ? parsedLegs[parsedLegs.length - 1].to : to,
        departDate: isMultiCity ? parsedLegs[0].date : date,
        returnDate: isMultiCity ? null : returnDate,
        adults: parseInt(adults || "1"),
        children: searchParams.get("studentFare") === "true" ? 0 : parseInt(searchParams.get("children") || "0"),
        infants: searchParams.get("studentFare") === "true" ? 0 : parseInt(searchParams.get("infants") || "0"),
        cabinClass: cabinClass || "Economy",
        directFlight: searchParams.get("direct") === "true",
        studentFare: searchParams.get("studentFare") === "true",
        currency: displayCurrency,
      };

      if (isMultiCity) {
        searchBody.legs = parsedLegs.map(l => ({ from: l.from, to: l.to, date: l.date }));
      }
      if (tenant?.id) {
        searchBody.tenant_id = tenant.id;
      }

      try {
        const invokePromise = supabase.functions.invoke("unified-flight-search", { body: searchBody });
        const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error("Search timeout") }), 20000)
        );

        const { data, error } = await Promise.race([
          invokePromise,
          timeoutPromise,
        ]) as { data: any; error: any };

        console.log("[FlightSearch] unified:", { success: data?.success, count: data?.count, error: error?.message });

        if (!error && data?.success && data?.flights) {
          setFlights(data.flights);

          if (data.providers && (data.providers.travelport || data.providers.amadeus || data.providers.travelvela || data.providers.tripjack)) {
            setSearchSource("both");
          }

          // Update date strip price for current date
          if (data.flights.length > 0 && date) {
            const lowest = data.flights[0]; // Already sorted by price from backend
            const paxP = lowest.paxPricing;
            const hasApi = lowest.basePrice !== undefined && lowest.taxes !== undefined;
            const aB = Math.round(hasApi ? lowest.basePrice : Number(lowest.price));
            const aT = Math.round(hasApi ? lowest.taxes : 0);
            const adultP = aB + aT;
            const adultsCnt = parseInt(adults || "1");
            const childCnt = parseInt(searchParams.get("children") || "0");
            const infantCnt = parseInt(searchParams.get("infants") || "0");
            const cB = paxP?.CHD ? Math.round(paxP.CHD.base) : (hasApi ? Math.round(aB * 0.75) : null);
            const cT = paxP?.CHD ? Math.round(paxP.CHD.taxes) : (hasApi ? Math.round(aT * 0.75) : null);
            const childP = cB != null && cT != null ? cB + cT : Math.round(adultP * 0.75);
            const iB = paxP?.INF ? Math.round(paxP.INF.base) : (hasApi ? Math.round(aB * 0.10) : null);
            const iT = paxP?.INF ? Math.round(paxP.INF.taxes) : (hasApi ? Math.round(aT * 0.10) : null);
            const infantP = iB != null && iT != null ? iB + iT : Math.round(adultP * 0.10);
            const totalPrice = adultP * adultsCnt + childP * childCnt + infantP * infantCnt;
            setDatePrices((p) => ({ ...p, [date]: { price: totalPrice, source: lowest.source } }));
          }
        } else {
          setFlights([]);
        }
      } catch (e) {
        console.error("[FlightSearch] unified error:", e);
        setFlights([]);
      }

      setLoading(false);

      // Auto-collapse search on mobile after results load
      if (window.innerWidth < 768) {
        setSearchExpanded(false);
      }
    };

    if (hasStandardSearch || hasMultiCitySearch) {
      fetchFlights();
    } else {
      setLoading(false);
    }
  }, [searchParams, displayCurrency]);

  useEffect(() => {
    const isStudent = searchParams.get("studentFare") === "true";
    setModStudentFare(isStudent);
    setModRegularFare(!isStudent);
    setModDirectFlight(searchParams.get("direct") === "true");
  }, [searchParams]);

  // Reset children/infants when student fare is toggled on
  useEffect(() => {
    if (modStudentFare) {
      setModChildren(0);
      setModInfants(0);
    }
  }, [modStudentFare]);

  const handleModifySearch = () => {
    if (modAdults + modChildren > 9 || modInfants > modAdults) {
      setComplexBookingOpen(true);
      return;
    }
    const params = new URLSearchParams();
    if (modTripType === "multi-city") {
      const legsStr = modMultiCityLegs
        .filter(l => l.from && l.to)
        .map(l => `${l.from!.code}_${l.to!.code}_${l.date ? formatLocalDate(l.date) : ""}`)
        .join(",");
      params.set("legs", legsStr);
      params.set("tripType", "multi-city");
    } else {
      if (modFrom) params.set("from", modFrom.code);
      if (modTo) params.set("to", modTo.code);
      if (modDate) params.set("date", formatLocalDate(modDate));
      if (modTripType === "round-trip" && modReturnDate) params.set("returnDate", formatLocalDate(modReturnDate));
    }
    params.set("adults", String(modAdults));
    if (!modStudentFare && modChildren > 0) params.set("children", String(modChildren));
    if (!modStudentFare && modInfants > 0) params.set("infants", String(modInfants));
    params.set("class", modClass);
    if (modDirectFlight) params.set("direct", "true");
    if (modStudentFare) params.set("studentFare", "true");
    navigate(`/flights?${params.toString()}`);
  };

  // Convert flight price to display currency for filtering
  const getDisplayPrice = useCallback((flight: Flight) => {
    return Math.round(flight.price);
  }, []);

  const priceSliderMax = Math.ceil(
    Math.max(2000, ...flights.map((f) => {
      const dp = getDisplayPrice(f);
      return Number.isFinite(dp) ? dp : 0;
    })) / 1000
  ) * 1000;

  // Reset filters when flights change
  useEffect(() => {
    setStopFilter(null);
    setSelectedAirlines(new Set());
    const newMax = Math.ceil(
      Math.max(2000, ...flights.map((f) => {
        const dp = getDisplayPrice(f);
        return Number.isFinite(dp) ? dp : 0;
      })) / 1000
    ) * 1000;
    setMaxPrice(newMax);
  }, [flights, getDisplayPrice]);

  // Compute airline options with lowest fares (in display currency)
  const airlineOptions = (() => {
    const map = new Map<string, { rawPrice: number; displayPrice: number; source?: string }>();
    for (const f of flights) {
      const dp = getDisplayPrice(f);
      const existing = map.get(f.airline);
      if (!existing || dp < existing.displayPrice) {
        map.set(f.airline, { rawPrice: f.price, displayPrice: dp, source: f.source });
      }
    }
    return Array.from(map.entries())
      .map(([code, info]) => ({ code, name: getAirlineName(code), lowestPrice: info.displayPrice, source: info.source }))
      .sort((a, b) => a.lowestPrice - b.lowestPrice);
  })();

  // Compute stop options with counts
  const stopOptions = (() => {
    const counts = { 0: 0, 1: 0, 2: 0 };
    for (const f of flights) {
      const stops = f.segments ? Math.max(0, f.segments.length - 1) : f.stops;
      if (stops === 0) counts[0]++;
      else if (stops === 1) counts[1]++;
      else counts[2]++;
    }
    return counts;
  })();

  const toggleAirline = (code: string) => {
    setSelectedAirlines(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const filtered = flights
    .filter((f) => getDisplayPrice(f) <= maxPrice)
    .filter((f) => {
      if (stopFilter === null) return true;
      const stops = f.segments ? Math.max(0, f.segments.length - 1) : f.stops;
      if (stopFilter === 2) return stops >= 2;
      return stops === stopFilter;
    })
    .filter((f) => selectedAirlines.size === 0 || selectedAirlines.has(f.airline))
    .sort((a, b) => (sortBy === "price" ? getDisplayPrice(a) - getDisplayPrice(b) : a.duration.localeCompare(b.duration)));

  // Group flights with same airline + price + class + stops into expandable cards
  interface FlightGroup {
    key: string;
    primary: Flight;
    alternatives: Flight[];
  }

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const parseDurationToMinutes = (dur: string): number => {
    const hMatch = dur.match(/(\d+)\s*h/i);
    const mMatch = dur.match(/(\d+)\s*m/i);
    return (hMatch ? parseInt(hMatch[1]) * 60 : 0) + (mMatch ? parseInt(mMatch[1]) : 0);
  };

  const groupedFlights = useMemo((): FlightGroup[] => {
    const groups = new Map<string, Flight[]>();
    for (const f of filtered) {
      const actualStops = f.segments ? Math.max(0, f.segments.length - 1) : f.stops;
      const groupKey = `${f.airline}-${Math.round(f.price)}-${f.class}-${actualStops}-${f.source || ""}`;
      const existing = groups.get(groupKey);
      if (existing) existing.push(f);
      else groups.set(groupKey, [f]);
    }
    return Array.from(groups.entries()).map(([key, flights]) => {
      // Sort by shortest duration first so primary card shows the quickest option
      const sorted = [...flights].sort((a, b) => parseDurationToMinutes(a.duration) - parseDurationToMinutes(b.duration));
      return {
        key,
        primary: sorted[0],
        alternatives: sorted.slice(1),
      };
    });
  }, [filtered]);

  // Reset expanded groups when search changes
  useEffect(() => { setExpandedGroups(new Set()); }, [flights]);

  const toggleGroupExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const hasSearchParams = searchParams.get("from") || searchParams.get("to") || searchParams.get("legs");

  // Date navigation helpers
  const navigateToDate = (offset: number) => {
    const currentDate = searchParams.get("date");
    if (!currentDate) return;
    const d = new Date(currentDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", formatLocalDate(d));
    navigate(`/flights?${params.toString()}`);
  };

  const currentDateStr = searchParams.get("date");
  const currentDateObj = currentDateStr ? new Date(currentDateStr + "T00:00:00") : null;
  const canGoPrev = currentDateObj ? currentDateObj > new Date() : false;

  // Multi-date strip: 2 before + current + 2 after = 5 dates
  const DATE_BEFORE = 2;
  const DATE_AFTER = 2;
  const [datePrices, setDatePrices] = useState<Record<string, { price: number; source?: string } | null | "loading">>({});

  const dateStrip = useMemo(() => {
    if (!currentDateObj) return [];
    const dates: string[] = [];
    for (let i = -DATE_BEFORE; i <= DATE_AFTER; i++) {
      const d = new Date(currentDateObj);
      d.setDate(d.getDate() + i);
      dates.push(formatLocalDate(d));
    }
    return dates;
  }, [currentDateObj]);

  // Set current date price from main results (only once when loading completes)
  const adultsCnt = parseInt(searchParams.get("adults") || "1");
  const childCnt = parseInt(searchParams.get("children") || "0");
  const infantCnt = parseInt(searchParams.get("infants") || "0");

  const computeRawTotalFare = useCallback((flight: any) => {
    const paxP = flight.paxPricing;
    const hasApi = flight.basePrice !== undefined && flight.taxes !== undefined;
    const aBase = Math.round(hasApi ? flight.basePrice : Number(flight.price));
    const aTax = Math.round(hasApi ? flight.taxes : 0);
    const adultPrice = aBase + aTax;
    const cBase = paxP?.CHD ? Math.round(paxP.CHD.base) : (hasApi ? Math.round(aBase * 0.75) : null);
    const cTax = paxP?.CHD ? Math.round(paxP.CHD.taxes) : (hasApi ? Math.round(aTax * 0.75) : null);
    const childPrice = cBase != null && cTax != null ? cBase + cTax : Math.round(adultPrice * 0.75);
    const iBase = paxP?.INF ? Math.round(paxP.INF.base) : (hasApi ? Math.round(aBase * 0.10) : null);
    const iTax = paxP?.INF ? Math.round(paxP.INF.taxes) : (hasApi ? Math.round(aTax * 0.10) : null);
    const infantPrice = iBase != null && iTax != null ? iBase + iTax : Math.round(adultPrice * 0.10);
    return adultPrice * adultsCnt + childPrice * childCnt + infantPrice * infantCnt;
  }, [adultsCnt, childCnt, infantCnt]);

  const currentDatePriceRef = useRef<{ price: number; source?: string } | null>(null);
  const [currentDatePrice, setCurrentDatePrice] = useState<{ price: number; source?: string } | null>(null);
  useEffect(() => {
    if (!loading && flights.length > 0) {
      const lowest = flights.reduce((min, f) => f.price < min.price ? f : min, flights[0]);
      const newPrice = { price: computeRawTotalFare(lowest), source: lowest.source };
      // Only update if value actually changed to prevent infinite loops
      if (currentDatePriceRef.current?.price !== newPrice.price || currentDatePriceRef.current?.source !== newPrice.source) {
        currentDatePriceRef.current = newPrice;
        setCurrentDatePrice(newPrice);
      }
    } else if (!loading && flights.length === 0 && currentDatePriceRef.current !== null) {
      currentDatePriceRef.current = null;
      setCurrentDatePrice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, flights.length, computeRawTotalFare]);

  // Fetch adjacent date prices via unified API
  const fetchedDateRef = useRef<string | null>(null);

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const returnDateParam = searchParams.get("returnDate") || null;
  const classParam = searchParams.get("class") || "Economy";
  const directParam = searchParams.get("direct") === "true";
  const studentFareParam = searchParams.get("studentFare") === "true";

  useEffect(() => {
    if (!currentDateStr || dateStrip.length === 0 || loading) return;
    if (fetchedDateRef.current === currentDateStr) {
      setDatePrices((p) => ({ ...p, [currentDateStr]: currentDatePriceRef.current }));
      return;
    }
    fetchedDateRef.current = currentDateStr;

    if (!fromParam || !toParam) return;

    const adjacentDates = dateStrip.filter(d => d !== currentDateStr);

    // Set current date price + mark others as loading
    const initial: Record<string, { price: number; source?: string } | null | "loading"> = {};
    for (const d of dateStrip) {
      initial[d] = d === currentDateStr ? currentDatePriceRef.current : "loading";
    }
    setDatePrices(initial);

    if (adjacentDates.length === 0) return;

    const fetchDatePrices = async () => {
      try {
        const invokePromise = supabase.functions.invoke("unified-flight-search", {
          body: {
            mode: "date-prices",
            from: fromParam,
            to: toParam,
            departDate: currentDateStr,
            returnDate: returnDateParam,
            adults: adultsCnt,
            children: childCnt,
            infants: infantCnt,
            cabinClass: classParam,
            directFlight: directParam,
            studentFare: studentFareParam,
            dates: adjacentDates,
            currency: displayCurrency,
            ...(tenant?.id ? { tenant_id: tenant.id } : {}),
          },
        });

        const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error("Date prices timeout") }), 20000)
        );

        const { data, error } = await Promise.race([
          invokePromise,
          timeoutPromise,
        ]) as { data: any; error: any };

        if (!error && data?.success && data?.datePrices) {
          for (const [dateStr, priceData] of Object.entries(data.datePrices)) {
            setDatePrices((p) => ({ ...p, [dateStr]: priceData as any }));
          }
        } else {
          // Mark all as null on error
          for (const d of adjacentDates) {
            setDatePrices((p) => ({ ...p, [d]: null }));
          }
        }
      } catch {
        for (const d of adjacentDates) {
          setDatePrices((p) => ({ ...p, [d]: null }));
        }
      }
    };

    fetchDatePrices();
  }, [currentDateStr, dateStrip, loading, fromParam, toParam, returnDateParam, adultsCnt, childCnt, infantCnt, classParam, directParam, studentFareParam, displayCurrency, tenant?.id]);

  const navigateToDateStr = (dateStr: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", dateStr);
    navigate(`/flights?${params.toString()}`);
  };

  return (
    <>
    <Layout>
      <div className="bg-hero-gradient py-10 pb-24">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-primary-foreground mb-1">Find Flights</h1>
          <p className="text-primary-foreground/70 text-sm">Search and compare the best flight deals</p>
        </div>
      </div>

      {/* Search Card */}
      <div className="container mx-auto px-4 -mt-16 relative z-10 mb-6">
        <div className="bg-[hsl(40,30%,96%)] rounded-2xl border border-border shadow-xl overflow-hidden">
          {/* Mobile collapsed summary bar */}
          {isMobile && !searchExpanded && (
            <button
              onClick={() => setSearchExpanded(true)}
              className="w-full flex items-center justify-between p-4 gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Plane className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {modTripType === "multi-city"
                      ? modMultiCityLegs.filter(l => l.from).map(l => l.from?.city).join(" → ") || "Multi-city"
                      : `${modFrom?.city || "—"} → ${modTo?.city || "—"}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {modTripType === "multi-city"
                      ? `${modMultiCityLegs.length} flights`
                      : `${modDate ? format(modDate, "MMM dd") : "—"}${modReturnDate ? ` — ${format(modReturnDate, "MMM dd")}` : ""}`} · {modAdults + modChildren + modInfants} traveler{(modAdults + modChildren + modInfants) > 1 ? "s" : ""} · {modClass}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-primary flex items-center gap-1 flex-shrink-0">
                Modify <ChevronDown className="w-3 h-3" />
              </span>
            </button>
          )}

          {/* Full search form */}
          <AnimatePresence initial={false}>
            {(searchExpanded || !isMobile) && (
              <motion.div
                initial={isMobile ? { height: 0, opacity: 0 } : false}
                animate={{ height: "auto", opacity: 1 }}
                exit={isMobile ? { height: 0, opacity: 0 } : undefined}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="p-3 sm:p-4 md:p-6">
                  {/* Mobile close button */}
                  {isMobile && (
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-semibold text-foreground">Modify Search</span>
                      <button onClick={() => setSearchExpanded(false)} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  )}
            {/* Trip type row */}
            <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5 flex-wrap">
              {(["one-way", "round-trip", "multi-city"] as TripType[]).map((type) => (
                <button key={type} type="button" onClick={() => { setModTripType(type); if (type === "one-way") setModReturnDate(undefined); }} className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group bg-transparent border-none p-0">
                  <div className={cn(
                    "w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                    modTripType === type ? "border-primary bg-primary/5 scale-110" : "border-muted-foreground/30 group-hover:border-muted-foreground"
                  )}>
                    {modTripType === type && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary" />}
                  </div>
                  <span className={cn(
                    "text-[11px] sm:text-sm font-semibold transition-colors",
                    modTripType === type ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {type === "one-way" ? "One Way" : type === "round-trip" ? "Round Trip" : "Multi-city"}
                  </span>
                </button>
              ))}

              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto border border-border/50 bg-muted/30">
                    {modClass}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-1.5" align="end">
                  {["Economy", "Premium Economy", "Business", "First Class"].map((cls) => (
                    <button
                      key={cls}
                      onClick={() => setModClass(cls)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                        modClass === cls ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"
                      )}
                    >
                      {cls}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* One-way / Round-trip fields */}
            {modTripType !== "multi-city" && (
              <>
                <div className="relative hidden sm:flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Flying from</label>
                    <div className="bg-card rounded-xl border border-border px-3 py-3 hover:border-primary/40 hover:shadow-sm transition-all">
                      <AirportPicker label="" placeholder="Where from?" selected={modFrom} onSelect={setModFrom} excludeCode={modTo?.code} />
                    </div>
                  </div>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10" style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => { const t = modFrom; setModFrom(modTo); setModTo(t); }}
                      className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:shadow-lg hover:scale-110 transition-all duration-200 border-[3px] border-[hsl(40,30%,96%)]"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Flying to</label>
                    <div className="bg-card rounded-xl border border-border px-3 py-3 hover:border-primary/40 hover:shadow-sm transition-all">
                      <AirportPicker label="" placeholder="Where to?" selected={modTo} onSelect={setModTo} excludeCode={modFrom?.code} />
                    </div>
                  </div>
                </div>

                <div className="sm:hidden mb-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Flying from & to</label>
                  <div className="relative bg-card rounded-xl border border-border overflow-hidden">
                    <div className="px-3 py-2">
                      <AirportPicker label="" placeholder="Where from?" selected={modFrom} onSelect={setModFrom} excludeCode={modTo?.code} />
                    </div>
                    <div className="relative">
                      <div className="border-t border-dashed border-border" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10">
                        <button
                          onClick={() => { const t = modFrom; setModFrom(modTo); setModTo(t); }}
                          className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                        >
                          <ArrowLeftRight className="w-3 h-3 rotate-90" />
                        </button>
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <AirportPicker label="" placeholder="Where to?" selected={modTo} onSelect={setModTo} excludeCode={modFrom?.code} />
                    </div>
                  </div>
                </div>

                <div className={cn("grid grid-cols-2 gap-2 sm:gap-3", modTripType === "round-trip" ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Departing</label>
                    <Popover open={modDatePopoverOpen} onOpenChange={setModDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 hover:shadow-sm transition-all w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className={cn("text-xs sm:text-sm font-semibold truncate", modDate ? "text-foreground" : "text-muted-foreground")}>
                            {modDate ? format(modDate, "dd/MM/yyyy") : "Select date"}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={modDate} onSelect={(d) => { setModDate(d); setModDatePopoverOpen(false); }} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {modTripType === "round-trip" && (
                    <div>
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Returning</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-2 bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 hover:shadow-sm transition-all w-full text-left">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                            </div>
                            <span className={cn("text-xs sm:text-sm font-semibold truncate", modReturnDate ? "text-foreground" : "text-muted-foreground")}>
                              {modReturnDate ? format(modReturnDate, "dd/MM/yyyy") : "Select date"}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={modReturnDate} onSelect={(d) => { setModReturnDate(d ?? undefined); }} disabled={(date) => date < (modDate || new Date())} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Traveler</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 hover:shadow-sm transition-all w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap truncate">
                            {modAdults + modChildren + modInfants} Traveler{(modAdults + modChildren + modInfants) > 1 ? "s" : ""}
                          </span>
                          <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-4" align="start">
                        <div className="space-y-4">
                          <TravelerCounter label="Adults" subtitle="Age 12+" value={modAdults} onChange={handleSetModAdults} min={1} max={maxAdultPlusChild - modChildren} />
                          <TravelerCounter label="Children" subtitle="Age 2–11" value={modChildren} onChange={handleSetModChildren} min={0} max={maxAdultPlusChild - modAdults} disabled={modStudentFare} />
                          <TravelerCounter label="Infants" subtitle="Under 2" value={modInfants} onChange={handleSetModInfants} min={0} max={modAdults} disabled={modStudentFare} />
                          <p className={cn("text-[10px] text-muted-foreground text-center transition-opacity", modAdultChildTotal >= 7 ? "opacity-100" : "opacity-0")}>Max 9 passengers (adults + children)</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="col-span-2 sm:col-span-1 flex items-end">
                    <Button
                      onClick={() => { handleModifySearch(); if (isMobile) setSearchExpanded(false); }}
                      className="h-10 sm:h-12 w-full rounded-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all"
                    >
                      Search Now
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Multi-city fields */}
            {modTripType === "multi-city" && (
              <>
                <div className="space-y-2 mb-3">
                  {modMultiCityLegs.map((leg, idx) => (
                    <div key={idx}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Flight {idx + 1}</span>
                        {modMultiCityLegs.length > 2 && (
                          <button onClick={() => removeModMultiCityLeg(idx)} className="ml-auto text-muted-foreground hover:text-destructive transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 transition-all">
                          <AirportPicker label="" placeholder="From?" selected={leg.from} onSelect={(a) => updateModMultiCityLeg(idx, 'from', a)} excludeCode={leg.to?.code} />
                        </div>
                        <div className="bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 transition-all">
                          <AirportPicker label="" placeholder="To?" selected={leg.to} onSelect={(a) => updateModMultiCityLeg(idx, 'to', a)} excludeCode={leg.from?.code} />
                        </div>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 transition-all w-full text-left">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                              </div>
                              <span className={cn("text-xs sm:text-sm font-semibold truncate", leg.date ? "text-foreground" : "text-muted-foreground")}>
                                {leg.date ? format(leg.date, "dd/MM/yyyy") : "Date"}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={leg.date} onSelect={(d) => updateModMultiCityLeg(idx, 'date', d)} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  ))}
                  {modMultiCityLegs.length < 5 && (
                    <button onClick={addModMultiCityLeg} className="flex items-center gap-1.5 text-primary text-xs font-bold hover:text-primary/80 transition-colors mt-1">
                      <PlusCircle className="w-3.5 h-3.5" />
                      Add another city
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Traveler</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 bg-card rounded-xl border border-border px-3 py-2.5 hover:border-primary/40 hover:shadow-sm transition-all w-full text-left">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap truncate">
                            {modAdults + modChildren + modInfants} Traveler{(modAdults + modChildren + modInfants) > 1 ? "s" : ""}
                          </span>
                          <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto flex-shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-4" align="start">
                        <div className="space-y-4">
                          <TravelerCounter label="Adults" subtitle="Age 12+" value={modAdults} onChange={handleSetModAdults} min={1} max={maxAdultPlusChild - modChildren} />
                          <TravelerCounter label="Children" subtitle="Age 2–11" value={modChildren} onChange={handleSetModChildren} min={0} max={maxAdultPlusChild - modAdults} disabled={modStudentFare} />
                          <TravelerCounter label="Infants" subtitle="Under 2" value={modInfants} onChange={handleSetModInfants} min={0} max={modAdults} disabled={modStudentFare} />
                          <p className={cn("text-[10px] text-muted-foreground text-center transition-opacity", modAdultChildTotal >= 7 ? "opacity-100" : "opacity-0")}>Max 9 passengers (adults + children)</p>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="sm:col-span-2 flex items-end">
                    <Button
                      onClick={() => { handleModifySearch(); if (isMobile) setSearchExpanded(false); }}
                      className="h-10 sm:h-12 w-full rounded-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-sm sm:text-base shadow-lg hover:shadow-xl transition-all"
                    >
                      Search Now
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Fare options — switch-style toggles */}
            <div className="flex flex-wrap items-center gap-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border/40">
              <div className="flex items-center gap-1 bg-muted/40 rounded-xl border border-border/60 p-1">
                {([
                  { label: "Regular", active: modRegularFare, onClick: () => { setModRegularFare(true); setModStudentFare(false); } },
                  { label: "Student", active: modStudentFare, onClick: () => { setModStudentFare(true); setModRegularFare(false); } },
                ] as const).map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={opt.onClick}
                    className={cn(
                      "relative px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all duration-300",
                      opt.active
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setModDirectFlight(!modDirectFlight)}
                className="flex items-center gap-2 group"
              >
                <div className={cn(
                  "w-9 h-5 rounded-full transition-all duration-300 relative",
                  modDirectFlight ? "bg-primary shadow-sm shadow-primary/30" : "bg-muted-foreground/20"
                )}>
                  <div className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-card shadow-sm transition-all duration-300",
                    modDirectFlight ? "left-[18px]" : "left-0.5"
                  )} />
                </div>
                <span className={cn(
                  "text-[11px] sm:text-xs font-bold transition-colors",
                  modDirectFlight ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  Direct Only
                </span>
              </button>
            </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Date strip navigation */}
      {currentDateObj && !loading && dateStrip.length > 0 && (
        <div className="container mx-auto px-4 mb-5">
          <div className="flex items-stretch gap-0 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            {/* Prev arrow */}
            <button
              onClick={() => navigateToDate(-1)}
              disabled={!canGoPrev}
              className="shrink-0 w-10 flex items-center justify-center border-r border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Date cells */}
            <div className="flex-1 grid grid-cols-5 overflow-hidden">
              {dateStrip.map((dateStr, idx) => {
                const isActive = dateStr === currentDateStr;
                const d = new Date(dateStr + "T00:00:00");
                const priceEntry = datePrices[dateStr];
                const allPriceEntries = Object.values(datePrices).filter((p): p is { price: number; source?: string } => typeof p === "object" && p !== null && "price" in p);
                const lowestPrice = allPriceEntries.length > 0 ? Math.min(...allPriceEntries.map(e => e.price)) : null;
                const thisPrice = typeof priceEntry === "object" && priceEntry !== null && "price" in priceEntry ? priceEntry.price : null;
                const isLowest = thisPrice !== null && lowestPrice !== null && thisPrice === lowestPrice && !isActive;
                return (
                  <button
                    key={dateStr}
                    onClick={() => !isActive && navigateToDateStr(dateStr)}
                    className={`flex flex-col items-center justify-center py-1.5 md:py-2.5 transition-all relative cursor-pointer min-w-0 ${
                      idx < dateStrip.length - 1 ? "border-r border-border" : ""
                    } ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isLowest
                          ? "bg-emerald-50/80 hover:bg-emerald-50"
                          : "hover:bg-muted/40"
                    }`}
                  >
                    <span className={`text-[8px] md:text-[10px] uppercase tracking-wide font-medium ${
                      isActive ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}>
                      {format(d, "EEE")}
                    </span>
                    <span className={`text-[11px] md:text-[13px] font-bold leading-snug ${
                      isActive ? "text-primary-foreground" : "text-foreground"
                    }`}>
                      {format(d, "dd MMM")}
                    </span>
                    <div className="h-3.5 flex items-center mt-0.5 max-w-full px-0.5">
                      {typeof priceEntry === "object" && priceEntry !== null && "price" in priceEntry ? (
                        <span className={`text-[8px] md:text-[10px] font-semibold truncate max-w-full ${
                          isActive ? "text-primary-foreground/80" : isLowest ? "text-emerald-600" : "text-primary"
                        }`}>
                          {fmtPrice(priceEntry.price)}
                        </span>
                      ) : priceEntry === null ? (
                        <span className={`text-[8px] md:text-[10px] ${isActive ? "text-primary-foreground/50" : "text-muted-foreground/50"}`}>—</span>
                      ) : (
                        <Loader2 className={`w-3 h-3 animate-spin ${isActive ? "text-primary-foreground/40" : "text-muted-foreground/40"}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Next arrow */}
            <button
              onClick={() => navigateToDate(1)}
              className="shrink-0 w-10 flex items-center justify-center border-l border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-10">
        {loading ? (
          <FlightSearchLoader />
        ) : (
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters — desktop: sidebar, mobile: sheet drawer */}
          <div className="hidden lg:block lg:w-72 flex-shrink-0">
            <div className="bg-card rounded-xl p-6 card-hover sticky top-24">
              <div className="flex items-center gap-2 mb-6">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-foreground">Filters</h3>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Max Price: {CURRENCIES[displayCurrency].symbol}{Math.round(maxPrice).toLocaleString()}</label>
                  <input type="range" min={200} max={priceSliderMax} step={100} value={Math.min(maxPrice, priceSliderMax)} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-primary" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Sort By</label>
                  <div className="flex gap-2">
                    <Button variant={sortBy === "price" ? "default" : "outline"} size="sm" onClick={() => setSortBy("price")}>Price</Button>
                    <Button variant={sortBy === "duration" ? "default" : "outline"} size="sm" onClick={() => setSortBy("duration")}>Duration</Button>
                  </div>
                </div>

                {/* Stops filter */}
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Stops</label>
                  <div className="flex flex-col gap-1.5">
                    {([
                      { value: null, label: "Any", count: flights.length },
                      { value: 0, label: "Non-stop", count: stopOptions[0] },
                      { value: 1, label: "1 Stop", count: stopOptions[1] },
                      { value: 2, label: "2+ Stops", count: stopOptions[2] },
                    ] as const).map((opt) => (
                      <button
                        key={String(opt.value)}
                        onClick={() => setStopFilter(opt.value)}
                        disabled={opt.value !== null && opt.count === 0}
                        className={cn(
                          "flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors",
                          stopFilter === opt.value ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground",
                          opt.value !== null && opt.count === 0 && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">({opt.count})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Airlines filter */}
                {airlineOptions.length > 1 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-foreground">Airlines</label>
                      {selectedAirlines.size > 0 && (
                        <button onClick={() => setSelectedAirlines(new Set())} className="text-xs text-primary hover:underline">Clear</button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                      {airlineOptions.map((a) => (
                        <button
                          key={a.code}
                          onClick={() => toggleAirline(a.code)}
                          className={cn(
                            "flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors text-left",
                            selectedAirlines.has(a.code) ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"
                          )}
                        >
                          <span className="truncate mr-2">{a.name}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">({CURRENCIES[displayCurrency].symbol}{Math.round(a.lowestPrice).toLocaleString()})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile filter bar + sheet */}
          <div className="lg:hidden flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filtered.length} flights found</p>
            <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                  {(stopFilter !== null || selectedAirlines.size > 0) && (
                    <Badge variant="default" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                      {(stopFilter !== null ? 1 : 0) + (selectedAirlines.size > 0 ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters & Sort</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 py-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Max Price: {CURRENCIES[displayCurrency].symbol}{Math.round(maxPrice).toLocaleString()}</label>
                    <input type="range" min={200} max={priceSliderMax} step={100} value={Math.min(maxPrice, priceSliderMax)} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-primary" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Sort By</label>
                    <div className="flex gap-2">
                      <Button variant={sortBy === "price" ? "default" : "outline"} size="sm" onClick={() => setSortBy("price")}>Price</Button>
                      <Button variant={sortBy === "duration" ? "default" : "outline"} size="sm" onClick={() => setSortBy("duration")}>Duration</Button>
                    </div>
                  </div>

                  {/* Stops filter - mobile */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Stops</label>
                    <div className="flex flex-wrap gap-2">
                      {([
                        { value: null, label: "Any" },
                        { value: 0, label: "Non-stop" },
                        { value: 1, label: "1 Stop" },
                        { value: 2, label: "2+ Stops" },
                      ] as const).map((opt) => {
                        const count = opt.value === null ? flights.length : stopOptions[opt.value as 0 | 1 | 2];
                        return (
                          <Button
                            key={String(opt.value)}
                            variant={stopFilter === opt.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStopFilter(opt.value)}
                            disabled={opt.value !== null && count === 0}
                          >
                            {opt.label} ({count})
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Airlines filter - mobile */}
                  {airlineOptions.length > 1 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-foreground">Airlines</label>
                        {selectedAirlines.size > 0 && (
                          <button onClick={() => setSelectedAirlines(new Set())} className="text-xs text-primary hover:underline">Clear</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {airlineOptions.map((a) => (
                          <Button
                            key={a.code}
                            variant={selectedAirlines.has(a.code) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleAirline(a.code)}
                            className="text-xs"
                          >
                            {a.name} ({CURRENCIES[displayCurrency].symbol}{Math.round(a.lowestPrice).toLocaleString()})
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button onClick={() => setFilterOpen(false)} className="w-full">Apply Filters</Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex-1 space-y-4">
            <p className="text-sm text-muted-foreground mb-4 hidden lg:block">{filtered.length} flights found{groupedFlights.length < filtered.length && ` (${groupedFlights.length} groups)`}</p>
            {groupedFlights.length === 0 && !loading && (
              <div className="text-center py-16">
                <Plane className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-1">No flights found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your search criteria or dates</p>
              </div>
            )}
            {groupedFlights.map((group, gi) => {
              const flight = group.primary;
              const i = gi;
              const hasReturn = !!searchParams.get("returnDate");
              const adults = parseInt(searchParams.get("adults") || "1");
              const childCount = parseInt(searchParams.get("children") || "0");
              const infantCount = parseInt(searchParams.get("infants") || "0");
              const paxP = flight.paxPricing;
              const hasApiPricing = flight.basePrice !== undefined && flight.taxes !== undefined;
              // Use flight.price as the canonical per-adult total (already rounded correctly by backend)
              const perAdultTotal = Math.round(Number(flight.price));
              const perAdultBase = Math.round(hasApiPricing ? (flight.basePrice ?? 0) : perAdultTotal);
              const perAdultTax = Math.round(hasApiPricing ? (flight.taxes ?? 0) : 0);
              const childPrice = paxP?.CHD ? Math.round(paxP.CHD.total) : Math.round(perAdultTotal * 0.75);
              const infantPrice = paxP?.INF ? Math.round(paxP.INF.total) : Math.round(perAdultTotal * 0.10);
              const totalPax = adults + childCount + infantCount;
               const src = flight.source === "database" ? "local_inventory" : flight.source;
               // Prices are already converted by backend — use flight.price as canonical total
               const displayAdultTotal = perAdultTotal * adults;
               const displayChildTotal = childPrice * childCount;
               const displayInfantTotal = infantPrice * infantCount;
               const displayTotal = displayAdultTotal + displayChildTotal + displayInfantTotal;

              const layovers = getLayovers(flight.segments);
              const actualStops = flight.segments ? Math.max(0, flight.segments.length - 1) : flight.stops;

              const stopDots = [];
              for (let s = 0; s < actualStops; s++) {
                stopDots.push(
                  <div key={s} className="w-2 h-2 rounded-full bg-accent border-2 border-background absolute" style={{ left: `${((s + 1) / (actualStops + 1)) * 100}%`, transform: 'translateX(-50%)' }} />
                );
              }

              const navigateToDetail = async () => {
                const a = searchParams.get("adults") || "1";
                const c = searchParams.get("children") || "0";
                const inf = searchParams.get("infants") || "0";
                const bookUrl = `/flights/${flight.id}/book?adults=${a}&children=${c}&infants=${inf}`;
                // Save search date so booking page can reconstruct "Back to Search" URL
                const searchDate = searchParams.get("date");
                if (searchDate) sessionStorage.setItem("lastSearchDate", searchDate);

                const clearCacheAndRefresh = () => {
                  setFlights(prev => prev.filter(f => f.id !== flight.id));
                  try {
                    const cacheKey = `flight_results_${searchParams.get("from")}_${searchParams.get("to")}_${searchParams.get("date")}_${searchParams.get("returnDate")}_${searchParams.get("adults")}_${searchParams.get("class")}`;
                    sessionStorage.removeItem(cacheKey);
                  } catch {}
                };

                const handlePriceChange = (
                  verifiedFlight: any,
                  oldDisplayPrice: number,
                  newDisplayPrice: number,
                  markedUpDiff: number
                ) => {
                  const isIncrease = markedUpDiff > 0;
                  setFareVerification({
                    status: "price_changed",
                    type: isIncrease ? "increased" : "decreased",
                    oldPrice: fmtPrice(oldDisplayPrice),
                    newPrice: fmtPrice(newDisplayPrice),
                    diff: fmtPrice(Math.abs(markedUpDiff)),
                    onProceed: () => {
                      setFareVerification(null);
                      navigate(bookUrl, { state: { flight: verifiedFlight } });
                    },
                    onSearchAgain: () => {
                      setFareVerification(null);
                      navigate(`/flights?${searchParams.toString()}`, { replace: true });
                      window.location.reload();
                    },
                  });
                  setFlights(prev => prev.map(f => f.id === flight.id ? { ...f, price: newDisplayPrice } : f));
                };

                const showVerified = (verifiedFlight: any) => {
                  setFareVerification({
                    status: "verified",
                    onProceed: () => {
                      setFareVerification(null);
                      navigate(bookUrl, { state: { flight: verifiedFlight } });
                    },
                  });
                };

                // For Travelport flights, verify fare is still available
                if (flight.source === "travelport" && flight.segments?.length) {
                  setFareVerification({ status: "verifying" });
                  try {
                    const { data, error } = await supabase.functions.invoke("travelport-price", {
                      body: {
                        segments: flight.segments,
                        adults: parseInt(a),
                        children: parseInt(c),
                        infants: parseInt(inf),
                        cabinClass: flight.class || "Economy",
                        studentFare: searchParams.get("studentFare") === "true",
                      },
                    });

                    if (error || !data?.success) {
                      clearCacheAndRefresh();
                      setFareVerification({
                        status: "unavailable",
                        message: "This fare is no longer available. The airline may have sold out or updated pricing.",
                        onSearchAgain: () => {
                          navigate(`/flights?${searchParams.toString()}`, { replace: true });
                          window.location.reload();
                        },
                      });
                      return;
                    }

                    // Build verified flight with updated pricing
                    const verifiedFlight = { ...flight, fareVerified: true };
                    if (data.baggageAllowance) verifiedFlight.baggageAllowance = data.baggageAllowance;
                    if (data.basePrice != null) verifiedFlight.basePrice = data.basePrice;
                    if (data.taxes != null) verifiedFlight.taxes = data.taxes;
                    if (data.isRefundable !== undefined) verifiedFlight.isRefundable = data.isRefundable;
                    if (data.changePenalty) verifiedFlight.changePenalties = [{ applies: "Anytime", amount: `${data.changePenalty.currency}${data.changePenalty.amount}` }];
                    if (data.cancelPenalty) verifiedFlight.cancelPenalties = [{ applies: "Anytime", amount: `${data.cancelPenalty.currency}${data.cancelPenalty.amount}` }];
                    if (data.paxPricing) verifiedFlight.paxPricing = data.paxPricing;

                    // Compare raw API prices (before markup) to detect real fare changes
                    const originalRawPrice = (flight as any).rawApiPrice ?? data.totalPrice;
                    const verifiedRawPrice = data.totalPrice;
                    const priceDiff = verifiedRawPrice - originalRawPrice;

                    // Re-apply the same markup that was used during search
                    const markupPct = (flight as any).appliedMarkupPct || 0;
                    // Compute conversion ratio: display price / raw API price
                    const conversionRatio = originalRawPrice > 0 ? flight.price / originalRawPrice : 1;

                    const verifiedMarkedUpRaw = markupPct > 0
                      ? verifiedRawPrice * (1 + markupPct / 100)
                      : verifiedRawPrice;
                    const verifiedDisplayPrice = Math.round(verifiedMarkedUpRaw * conversionRatio);
                    const markedUpDiff = Math.round(priceDiff * (1 + markupPct / 100) * conversionRatio);

                    verifiedFlight.price = verifiedDisplayPrice;
                    (verifiedFlight as any).rawApiPrice = verifiedRawPrice;
                    (verifiedFlight as any).appliedMarkupPct = markupPct;

                    if (Math.abs(priceDiff) > 1) {
                      handlePriceChange(verifiedFlight, flight.price, verifiedDisplayPrice, markedUpDiff);
                    } else {
                      showVerified(verifiedFlight);
                    }
                    return;
                  } catch (err) {
                    setFareVerification(null);
                    console.warn("[FareVerify] verification call failed, proceeding anyway:", err);
                  }
                }

                // For Tripjack flights, verify fare via review API
                if (flight.source === "tripjack" && (flight as any).tripjackPriceId) {
                  setFareVerification({ status: "verifying" });
                  try {
                    const { data, error } = await supabase.functions.invoke("tripjack-review", {
                      body: {
                        priceIds: [(flight as any).tripjackPriceId],
                        targetCurrency: displayCurrency,
                      },
                    });

                    if (error || !data?.success) {
                      clearCacheAndRefresh();
                      setFareVerification({
                        status: "unavailable",
                        message: data?.error || "This fare is no longer available. The airline may have sold out or updated pricing.",
                        onSearchAgain: () => {
                          navigate(`/flights?${searchParams.toString()}`, { replace: true });
                          window.location.reload();
                        },
                      });
                      return;
                    }

                    // Build verified flight with updated data from review
                    const verifiedFlight = { ...flight, fareVerified: true };
                    if (data.bookingId) (verifiedFlight as any).tripjackBookingId = data.bookingId;
                    if (data.baggageAllowance) verifiedFlight.baggageAllowance = data.baggageAllowance;
                    if (data.isRefundable !== undefined) verifiedFlight.isRefundable = data.isRefundable;
                    if (data.conditions) (verifiedFlight as any).tripjackConditions = data.conditions;
                    if (data.totalPriceInfo) (verifiedFlight as any).tripjackTotalPriceInfo = data.totalPriceInfo;
                    if (data.ssrData) (verifiedFlight as any).tripjackSsrData = data.ssrData;

                    // Handle fare alerts (price changes)
                    // Tripjack review returns raw INR prices — convert to display currency
                    // using the ratio from the original search conversion
                    if (data.fareAlert) {
                      const oldFare = data.fareAlert.oldFare || 0;
                      const newFare = data.fareAlert.newFare || 0;
                      const priceDiff = newFare - oldFare;

                      const markupPct = (flight as any).appliedMarkupPct || 0;
                      // Compute conversion ratio: display price / raw API price
                      const originalApiPrice = (flight as any).rawApiPrice || (flight as any).originalPrice || oldFare;
                      const conversionRatio = originalApiPrice > 0 ? flight.price / originalApiPrice : 1;

                      const newMarkedUpRaw = markupPct > 0
                        ? newFare * (1 + markupPct / 100)
                        : newFare;
                      // Convert the new INR price to display currency using same ratio
                      const verifiedDisplayPrice = Math.round(newMarkedUpRaw * conversionRatio);
                      const markedUpDiff = Math.round(priceDiff * (1 + markupPct / 100) * conversionRatio);

                      verifiedFlight.price = verifiedDisplayPrice;
                      (verifiedFlight as any).rawApiPrice = newFare;

                      if (Math.abs(priceDiff) > 1) {
                        handlePriceChange(verifiedFlight, flight.price, verifiedDisplayPrice, markedUpDiff);
                        return;
                      }
                    }

                    showVerified(verifiedFlight);
                    return;
                  } catch (err) {
                    setFareVerification(null);
                    console.warn("[TripjackFareVerify] verification call failed, proceeding anyway:", err);
                  }
                }

                // For Amadeus flights, verify fare via price API
                if (flight.source === "amadeus" && (flight as any).amadeusRawOffer) {
                  setFareVerification({ status: "verifying" });
                  try {
                    const { data, error } = await supabase.functions.invoke("amadeus-price", {
                      body: {
                        rawOffer: (flight as any).amadeusRawOffer,
                      },
                    });

                    if (error || !data?.success) {
                      clearCacheAndRefresh();
                      setFareVerification({
                        status: "unavailable",
                        message: data?.error || "This fare is no longer available. The airline may have sold out or updated pricing.",
                        onSearchAgain: () => {
                          navigate(`/flights?${searchParams.toString()}`, { replace: true });
                          window.location.reload();
                        },
                      });
                      return;
                    }

                    // Build verified flight with updated pricing
                    const verifiedFlight = { ...flight, fareVerified: true };
                    if (data.baggageAllowance) verifiedFlight.baggageAllowance = data.baggageAllowance;
                    if (data.basePrice != null) verifiedFlight.basePrice = data.basePrice;
                    if (data.taxes != null) verifiedFlight.taxes = data.taxes;
                    if (data.isRefundable !== undefined) verifiedFlight.isRefundable = data.isRefundable;
                    if (data.paxPricing) verifiedFlight.paxPricing = data.paxPricing;
                    // Store verified raw offer for booking
                    if (data.verifiedRawOffer) (verifiedFlight as any).amadeusRawOffer = data.verifiedRawOffer;

                    const originalRawPrice = (flight as any).rawApiPrice ?? data.oldPrice;
                    const verifiedRawPrice = data.totalPrice;
                    const priceDiff = verifiedRawPrice - originalRawPrice;

                    const markupPct = (flight as any).appliedMarkupPct || 0;
                    const conversionRatio = originalRawPrice > 0 ? flight.price / originalRawPrice : 1;

                    const verifiedMarkedUpRaw = markupPct > 0
                      ? verifiedRawPrice * (1 + markupPct / 100)
                      : verifiedRawPrice;
                    const verifiedDisplayPrice = Math.round(verifiedMarkedUpRaw * conversionRatio);
                    const markedUpDiff = Math.round(priceDiff * (1 + markupPct / 100) * conversionRatio);

                    verifiedFlight.price = verifiedDisplayPrice;
                    (verifiedFlight as any).rawApiPrice = verifiedRawPrice;
                    (verifiedFlight as any).appliedMarkupPct = markupPct;

                    if (Math.abs(priceDiff) > 0.01) {
                      handlePriceChange(verifiedFlight, flight.price, verifiedDisplayPrice, markedUpDiff);
                    } else {
                      showVerified(verifiedFlight);
                    }
                    return;
                  } catch (err) {
                    setFareVerification(null);
                    console.warn("[AmadeusFareVerify] verification call failed, proceeding anyway:", err);
                  }
                }

                // Non-API flights (database, travelvela) go directly to booking
                navigate(bookUrl, { state: { flight } });
              };

              return (
              <motion.div key={group.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-card rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-border/50">
                {/* Desktop layout */}
                <div className="hidden md:block p-5">
                  <div className="flex items-center gap-5">
                    {/* Airline */}
                    <div className="flex items-center gap-3 w-44 flex-shrink-0">
                      <div className="w-11 h-11 rounded-xl bg-primary/5 border border-border/50 flex items-center justify-center overflow-hidden">
                        <img
                          src={`https://pics.avs.io/96/96/${flight.airline}.png`}
                          alt={flight.airline}
                          className="w-9 h-9 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{getAirlineName(flight.airline)}</p>
                        <p className="text-xs text-muted-foreground">
                          {getClassDisplay(flight)}
                          {(flight as any).fareIdentifier && (flight as any).fareIdentifier !== "PUBLISHED" && (
                            <span className="ml-1.5 text-[10px] font-medium text-primary/80">• {(flight as any).fareIdentifier}</span>
                          )}
                        </p>
                        {getOperatingCarrierText(flight) && (
                          <p className="text-[10px] text-accent truncate">{getOperatingCarrierText(flight)}</p>
                        )}
                      </div>
                    </div>

                    {/* Flight timeline */}
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        {/* Departure */}
                        <div className="text-right min-w-[72px]">
                          <p className="text-xl font-bold text-foreground leading-tight">{formatFlightTime(flight.departure)}</p>
                          {formatFlightDate(flight.departure) && <p className="text-[11px] text-muted-foreground">{formatFlightDate(flight.departure)}</p>}
                          <p className="text-xs font-medium text-muted-foreground">{flight.from_city}</p>
                        </div>

                        {/* Route line */}
                        <div className="flex-1 flex flex-col items-center gap-1 min-w-[120px]">
                          <p className="text-[11px] font-medium text-muted-foreground">{flight.duration}</p>
                          <div className="relative w-full h-[2px] bg-primary/20 rounded-full">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-primary bg-background" />
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-primary bg-primary" />
                            {stopDots}
                          </div>
                          <div className="flex items-center gap-1 flex-wrap justify-center">
                            <span className={cn("text-[11px] font-medium", actualStops === 0 ? "text-green-600 dark:text-green-400" : "text-accent")}>
                              {actualStops === 0 ? "Non-stop" : `${actualStops} Stop${actualStops > 1 ? "s" : ""}`}
                            </span>
                            {layovers.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                via {layovers.map(l => l.city).join(" & ")}
                                {layovers.some(l => l.duration) && (
                                  <> · {layovers.map(l => l.duration).filter(Boolean).join(" & ")} layover</>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Arrival */}
                        <div className="text-left min-w-[72px]">
                          <p className="text-xl font-bold text-foreground leading-tight">{formatFlightTime(flight.arrival)}</p>
                          {formatFlightDate(flight.arrival) && <p className="text-[11px] text-muted-foreground">{formatFlightDate(flight.arrival)}</p>}
                          <p className="text-xs font-medium text-muted-foreground">{flight.to_city}</p>
                        </div>
                      </div>

                      {/* Return leg */}
                      {hasReturn && (
                        <>
                          <div className="border-t border-dashed border-border/60 my-3" />
                          <div className="flex items-center gap-4">
                            <div className="text-right min-w-[72px]">
                              <p className="text-xl font-bold text-foreground leading-tight">{formatFlightTime(flight.arrival)}</p>
                              <p className="text-xs font-medium text-muted-foreground">{flight.to_city}</p>
                            </div>
                            <div className="flex-1 flex flex-col items-center gap-1 min-w-[120px]">
                              <p className="text-[11px] font-medium text-muted-foreground">{flight.duration}</p>
                              <div className="relative w-full h-[2px] bg-primary/20 rounded-full">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-primary bg-background" />
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-primary bg-primary" />
                                {stopDots}
                              </div>
                              <p className={cn("text-[11px] font-medium", flight.stops === 0 ? "text-green-600 dark:text-green-400" : "text-accent")}>
                                {flight.stops === 0 ? "Non-stop" : `${flight.stops} Stop${flight.stops > 1 ? "s" : ""}`}
                              </p>
                            </div>
                            <div className="text-left min-w-[72px]">
                              <p className="text-xl font-bold text-foreground leading-tight">{formatFlightTime(flight.departure)}</p>
                              <p className="text-xs font-medium text-muted-foreground">{flight.from_city}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Baggage info badges */}
                    {flight.baggageAllowance && (flight.baggageAllowance.checkin || flight.baggageAllowance.cabin) && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {flight.baggageAllowance.checkin && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
                            <Luggage className="w-3 h-3" />{flight.baggageAllowance.checkin}
                          </span>
                        )}
                        {flight.baggageAllowance.cabin && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
                            <Briefcase className="w-3 h-3" />{flight.baggageAllowance.cabin}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Price + CTA */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0 pl-4 border-l border-border/50 min-w-[140px]">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary leading-tight">{CURRENCIES[displayCurrency].symbol}{displayTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        {totalPax > 1 && <p className="text-[11px] text-muted-foreground mt-0.5">{totalPax} travelers</p>}
                      </div>
                      {(flight as any).isLcc && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
                          <Zap className="w-3 h-3" />Immediate Ticketing
                        </span>
                      )}
                      <Button onClick={navigateToDetail} disabled={fareVerification?.status === "verifying"} size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold rounded-lg px-5">
                        Book Now
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Mobile layout */}
                <div className="md:hidden p-4">
                  {/* Airline + price row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center overflow-hidden">
                        <img src={`https://pics.avs.io/96/96/${flight.airline}.png`} alt={flight.airline} className="w-7 h-7 object-contain"
                          onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>'; }}
                        />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-xs leading-tight">{getAirlineName(flight.airline)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {getClassDisplay(flight)}
                          {(flight as any).fareIdentifier && (flight as any).fareIdentifier !== "PUBLISHED" && (
                            <span className="ml-1 text-primary/80 font-medium">• {(flight as any).fareIdentifier}</span>
                          )}
                        </p>
                        {getOperatingCarrierText(flight) && (
                          <p className="text-[9px] text-accent leading-tight truncate max-w-[140px]">{getOperatingCarrierText(flight)}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary leading-tight">{CURRENCIES[displayCurrency].symbol}{displayTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      {totalPax > 1 && <p className="text-[10px] text-muted-foreground">{totalPax} travelers</p>}
                      {(flight as any).isLcc && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                          <Zap className="w-2.5 h-2.5" />Instant Ticket
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Flight timeline */}
                  <div className="bg-muted/30 rounded-lg px-3 py-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-center min-w-[50px]">
                        <p className="text-sm font-bold text-foreground leading-tight">{formatFlightTime(flight.departure)}</p>
                        <p className="text-[10px] text-muted-foreground">{flight.from_city}</p>
                      </div>
                      <div className="flex-1 flex flex-col items-center mx-2 gap-0.5">
                        <p className="text-[10px] text-muted-foreground font-medium">{flight.duration}</p>
                        <div className="relative w-full h-[2px] bg-primary/20 rounded-full max-w-[90px]">
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-primary bg-background" />
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-primary bg-primary" />
                          {actualStops > 0 && Array.from({ length: actualStops }).map((_, s) => (
                            <div key={s} className="w-1.5 h-1.5 rounded-full bg-accent border border-background absolute top-1/2 -translate-y-1/2" style={{ left: `${((s + 1) / (actualStops + 1)) * 100}%`, transform: 'translate(-50%, -50%)' }} />
                          ))}
                        </div>
                        <div className="flex flex-col items-center">
                          <span className={cn("text-[10px] font-medium", actualStops === 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                            {actualStops === 0 ? "Non-stop" : `${actualStops} Stop${actualStops > 1 ? "s" : ""}`}
                          </span>
                          {layovers.length > 0 && (
                            <span className="text-[9px] text-muted-foreground leading-tight">
                              {layovers.map(l => l.city).join(" & ")}{layovers.some(l => l.duration) && ` · ${layovers.map(l => l.duration).filter(Boolean).join(" & ")}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-center min-w-[50px]">
                        <p className="text-sm font-bold text-foreground leading-tight">{formatFlightTime(flight.arrival)}</p>
                        <p className="text-[10px] text-muted-foreground">{flight.to_city}</p>
                      </div>
                    </div>
                    {hasReturn && (
                      <>
                        <div className="border-t border-dashed border-border/60 my-2" />
                        <div className="flex items-center justify-between">
                          <div className="text-center min-w-[50px]">
                            <p className="text-sm font-bold text-foreground leading-tight">{formatFlightTime(flight.arrival)}</p>
                            <p className="text-[10px] text-muted-foreground">{flight.to_city}</p>
                          </div>
                          <div className="flex-1 flex flex-col items-center mx-2 gap-0.5">
                            <p className="text-[10px] text-muted-foreground font-medium">{flight.duration}</p>
                            <div className="relative w-full h-[2px] bg-primary/20 rounded-full max-w-[90px]">
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-primary bg-background" />
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-primary bg-primary" />
                            </div>
                            <p className={cn("text-[10px] font-medium", flight.stops === 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                              {flight.stops === 0 ? "Non-stop" : `${flight.stops} Stop${flight.stops > 1 ? "s" : ""}`}
                            </p>
                          </div>
                          <div className="text-center min-w-[50px]">
                            <p className="text-sm font-bold text-foreground leading-tight">{formatFlightTime(flight.departure)}</p>
                            <p className="text-[10px] text-muted-foreground">{flight.from_city}</p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Baggage info badges - mobile */}
                  {flight.baggageAllowance && (flight.baggageAllowance.checkin || flight.baggageAllowance.cabin) && (
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {flight.baggageAllowance.checkin && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
                          <Luggage className="w-3 h-3" />{flight.baggageAllowance.checkin}
                        </span>
                      )}
                      {flight.baggageAllowance.cabin && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-1.5 py-0.5">
                          <Briefcase className="w-3 h-3" />{flight.baggageAllowance.cabin}
                        </span>
                      )}
                    </div>
                  )}

                  <Button onClick={navigateToDetail} disabled={fareVerification?.status === "verifying"} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm h-9 rounded-lg">
                    Book Now
                  </Button>
                </div>

                {/* Expandable Flight Details */}
                <FlightDetailsPanel flight={flight} airlineName={getAirlineName(flight.airline)} hasReturn={hasReturn} adults={adults} children={childCount} infants={infantCount} studentFare={searchParams.get("studentFare") === "true"} />

                {/* Alternative timings toggle */}
                {group.alternatives.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleGroupExpand(group.key)}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 py-2 border-t transition-all",
                        expandedGroups.has(group.key)
                          ? "bg-primary/[0.04] border-primary/15 text-primary"
                          : "border-border/40 text-primary/70 hover:bg-primary/[0.03] hover:text-primary"
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                        <Clock className="w-3 h-3" />
                        <span>
                          {expandedGroups.has(group.key)
                            ? "Hide alternative timings"
                            : `+${group.alternatives.length} more timing${group.alternatives.length > 1 ? "s" : ""}`}
                        </span>
                        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", expandedGroups.has(group.key) && "rotate-180")} />
                      </div>
                    </button>
                    <AnimatePresence>
                      {expandedGroups.has(group.key) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-primary/10 divide-y divide-border/30">
                            {group.alternatives.map((altFlight, altIdx) => {
                              const altLayovers = getLayovers(altFlight.segments);
                              const altStops = altFlight.segments ? Math.max(0, altFlight.segments.length - 1) : altFlight.stops;
                              const altNavigate = (e: React.MouseEvent) => {
                                e.stopPropagation();
                                const a = searchParams.get("adults") || "1";
                                const c = searchParams.get("children") || "0";
                                const inf = searchParams.get("infants") || "0";
                                const bookUrl = `/flights/${altFlight.id}/book?adults=${a}&children=${c}&infants=${inf}`;
                                navigate(bookUrl, { state: { flight: altFlight } });
                              };
                              const altAirlineCode = altFlight.airline?.length === 2 ? altFlight.airline : altFlight.airline?.substring(0, 2);
                              return (
                                <div key={altFlight.id} className="hover:bg-muted/30 transition-colors">
                                  <div className="flex items-center gap-4 px-4 md:px-5 py-3">
                                    {/* Airline logo + name */}
                                    <div className="flex-shrink-0 flex items-center gap-2.5 w-[120px] md:w-[140px]">
                                      <div className="w-8 h-8 rounded border border-border/50 bg-background flex items-center justify-center overflow-hidden flex-shrink-0">
                                        <img
                                          src={`https://pics.avs.io/60/60/${altAirlineCode}.png`}
                                          alt={altAirlineCode}
                                          className="w-6 h-6 object-contain"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{getAirlineName(altFlight.airline)}</p>
                                        <p className="text-xs text-muted-foreground truncate">{getClassDisplay(altFlight)}</p>
                                      </div>
                                    </div>

                                    {/* Departure */}
                                    <div className="text-right w-[60px] flex-shrink-0">
                                      <p className="text-sm font-bold text-foreground leading-tight">{formatFlightTime(altFlight.departure)}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">{altFlight.from_city}</p>
                                    </div>

                                    {/* Route line */}
                                    <div className="flex-1 flex flex-col items-center gap-0 min-w-[100px] max-w-[220px]">
                                      <span className="text-xs font-medium text-muted-foreground leading-none mb-1">{altFlight.duration}</span>
                                      <div className="relative w-full h-[2px] bg-border/60 rounded-full">
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full border-[1.5px] border-primary bg-background" />
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full bg-primary" />
                                        {altStops > 0 && Array.from({ length: altStops }).map((_, s) => (
                                          <div key={s} className="w-[5px] h-[5px] rounded-full bg-accent absolute top-1/2" style={{ left: `${((s + 1) / (altStops + 1)) * 100}%`, transform: 'translate(-50%, -50%)' }} />
                                        ))}
                                      </div>
                                      <div className="flex items-center gap-1 mt-1 flex-wrap justify-center">
                                        <span className={cn("text-xs font-semibold", altStops === 0 ? "text-green-600 dark:text-green-400" : "text-accent")}>
                                          {altStops === 0 ? "Non-stop" : `${altStops} stop`}
                                        </span>
                                        {altLayovers.length > 0 && (
                                          <span className="text-xs text-muted-foreground">
                                            · {altLayovers.map(l => l.duration ? `${l.city} (${l.duration})` : l.city).join(" & ")}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Arrival */}
                                    <div className="w-[60px] flex-shrink-0">
                                      <p className="text-sm font-bold text-foreground leading-tight">{formatFlightTime(altFlight.arrival)}</p>
                                      <p className="text-xs text-muted-foreground mt-0.5">{altFlight.to_city}</p>
                                    </div>

                                    {/* Select button - no ml-auto gap */}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 px-5 text-xs font-semibold border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground transition-colors flex-shrink-0"
                                      onClick={altNavigate}
                                    >
                                      Select
                                    </Button>
                                  </div>
                                  {/* Flight details panel for this alternative */}
                                  <FlightDetailsPanel flight={altFlight} airlineName={getAirlineName(altFlight.airline)} hasReturn={hasReturn} adults={adults} children={childCount} infants={infantCount} studentFare={searchParams.get("studentFare") === "true"} />
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </Layout>

    <AlertDialog open={complexBookingOpen} onOpenChange={setComplexBookingOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Complex Booking Scenario</AlertDialogTitle>
          <AlertDialogDescription>
            Your booking scenario is complex. Please contact our customer support for help.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <FareVerificationDialog
      state={fareVerification}
      onClose={() => setFareVerification(null)}
    />
    </>
  );
};

const TravelerCounter = ({ label, subtitle, value, onChange, min, max, disabled }: { label: string; subtitle?: string; value: number; onChange: (v: number) => void; min: number; max?: number; disabled?: boolean }) => (
  <div className={cn("flex items-center justify-between", disabled && "opacity-40 pointer-events-none")}>
    <div>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {subtitle && <span className="text-[11px] text-muted-foreground block">{subtitle}</span>}
    </div>
    <div className="flex items-center gap-2.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          "w-7 h-7 rounded-full border flex items-center justify-center transition-all",
          value <= min || disabled ? "border-muted text-muted cursor-not-allowed" : "border-primary/40 text-primary hover:bg-primary/10"
        )}
        disabled={value <= min || disabled}
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="text-sm font-bold w-4 text-center">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        className={cn("w-7 h-7 rounded-full border flex items-center justify-center transition-all", (disabled || (max !== undefined && value >= max)) ? "border-muted text-muted cursor-not-allowed" : "border-primary/40 text-primary hover:bg-primary/10")}
        disabled={disabled || (max !== undefined && value >= max)}
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  </div>
);

export default Flights;
