import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Plane, Clock, ArrowRight, Users, Luggage, CheckCircle, Loader2, Shield, CalendarDays, Briefcase, MapPin, ChevronRight, Tag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

import { AIRLINE_NAMES, getAirlineName } from "@/data/airlines";

/** Format flight number: ensures "CZ 3405" format */
function formatFlightNum(carrier: string, flightNumber: string): string {
  const num = flightNumber.replace(/^[A-Z0-9]{2}\s*/i, (match) =>
    match.trim().toUpperCase() === carrier.toUpperCase() ? "" : match
  );
  return `${carrier} ${num}`.replace(/\s+/g, " ").trim();
}

function fmtTime(timeStr: string): string {
  if (!timeStr) return "--:--";
  if (timeStr.includes("T")) {
    try { return new Date(timeStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return timeStr; }
  }
  return timeStr;
}

function fmtDate(timeStr: string): string | null {
  if (!timeStr || !timeStr.includes("T")) return null;
  try { return format(new Date(timeStr), "dd MMM yyyy"); } catch { return null; }
}

function calcDuration(dep: string, arr: string): string | null {
  if (!dep || !arr) return null;
  const d = dep.includes("T") ? new Date(dep).getTime() : null;
  const a = arr.includes("T") ? new Date(arr).getTime() : null;
  if (!d || !a || a <= d) return null;
  const mins = Math.round((a - d) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function calcLayover(prevArrival: string, nextDeparture: string): string | null {
  return calcDuration(prevArrival, nextDeparture);
}

function isCancelPenalty100Percent(penalty: any): boolean {
  if (Array.isArray(penalty)) {
    return penalty.some((p: any) => {
      const pct = p.percentage || "";
      return pct.replace("%", "").trim() === "100" || pct === "100.00%";
    });
  }
  if (penalty && typeof penalty === "object") {
    const pct = penalty.percentage || "";
    return pct.replace("%", "").trim() === "100" || pct === "100.00%";
  }
  return false;
}

function formatSinglePenaltyBasic(rawAmount: string, rawPercent: string): string {
  if (rawAmount) {
    const match = String(rawAmount).match(/^([A-Z]{3})([\d.]+)$/);
    return match ? `${match[1]} ${match[2]}` : rawAmount;
  }
  if (rawPercent) {
    const pctVal = parseFloat(rawPercent);
    if (pctVal >= 100) return "Full fare forfeited";
    if (pctVal === 0) return "Free (no penalty)";
    return `${pctVal}% of fare`;
  }
  return "See airline policy";
}

interface PenaltyLineBasic { label: string; value: string }

function buildPenaltyLinesBasic(penalty: any): PenaltyLineBasic[] {
  if (!penalty) return [];
  if (Array.isArray(penalty)) {
    const before: PenaltyLineBasic[] = [];
    const after: PenaltyLineBasic[] = [];
    const anytime: PenaltyLineBasic[] = [];
    for (const p of penalty) {
      const applies = (p.applies || p.PenaltyApplies || "").toLowerCase().trim();
      const rawAmount = p.amount || p.Amount || p.PenaltyAmount || "";
      const rawPercent = p.percentage || "";
      const value = formatSinglePenaltyBasic(rawAmount, rawPercent);
      if (applies === "before" || applies === "before departure") before.push({ label: "Before Departure", value });
      else if (applies === "after" || applies === "after departure") after.push({ label: "After Departure", value });
      else anytime.push({ label: "", value });
    }
    if (before.length > 0 && after.length > 0) return [...before, ...after];
    if (anytime.length > 0) {
      const unique = [...new Set(anytime.map(e => e.value))];
      return [{ label: "", value: unique.length === 1 ? unique[0] : (anytime.find(e => !e.value.includes("Free"))?.value || unique[0]) }];
    }
    return [...before, ...after];
  }
  if (penalty && typeof penalty === "object") {
    const rawAmount = penalty.PenaltyAmount || penalty.Amount || penalty.amount || "";
    const rawPercent = penalty.percentage || "";
    const applies = (penalty.PenaltyApplies || penalty.applies || "").toLowerCase().trim();
    const value = formatSinglePenaltyBasic(rawAmount, rawPercent);
    const label = applies === "before" || applies === "before departure" ? "Before Departure"
      : applies === "after" || applies === "after departure" ? "After Departure" : "";
    return [{ label, value }];
  }
  return [];
}

interface Flight {
  id: string; airline: string; from_city: string; to_city: string;
  departure: string; arrival: string; duration: string; price: number;
  stops: number; class: string; flightNumber?: string; source?: string;
  segments?: any[];
  isRefundable?: boolean;
  changePenalties?: any;
  cancelPenalties?: any;
  baggageAllowance?: { cabin?: string; checkin?: string } | null;
  basePrice?: number;
  taxes?: number;
  paxPricing?: Record<string, { base: number; taxes: number; total: number }> | null;
}

function getClassDisplay(flight: { class: string; segments?: any[] }): string {
  const bookingCode = flight.segments?.[0]?.bookingCode;
  return bookingCode ? `${flight.class} ( ${bookingCode} )` : flight.class;
}

const FlightDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [flight, setFlight] = useState<Flight | null>(null);
  const [loading, setLoading] = useState(true);
  const { formatPrice, formatDirectPrice, currency: displayCurrency } = useCurrency();
  const taxSettings = useTaxSettings();

  useEffect(() => {
    const stateFlight = (location.state as any)?.flight as Flight | undefined;
    if (stateFlight) { setFlight(stateFlight); setLoading(false); return; }
    supabase.from("flights").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setFlight(data as any); setLoading(false);
    });
  }, [id, location.state]);

  if (loading) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading flight details...</p>
      </div>
    </Layout>
  );

  if (!flight) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-foreground">Flight not found</h2>
          <Button className="mt-4" onClick={() => navigate("/flights")}>Back to Flights</Button>
        </div>
      </Layout>
    );
  }

  const airlineName = getAirlineName(flight.airline);
  const params = new URLSearchParams(window.location.search);
  const adults = parseInt(params.get("adults") || "1");
  const children = parseInt(params.get("children") || "0");
  const infants = parseInt(params.get("infants") || "0");

  const flightSource = flight.source;
  const apiBasePrice = (flight as any).basePrice;
  const apiTaxes = (flight as any).taxes;
  const paxP = (flight as any).paxPricing;
  const hasApiPricing = apiBasePrice !== undefined && apiTaxes !== undefined;
  const perAdultBase = Math.round(hasApiPricing ? apiBasePrice : Number(flight.price));
  const perAdultTax = Math.round(hasApiPricing ? apiTaxes : 0);
  const perAdultTotal = perAdultBase + perAdultTax;
  const childBase = paxP?.CHD ? Math.round(paxP.CHD.base) : (hasApiPricing ? Math.round(perAdultBase * 0.75) : null);
  const childTax = paxP?.CHD ? Math.round(paxP.CHD.taxes) : (hasApiPricing ? Math.round(perAdultTax * 0.75) : null);
  const childPrice = childBase != null && childTax != null ? childBase + childTax : Math.round(perAdultTotal * 0.75);
  const infantBase = paxP?.INF ? Math.round(paxP.INF.base) : (hasApiPricing ? Math.round(perAdultBase * 0.10) : null);
  const infantTax = paxP?.INF ? Math.round(paxP.INF.taxes) : (hasApiPricing ? Math.round(perAdultTax * 0.10) : null);
  const infantPrice = infantBase != null && infantTax != null ? infantBase + infantTax : Math.round(perAdultTotal * 0.10);
  const adultTotal = perAdultTotal * adults;
  const childTotal = childPrice * children;
  const infantTotal = infantPrice * infants;
  // Prices are already converted by backend — use directly
  const dispAdultTotal = perAdultTotal * adults;
  const dispChildTotal = childPrice * children;
  const dispInfantTotal = infantPrice * infants;
  const dispSubtotal = dispAdultTotal + dispChildTotal + dispInfantTotal;
  const subtotal = adultTotal + childTotal + infantTotal;
  const convenienceFee = Math.round(subtotal * (taxSettings.convenienceFeePercentage / 100));
  const dispConvenienceFee = Math.round(dispSubtotal * (taxSettings.convenienceFeePercentage / 100));
  const dispTotal = dispSubtotal + dispConvenienceFee;
  const total = subtotal + convenienceFee;
  const totalPax = adults + children + infants;
  const fmtDisp = (v: number) => `${CURRENCIES[displayCurrency].symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const isRefundable = isCancelPenalty100Percent(flight.cancelPenalties) ? false : flight.isRefundable;

  const segments = flight.segments && flight.segments.length > 0 ? flight.segments : null;

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } } };

  return (
    <Layout>
      {/* Hero header with layered gradient */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-gradient" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.3)_0%,_transparent_70%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
        
        <div className="relative container mx-auto px-4 pt-8 pb-24">
          <motion.button
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => navigate(-1)}
            className="text-primary-foreground/60 hover:text-primary-foreground text-sm mb-5 inline-flex items-center gap-1.5 transition-colors group"
          >
            <ChevronRight className="w-4 h-4 rotate-180 transition-transform group-hover:-translate-x-0.5" />
            Back to search results
          </motion.button>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary-foreground/10 backdrop-blur-md border border-primary-foreground/10 flex items-center justify-center overflow-hidden shadow-lg">
                  <img src={`https://pics.avs.io/80/80/${flight.airline}.png`} alt={airlineName} className="w-10 h-10 object-contain"
                    onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>'; }}
                  />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-primary-foreground tracking-tight">
                    {flight.from_city}
                    <span className="inline-flex mx-3 text-primary-foreground/40"><ArrowRight className="w-6 h-6" /></span>
                    {flight.to_city}
                  </h1>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-primary-foreground/70 text-sm">{airlineName}</span>
                      <Badge variant="outline" className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground/80 text-xs">
                        {getClassDisplay(flight)}
                      </Badge>
                    </div>
                </div>
              </div>

              {totalPax > 1 && (
                <div className="flex items-center gap-2 text-primary-foreground/60 text-sm bg-primary-foreground/5 rounded-xl px-3 py-1.5 backdrop-blur-sm border border-primary-foreground/10">
                  <Users className="w-4 h-4" />
                  <span>{adults} Adult{adults > 1 ? "s" : ""}{children > 0 ? `, ${children} Child${children > 1 ? "ren" : ""}` : ""}{infants > 0 ? `, ${infants} Infant${infants > 1 ? "s" : ""}` : ""}</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-16 relative z-10 pb-12">
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">
            {/* Flight Route Card */}
            <motion.div variants={fadeUp}>
              <Card className="overflow-hidden border-0 shadow-xl shadow-primary/5 bg-card">
                {/* Journey summary header */}
                {segments && segments.length > 1 && (
                  <div className="px-6 pt-5 pb-4 border-b border-border/40 bg-gradient-to-r from-primary/[0.03] to-transparent">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <CalendarDays className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {segments.length - 1} Stop{segments.length - 1 > 1 ? "s" : ""} · {flight.duration}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium tabular-nums">
                        {fmtTime(flight.departure)} – {fmtTime(flight.arrival)}
                      </span>
                    </div>
                  </div>
                )}
                <CardContent className="p-0">
                  {segments ? (
                    <div className="divide-y divide-border/40">
                      {segments.map((seg: any, idx: number) => {
                        const segDuration = calcDuration(seg.departure, seg.arrival);
                        const layoverTime = idx < segments.length - 1 ? calcLayover(seg.arrival, segments[idx + 1].departure) : null;
                        return (
                        <div key={idx}>
                          <div className="p-6">
                            <div className="flex items-start gap-3 mb-5">
                              <div className="w-9 h-9 rounded-xl bg-primary/5 border border-border/30 flex items-center justify-center overflow-hidden">
                                <img src={`https://pics.avs.io/64/64/${seg.carrier || flight.airline}.png`} alt="" className="w-7 h-7 object-contain"
                                  onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>'; }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground leading-tight">{getAirlineName(seg.carrier || flight.airline)}</p>
                                <p className="text-xs text-muted-foreground leading-snug">
                                  {seg.flightNumber ? <span className="font-medium text-foreground/80">{formatFlightNum(seg.carrier || flight.airline, seg.flightNumber)}</span> : <span>{seg.carrier || flight.airline}</span>}
                                  <span className="mx-1.5 text-border">|</span>
                                  <span>{flight.class}</span>
                                  <span className="font-semibold text-primary"> ({seg.bookingCode || "—"})</span>
                                </p>
                              </div>
                              <div className="ml-auto flex flex-col md:flex-row md:items-center items-end gap-2 flex-shrink-0">
                                {segDuration && (
                                  <Badge variant="outline" className="text-xs font-medium">
                                    <Clock className="w-3 h-3 mr-1" />{segDuration}
                                  </Badge>
                                )}
                                <Badge className="text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/10 border-0">Seg {idx + 1}</Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right flex-shrink-0 min-w-[80px]">
                                <p className="text-2xl font-bold text-foreground tabular-nums">{fmtTime(seg.departure)}</p>
                                {fmtDate(seg.departure) && <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(seg.departure)}</p>}
                                <p className="text-sm font-semibold text-primary mt-1">{seg.origin}</p>
                              </div>
                              <div className="flex-1 flex flex-col items-center gap-1.5">
                                {segDuration && <p className="text-[11px] font-medium text-muted-foreground">{segDuration}</p>}
                                <div className="relative w-full h-[2px] bg-gradient-to-r from-primary/30 via-primary/50 to-primary/30 rounded-full">
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-primary bg-background shadow-sm" />
                                  <div className="absolute right-0 top-1/2 -translate-y-1/2">
                                    <Plane className="w-4 h-4 text-primary" />
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Direct</p>
                              </div>
                              <div className="text-left flex-shrink-0 min-w-[80px]">
                                <p className="text-2xl font-bold text-foreground tabular-nums">{fmtTime(seg.arrival)}</p>
                                {fmtDate(seg.arrival) && <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(seg.arrival)}</p>}
                                <p className="text-sm font-semibold text-primary mt-1">{seg.destination}</p>
                              </div>
                            </div>
                          </div>
                          {idx < segments.length - 1 && (
                            <div className="mx-6 mb-1 flex items-center gap-3 bg-accent/5 border border-accent/15 rounded-xl px-4 py-3">
                              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4 text-accent" />
                              </div>
                              <p className="text-sm font-medium text-accent">
                                Layover at {seg.destination}{layoverTime ? ` · ${layoverTime}` : ""}
                              </p>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Single flight route display */
                    <div className="p-6 sm:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-primary/5 border border-border/30 flex items-center justify-center overflow-hidden">
                          <img src={`https://pics.avs.io/80/80/${flight.airline}.png`} alt={airlineName} className="w-9 h-9 object-contain"
                            onError={(e) => { e.currentTarget.style.display = "none"; const p = e.currentTarget.parentElement; if (p) p.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>'; }}
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-base">{airlineName}</p>
                          <p className="text-xs text-muted-foreground">{flight.flightNumber || flight.airline} · {getClassDisplay(flight)}</p>
                        </div>
                        <Badge variant={flight.stops === 0 ? "default" : "secondary"} className={cn("ml-auto text-xs font-semibold", flight.stops === 0 && "bg-primary/10 text-primary hover:bg-primary/10 border-0")}>
                          {flight.stops === 0 ? "Non-stop" : `${flight.stops} Stop${flight.stops > 1 ? "s" : ""}`}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right flex-shrink-0 min-w-[90px]">
                          <p className="text-3xl sm:text-4xl font-bold text-foreground tabular-nums">{fmtTime(flight.departure)}</p>
                          {fmtDate(flight.departure) && <p className="text-sm text-muted-foreground mt-0.5">{fmtDate(flight.departure)}</p>}
                          <div className="flex items-center gap-1 justify-end mt-1.5">
                            <MapPin className="w-3 h-3 text-primary" />
                            <p className="text-sm font-semibold text-primary">{flight.from_city}</p>
                          </div>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-1.5">
                          <p className="text-sm font-medium text-muted-foreground">{flight.duration}</p>
                          <div className="relative w-full h-[2px] bg-gradient-to-r from-primary/30 via-primary/60 to-primary/30 rounded-full">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary bg-background shadow-sm" />
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-primary bg-primary shadow-sm" />
                            {flight.stops > 0 && Array.from({ length: flight.stops }).map((_, s) => (
                              <div key={s} className="w-3 h-3 rounded-full bg-accent border-2 border-background absolute top-1/2 shadow-sm" style={{ left: `${((s + 1) / (flight.stops + 1)) * 100}%`, transform: 'translate(-50%, -50%)' }} />
                            ))}
                          </div>
                        </div>
                        <div className="text-left flex-shrink-0 min-w-[90px]">
                          <p className="text-3xl sm:text-4xl font-bold text-foreground tabular-nums">{fmtTime(flight.arrival)}</p>
                          {fmtDate(flight.arrival) && <p className="text-sm text-muted-foreground mt-0.5">{fmtDate(flight.arrival)}</p>}
                          <div className="flex items-center gap-1 mt-1.5">
                            <MapPin className="w-3 h-3 text-primary" />
                            <p className="text-sm font-semibold text-primary">{flight.to_city}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* What's Included */}
            <motion.div variants={fadeUp}>
              <Card className="border-0 shadow-lg shadow-primary/[0.03] overflow-hidden">
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    What's Included
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { icon: Luggage, label: "Checked Baggage", desc: flight.baggageAllowance?.checkin || "Check with airline", gradient: "from-blue-500/10 to-blue-600/5", iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
                      { icon: Briefcase, label: "Cabin Baggage", desc: flight.baggageAllowance?.cabin || "Check with airline", gradient: "from-emerald-500/10 to-emerald-600/5", iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
                      { icon: Shield, label: isRefundable ? "Refundable" : "Non-Refundable", desc: isRefundable ? "Cancellation allowed" : "Penalties may apply", gradient: "from-violet-500/10 to-violet-600/5", iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
                    ].map((f) => (
                      <div key={f.label} className={cn("flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br border border-border/30 transition-all hover:shadow-sm", f.gradient)}>
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", f.iconBg)}>
                          <f.icon className="w-[18px] h-[18px]" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-sm">{f.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{f.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Fare Breakdown */}
            <motion.div variants={fadeUp}>
              <Card className="border-0 shadow-lg shadow-primary/[0.03] overflow-hidden">
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-base font-semibold flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Tag className="w-4 h-4 text-primary" />
                    </div>
                    Fare Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-5">
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b-2 border-primary/10">
                            <th className="text-left py-3 font-semibold text-foreground text-xs uppercase tracking-wider">Traveler</th>
                            <th className="text-center py-3 font-semibold text-foreground text-xs uppercase tracking-wider">Qty</th>
                            <th className="text-center py-3 font-semibold text-foreground text-xs uppercase tracking-wider">Per Person</th>
                            <th className="text-right py-3 font-semibold text-foreground text-xs uppercase tracking-wider">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/30">
                            <td className="py-3.5 text-foreground font-medium">Adult</td>
                            <td className="py-3.5 text-center text-foreground font-semibold">{adults}</td>
                            <td className="py-3.5 text-center text-muted-foreground tabular-nums">{formatPrice(perAdultTotal, flightSource)}</td>
                            <td className="py-3.5 text-right text-foreground font-semibold tabular-nums">{formatPrice(adultTotal, flightSource)}</td>
                          </tr>
                          {children > 0 && (
                            <tr className="border-b border-border/30">
                              <td className="py-3.5 text-foreground font-medium">Child</td>
                              <td className="py-3.5 text-center text-foreground font-semibold">{children}</td>
                              <td className="py-3.5 text-center text-muted-foreground tabular-nums">{formatPrice(childPrice, flightSource)}</td>
                              <td className="py-3.5 text-right text-foreground font-semibold tabular-nums">{formatPrice(childTotal, flightSource)}</td>
                            </tr>
                          )}
                          {infants > 0 && (
                            <tr className="border-b border-border/30">
                              <td className="py-3.5 text-foreground font-medium">Infant</td>
                              <td className="py-3.5 text-center text-foreground font-semibold">{infants}</td>
                              <td className="py-3.5 text-center text-muted-foreground tabular-nums">{formatPrice(infantPrice, flightSource)}</td>
                              <td className="py-3.5 text-right text-foreground font-semibold tabular-nums">{formatPrice(infantTotal, flightSource)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-gradient-to-br from-primary/[0.04] to-primary/[0.02] rounded-2xl p-5 space-y-2.5 text-sm border border-primary/10">
                      {/* Per-type breakdown */}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Adult</span>
                        <span className="text-foreground font-medium tabular-nums">
                          {adults > 1 ? <span className="text-muted-foreground font-normal text-xs mr-1">({formatPrice(perAdultTotal, flightSource)} × {adults})</span> : null}
                          {fmtDisp(dispAdultTotal)}
                        </span>
                      </div>
                      {children > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Child</span>
                          <span className="text-foreground font-medium tabular-nums">
                            {children > 1 ? <span className="text-muted-foreground font-normal text-xs mr-1">({formatPrice(childPrice, flightSource)} × {children})</span> : null}
                            {fmtDisp(dispChildTotal)}
                          </span>
                        </div>
                      )}
                      {infants > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Infant</span>
                          <span className="text-foreground font-medium tabular-nums">
                            {infants > 1 ? <span className="text-muted-foreground font-normal text-xs mr-1">({formatPrice(infantPrice, flightSource)} × {infants})</span> : null}
                            {fmtDisp(dispInfantTotal)}
                          </span>
                        </div>
                      )}
                      {convenienceFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Convenience Fee</span><span className="text-foreground font-medium tabular-nums">{fmtDisp(dispConvenienceFee)}</span></div>}
                      <div className="border-t-2 border-primary/15 pt-3 mt-1 flex justify-between items-center">
                        <span className="font-bold text-foreground">Total Amount</span>
                        <span className="text-2xl font-bold text-primary tabular-nums">{fmtDisp(dispTotal)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

          </div>

          {/* Sidebar - Order Summary */}
          <div>
            <motion.div variants={fadeUp} className="sticky top-24 space-y-4">
              <Card className="border-0 shadow-xl shadow-primary/10 overflow-hidden">
                {/* Gradient accent top bar */}
                <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-accent" />
                <CardHeader className="pb-3 pt-5 px-6">
                  <CardTitle className="text-base font-semibold">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-5">
                  {/* Route summary */}
                  <div className="bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] rounded-xl p-4 flex items-center gap-3 border border-primary/10">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Plane className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{flight.from_city} → {flight.to_city}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{fmtTime(flight.departure)} - {fmtTime(flight.arrival)} · {flight.duration}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Adult × {adults}</span>
                      <span className="text-foreground font-semibold tabular-nums">{fmtDisp(dispAdultTotal)}</span>
                    </div>
                    {children > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Child × {children}</span>
                        <span className="text-foreground font-semibold tabular-nums">{fmtDisp(dispChildTotal)}</span>
                      </div>
                    )}
                    {infants > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Infant × {infants}</span>
                        <span className="text-foreground font-semibold tabular-nums">{fmtDisp(dispInfantTotal)}</span>
                      </div>
                    )}
                    {convenienceFee > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Convenience Fee</span>
                        <span className="text-foreground font-semibold tabular-nums">{fmtDisp(dispConvenienceFee)}</span>
                      </div>
                    )}
                    <div className="border-t-2 border-primary/15 pt-3 flex justify-between items-center">
                      <span className="font-bold text-foreground">Total</span>
                      <span className="text-2xl font-bold text-primary tabular-nums">{fmtDisp(dispTotal)}</span>
                    </div>
                    {totalPax > 1 && <p className="text-xs text-muted-foreground text-right">{totalPax} traveler{totalPax > 1 ? "s" : ""}</p>}
                  </div>

                  <Button
                    className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
                    size="lg"
                    onClick={() => {
                      const p = new URLSearchParams(window.location.search);
                      navigate(`/flights/${flight.id}/book?adults=${p.get("adults") || "1"}&children=${p.get("children") || "0"}&infants=${p.get("infants") || "0"}`, { state: { flight, adults } });
                    }}
                  >
                    Proceed to Booking
                    <ChevronRight className="w-5 h-5 ml-1" />
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">No payment required now · Secure booking</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
};

export default FlightDetail;
