import { useState, useCallback, useEffect } from "react";
import { ChevronDown, ChevronUp, Plane, Luggage, Clock, Shield, AlertCircle, Loader2, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";
import { useTaxSettings } from "@/hooks/useTaxSettings";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getAirlineName } from "@/data/airlines";
import { airports } from "@/data/airports";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Text is already currency-converted by the backend — no client-side conversion needed */
function convertInrInText(text: string): string {
  return text;
}

/** Determine Tripjack regional category from destination airport code */
function getTjRegion(fromCode: string, toCode: string): string | null {
  const findCountry = (code: string) => {
    const ap = airports.find(a => a.code === code);
    return ap?.country?.toLowerCase() || "";
  };
  const destCountry = findCountry(toCode);
  const originCountry = findCountry(fromCode);
  if (!destCountry && !originCountry) return null;

  const subContinent = ["india", "bangladesh", "nepal", "sri lanka", "pakistan", "bhutan", "maldives", "afghanistan", "myanmar"];
  const southeastAsia = ["thailand", "singapore", "malaysia", "indonesia", "vietnam", "philippines", "cambodia", "laos", "brunei", "timor-leste"];
  const middleEast = ["united arab emirates", "saudi arabia", "qatar", "oman", "bahrain", "kuwait", "jordan", "iraq", "iran", "lebanon", "israel", "palestine", "yemen", "egypt"];
  const restOfAsia = ["china", "japan", "south korea", "taiwan", "hong kong", "mongolia", "uzbekistan", "kazakhstan", "kyrgyzstan", "tajikistan", "turkmenistan"];

  // Check if both origin and dest are in sub-continent
  const destIsSub = subContinent.includes(destCountry);
  const originIsSub = subContinent.includes(originCountry);

  if (destIsSub && originIsSub) return "indian-sub continent";
  if (southeastAsia.includes(destCountry) || middleEast.includes(destCountry) || restOfAsia.includes(destCountry)) return "south east";
  if (destIsSub || originIsSub) return "indian-sub continent"; // fallback for sub-continent routes
  // Everything else is Europe/other
  return "europe";
}

/** Filter Tripjack policyInfo to only show the relevant regional section */
function filterTjRegionalPolicy(text: string, fromCode: string, toCode: string): string {
  if (!text || !text.includes("Ex India to")) return text;

  const region = getTjRegion(fromCode, toCode);
  if (!region) return text;

  // Split by __nls__ and find the matching region block
  const lines = text.split("__nls__");
  const result: string[] = [];
  let capturing = false;
  let foundRegion = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Check if this line is a region header (__bs__Ex India to ...__be__)
    const isRegionHeader = /^[\s]*__bs__Ex India to/i.test(trimmed);

    if (isRegionHeader) {
      const lower = trimmed.toLowerCase();
      const matchesSub = region === "indian-sub continent" && lower.includes("indian-sub continent");
      const matchesSE = region === "south east" && (lower.includes("south east") || lower.includes("middle east") || lower.includes("rest of asia"));
      const matchesEU = region === "europe" && (lower.includes("europe") || lower.includes("istanbul"));

      if (matchesSub || matchesSE || matchesEU) {
        capturing = true;
        foundRegion = true;
        continue; // skip the header itself
      } else {
        capturing = false;
        continue;
      }
    }

    if (capturing && trimmed) {
      result.push(trimmed);
    } else if (!isRegionHeader && !foundRegion && trimmed && !trimmed.includes("__bs__")) {
      // Lines before any region header (e.g. "Cancellation permitted 06 Hrs before...")
      result.push(trimmed);
    }
  }

  return result.length > 0 ? result.join("__nls__") : text;
}

/** Parse Tripjack-style markup (__nls__ = newline, __bs__ = bold start, __be__ = bold end) into JSX.
 *  Currency amounts are already converted by the backend — no client-side conversion applied. */
function parseTjMarkup(text: string): React.ReactNode {
  if (!text || (!text.includes("__nls__") && !text.includes("__bs__"))) {
    return text;
  }
  const lines = text.split("__nls__").filter(Boolean);
  const elements: React.ReactNode[] = [];
  
  lines.forEach((line, li) => {
    let trimmed = line.trim();
    if (!trimmed) return;
    
    if (trimmed.includes("__bs__") || trimmed.includes("__be__")) {
      const parts = trimmed.split(/(__bs__|__be__)/);
      let bold = false;
      const spans: React.ReactNode[] = [];
      parts.forEach((part, pi) => {
        if (part === "__bs__") { bold = true; return; }
        if (part === "__be__") { bold = false; return; }
        if (!part.trim()) return;
        spans.push(
          bold 
            ? <span key={pi} className="font-semibold text-foreground">{part.trim()}</span>
            : <span key={pi}>{part}</span>
        );
      });
      elements.push(<div key={li} className="mt-1.5 mb-0.5">{spans}</div>);
    } else if (trimmed.match(/^(Before|Within)\s/)) {
      const [label, ...rest] = trimmed.split(":");
      elements.push(
        <div key={li} className="flex justify-between items-center py-0.5 pl-3 text-muted-foreground">
          <span className="text-[10px]">{label.trim()}</span>
          <span className="text-[10px] font-medium text-foreground">{rest.join(":").trim()}</span>
        </div>
      );
    } else {
      elements.push(<div key={li} className="text-[10px] text-muted-foreground">{trimmed}</div>);
    }
  });
  
  return <div className="space-y-0">{elements}</div>;
}

/** Format flight number: ensures "CZ 3405" format */
function formatFlightNum(carrier: string, flightNumber: string): string {
  const num = flightNumber.replace(/^[A-Z0-9]{2}\s*/i, (match) =>
    match.trim().toUpperCase() === carrier.toUpperCase() ? "" : match
  );
  return `${carrier} ${num}`.replace(/\s+/g, " ").trim();
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
  flightNumber?: string;
  source?: string;
  segments?: any[];
  isRefundable?: boolean;
  changePenalties?: any;
  cancelPenalties?: any;
  currency?: string;
  basePrice?: number;
  taxes?: number;
  baggageAllowance?: { cabin?: string; checkin?: string; embargo?: string[] } | null;
  paxPricing?: Record<string, { base: number; taxes: number; total: number }> | null;
}

interface FlightDetailsPanelProps {
  flight: Flight;
  airlineName: string;
  hasReturn: boolean;
  adults?: number;
  children?: number;
  infants?: number;
  studentFare?: boolean;
}

type Tab = "baggage" | "fare" | "policy";

function fmtTime(timeStr: string): string {
  if (!timeStr) return "--:--";
  if (timeStr.includes("T")) {
    try { return new Date(timeStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return timeStr; }
  }
  return timeStr;
}

function fmtDate(timeStr: string): string | null {
  if (!timeStr || !timeStr.includes("T")) return null;
  try { return format(new Date(timeStr), "dd MMM"); } catch { return null; }
}

function parsePenaltyAmount(raw: string): { amount: number; currency: string } | null {
  const match = raw.match(/^([A-Z]{3})([\d.]+)$/);
  if (match) return { currency: match[1], amount: parseFloat(match[2]) };
  return null;
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

function humanizeApplies(applies: string): string {
  const lower = applies.toLowerCase().trim();
  if (lower === "before" || lower === "before departure") return "Before Departure";
  if (lower === "after" || lower === "after departure") return "After Departure";
  if (lower === "anytime") return "Anytime";
  return applies;
}

/** Penalty amounts are already converted by the backend — use formatDirect (no conversion) */
function formatSinglePenalty(rawAmount: string, rawPercent: string, formatDirect: (p: number) => string, _flightSource?: string): string {
  if (rawAmount) {
    const parsed = parsePenaltyAmount(String(rawAmount));
    return parsed ? formatDirect(parsed.amount) : rawAmount;
  }
  if (rawPercent) {
    const pctVal = parseFloat(rawPercent);
    if (pctVal >= 100) return "Full fare forfeited";
    if (pctVal === 0) return "Free (no penalty)";
    return `${pctVal}% of fare`;
  }
  return "See airline policy";
}

type ParsedPenaltyValue = {
  type: "amount";
  currency: string;
  amount: number;
} | {
  type: "text";
  text: string;
}

interface PenaltyTiming {
  before?: ParsedPenaltyValue;
  after?: ParsedPenaltyValue;
  anytime?: ParsedPenaltyValue;
  noShow?: ParsedPenaltyValue;
}

interface ParsedFareRulePenalties {
  cancellation?: PenaltyTiming;
  change?: PenaltyTiming;
}

function parsePenaltiesFromFareRules(fareRules: { category: number; categoryName: string; text: string }[] | null): ParsedFareRulePenalties | null {
  if (!fareRules?.length) return null;
  const penaltyRule = fareRules.find(r => r.category === 16);
  if (!penaltyRule) return null;

  const text = penaltyRule.text.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
  const result: ParsedFareRulePenalties = {};

  const changeIdx = text.search(/\bCHANGES\b/i);
  const cancelIdx = text.search(/\bCANCELLATIONS?\b/i);

  const parseSection = (section: string): PenaltyTiming => {
    const parsed: PenaltyTiming = {};

    // Split off the NOTE section — penalties are declared BEFORE the NOTE
    const noteIdx = section.search(/\bNOTE\s*-/i);
    const mainPart = noteIdx > 0 ? section.substring(0, noteIdx) : section;

    // Check for BEFORE DEPARTURE ... CHARGE pattern (in main part only)
    const beforeChargeMatch = mainPart.match(/BEFORE\s+DEPARTURE[^]*?CHARGE\s+([A-Z]{3})\s*([\d,.]+)/i);
    const afterChargeMatch = mainPart.match(/AFTER\s+DEPARTURE[^]*?CHARGE\s+([A-Z]{3})\s*([\d,.]+)/i);
    
    // Check for non-refundable/not-permitted in main part
    const beforeNonRef = mainPart.match(/BEFORE\s+DEPARTURE[^]*?(NON[- ]?REFUNDABLE|NOT\s+PERMITTED)/i);
    const afterNonRef = mainPart.match(/AFTER\s+DEPARTURE[^]*?(NON[- ]?REFUNDABLE|NOT\s+PERMITTED)/i);

    // Anytime patterns — extract regular fee (non-no-show) and no-show fee separately
    // Regular fee: CHARGE CUR AMOUNT FOR REISSUE/REVALIDATION or CANCEL/REFUND (without NO-SHOW)
    const anytimeRegularMatch = mainPart.match(/CHARGE\s+([A-Z]{3})\s*([\d,.]+)\s+FOR\s+(?!NO-SHOW)(?:REISSUE|REVALIDATION|CANCEL|REFUND)/i);
    // No-show fee: CHARGE CUR AMOUNT FOR NO-SHOW
    const anytimeNoShowMatch = mainPart.match(/CHARGE\s+([A-Z]{3})\s*([\d,.]+)\s+FOR\s+NO-SHOW/i);
    // Also match "PER TICKET CHARGE" variant
    const anytimeRegularMatch2 = mainPart.match(/(?:PER\s+TICKET\s+)?CHARGE\s+([A-Z]{3})\s*([\d,.]+)\s+FOR\s+(?!NO-SHOW)(?:REISSUE|REVALIDATION|CANCEL|REFUND)/i);
    const anytimeNoShowMatch2 = mainPart.match(/(?:PER\s+TICKET\s+)?CHARGE\s+([A-Z]{3})\s*([\d,.]+)\s+FOR\s+NO-SHOW/i);

    const regularMatch = anytimeRegularMatch || anytimeRegularMatch2;
    const noShowMatch = anytimeNoShowMatch || anytimeNoShowMatch2;

    // Fallback: single CHARGE line (e.g. CA: "CHARGE CNY 300 FOR NO-SHOW/REISSUE/REVALIDATION")
    const anytimeSingleChargeMatch = mainPart.match(/ANY\s*TIME\s*\n\s*(?:PER\s+TICKET\s+)?CHARGE\s+([A-Z]{3})\s*([\d,.]+)/i);
    const anytimeNonRef = mainPart.match(/ANY\s*TIME\s*\n\s*TICKET\s+IS\s+NON[- ]?REFUNDABLE/i);
    const anytimeNotPermitted = mainPart.match(/ANY\s*TIME\s*\n\s*(?:CHANGES?\s+)?(?:ARE?\s+)?NOT\s+PERMITTED/i);

    if (beforeChargeMatch) parsed.before = { type: "amount", currency: beforeChargeMatch[1], amount: parseFloat(beforeChargeMatch[2].replace(/,/g, "")) };
    else if (beforeNonRef) parsed.before = { type: "text", text: beforeNonRef[1].includes("REFUND") ? "Non-Refundable" : "Not Permitted" };

    if (afterChargeMatch) parsed.after = { type: "amount", currency: afterChargeMatch[1], amount: parseFloat(afterChargeMatch[2].replace(/,/g, "")) };
    else if (afterNonRef) parsed.after = { type: "text", text: afterNonRef[1].includes("REFUND") ? "Non-Refundable" : "Not Permitted" };

    // If we found separate regular and no-show fees, use them
    if (regularMatch && noShowMatch) {
      parsed.anytime = { type: "amount", currency: regularMatch[1], amount: parseFloat(regularMatch[2].replace(/,/g, "")) };
      parsed.noShow = { type: "amount", currency: noShowMatch[1], amount: parseFloat(noShowMatch[2].replace(/,/g, "")) };
    } else if (anytimeSingleChargeMatch) {
      // Single charge for both (e.g. CA "CHARGE CNY 300 FOR NO-SHOW/REISSUE/REVALIDATION")
      parsed.anytime = { type: "amount", currency: anytimeSingleChargeMatch[1], amount: parseFloat(anytimeSingleChargeMatch[2].replace(/,/g, "")) };
    } else if (anytimeNonRef) {
      parsed.anytime = { type: "text", text: "Non-Refundable" };
    } else if (anytimeNotPermitted) {
      parsed.anytime = { type: "text", text: "Not Permitted" };
    }

    return (parsed.before || parsed.after || parsed.anytime || parsed.noShow) ? parsed : {};
  };

  if (changeIdx >= 0) {
    const changeSection = cancelIdx > changeIdx ? text.substring(changeIdx, cancelIdx) : text.substring(changeIdx);
    result.change = parseSection(changeSection);
  }

  if (cancelIdx >= 0) {
    const cancelSection = text.substring(cancelIdx);
    result.cancellation = parseSection(cancelSection);
  }

  return (result.change || result.cancellation) ? result : null;
}

interface PenaltyLine { label: string; value: string }

function buildPenaltyLines(penalty: any, formatDirect?: (p: number) => string): PenaltyLine[] {
  if (!penalty) return [];
  
  const fmtDirect = formatDirect || ((p: number) => String(p));
  
  if (Array.isArray(penalty)) {
    const beforeEntries: PenaltyLine[] = [];
    const afterEntries: PenaltyLine[] = [];
    const anytimeEntries: PenaltyLine[] = [];
    
    for (const p of penalty) {
      const applies = (p.applies || p.PenaltyApplies || "").toLowerCase().trim();
      const rawAmount = p.amount || p.Amount || p.PenaltyAmount || "";
      const rawPercent = p.percentage || "";
      
      // Use backend-converted displayAmount when available
      let value: string;
      if (p.displayAmount != null) {
        value = fmtDirect(p.displayAmount);
      } else {
        value = formatSinglePenalty(rawAmount, rawPercent, fmtDirect);
      }
      
      if (applies === "before" || applies === "before departure") {
        beforeEntries.push({ label: "Before Departure", value });
      } else if (applies === "after" || applies === "after departure") {
        afterEntries.push({ label: "After Departure", value });
      } else {
        anytimeEntries.push({ label: "Anytime", value });
      }
    }
    
    if (beforeEntries.length > 0 && afterEntries.length > 0) {
      return [...beforeEntries, ...afterEntries];
    }
    if (beforeEntries.length > 0 || afterEntries.length > 0) {
      return [...beforeEntries, ...afterEntries, ...anytimeEntries];
    }
    if (anytimeEntries.length > 0) {
      const amountEntry = anytimeEntries.find(e => !e.value.includes("%") && !e.value.includes("forfeited") && !e.value.includes("Free"));
      const meaningful = amountEntry || anytimeEntries.find(e => !e.value.includes("Free") && !e.value.includes("0%"));
      return [{ label: "Anytime", value: meaningful?.value || anytimeEntries[0].value }];
    }
    return [...beforeEntries, ...afterEntries];
  }
  
  if (penalty && typeof penalty === "object") {
    const rawAmount = penalty.PenaltyAmount || penalty.Amount || penalty.amount || "";
    const rawPercent = penalty.percentage || "";
    const applies = (penalty.PenaltyApplies || penalty.applies || "").toLowerCase().trim();
    
    let value: string;
    if (penalty.displayAmount != null) {
      value = fmtDirect(penalty.displayAmount);
    } else {
      value = formatSinglePenalty(rawAmount, rawPercent, fmtDirect);
    }
    
    const label = applies === "before" || applies === "before departure" ? "Before Departure"
      : applies === "after" || applies === "after departure" ? "After Departure" : "";
    return [{ label, value }];
  }
  
  return [];
}

const FlightDetailsPanel = ({ flight, airlineName, hasReturn, adults = 1, children = 0, infants = 0, studentFare = false }: FlightDetailsPanelProps) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("fare");
  const { formatDirectPrice, currency: displayCurrency } = useCurrency();
  const taxSettings = useTaxSettings();
  const flightSource = flight.source;

  // Live per-fare details (baggage + policy) fetched once per flight when needed
  const [baggageData, setBaggageData] = useState<{ cabin?: string; checkin?: string; embargo?: string[] } | null>(null);
  const [verifiedPolicy, setVerifiedPolicy] = useState<{
    isRefundable?: boolean;
    changePenalty?: any;
    cancelPenalty?: any;
    noShowPenalty?: any;
  } | null>(null);
  const [fareRuleKeys, setFareRuleKeys] = useState<any[] | null>(null);
  const [fareRuleLookups, setFareRuleLookups] = useState<any[] | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsFetchedFor, setDetailsFetchedFor] = useState<string | null>(null);

  // Full fare rules dialog state
  const [fareRulesOpen, setFareRulesOpen] = useState(false);
  const [fareRules, setFareRules] = useState<{ category: number; categoryName: string; text: string }[] | null>(null);
  const [fareRulesLoading, setFareRulesLoading] = useState(false);

  // Reset state safely when flight changes
  useEffect(() => {
    setBaggageData(null);
    setVerifiedPolicy(null);
    setFareRuleKeys(null);
    setFareRuleLookups(null);
    setDetailsLoading(false);
    setDetailsFetchedFor(null);
    setFareRules(null);
  }, [flight.id]);

  const shouldFetchLiveDetails =
    open &&
    (tab === "baggage" || tab === "policy") &&
    detailsFetchedFor !== flight.id &&
    !detailsLoading &&
    !!flight.segments?.length &&
    (flight.source === "travelport" || flight.source === "tripjack");

  useEffect(() => {
    if (!shouldFetchLiveDetails) return;

    setDetailsLoading(true);
    setDetailsFetchedFor(flight.id);

    if (flight.source === "travelport") {
      // Travelport: use travelport-price endpoint with targetCurrency for backend conversion
      supabase.functions
        .invoke("travelport-price", {
          body: {
            segments: flight.segments!.map((seg: any) => ({
              key: seg.key,
              carrier: seg.carrier || flight.airline,
              flightNumber: seg.flightNumber || "",
              origin: seg.origin,
              destination: seg.destination,
              departure: seg.departure,
              arrival: seg.arrival,
              bookingCode: seg.bookingCode || seg.classOfService || "Y",
              group: seg.group ?? 0,
            })),
            adults,
            children,
            infants,
            cabinClass: flight.class || "Economy",
            studentFare,
            targetCurrency: displayCurrency,
          },
        })
        .then(({ data }) => {
          if (data?.baggageAllowance) setBaggageData(data.baggageAllowance);
          if (data?.fareRuleKeys?.length) setFareRuleKeys(data.fareRuleKeys);
          if (data?.fareRuleLookups?.length) setFareRuleLookups(data.fareRuleLookups);
          if (data?.fareRules?.length) setFareRules(data.fareRules);
          if (data?.success && data?.verified) {
            setVerifiedPolicy({
              isRefundable: data.isRefundable,
              changePenalty: data.changePenalty,
              cancelPenalty: data.cancelPenalty,
            });
          }
        })
        .catch(() => {})
        .finally(() => setDetailsLoading(false));
    } else if (flight.source === "tripjack") {
      // Tripjack: use tripjack-fare-rules for policy, use search-response baggage
      const tjPriceId = (flight as any).tripjackPriceId;

      // Set baggage from search response immediately
      const tjCabin = (flight as any).cabinBaggage;
      const tjCheckin = (flight as any).checkinBaggage;
      if (tjCabin || tjCheckin) {
        setBaggageData({ cabin: tjCabin || undefined, checkin: tjCheckin || undefined });
      }

      // Set refundable from search response
      const tjRefundType = (flight as any).refundType;
      const tjIsRefundable = tjRefundType === 1;
      const tjIsPartialRefundable = tjRefundType === 2;

      // Fetch fare rules for policy data
      if (tjPriceId) {
      supabase.functions
          .invoke("tripjack-fare-rules", {
            body: { priceId: tjPriceId, flowType: "SEARCH", targetCurrency: displayCurrency },
          })
          .then(({ data }) => {
            if (data?.success && data?.rules?.length) {
              // Parse mini rules into cancel/change penalty format
              const firstRule = data.rules[0];
              if (firstRule?.type === "mini" && firstRule?.rules) {
                const cancelRule = firstRule.rules.CANCELLATION;
                const changeRule = firstRule.rules.DATECHANGE;
                const noShowRule = firstRule.rules.NO_SHOW;

                const buildTjPenalty = (rule: any) => {
                  if (!rule?.policies?.length) return null;
                  const policies = rule.policies;
                  const beforeDep = policies.find((p: any) => p.pp === "BEFORE_DEPARTURE");
                  const afterDep = policies.find((p: any) => p.pp === "AFTER_DEPARTURE");

                  if (beforeDep || afterDep) {
                    return {
                      _tripjackSplit: true,
                      before: beforeDep ? {
                        amount: beforeDep.amount ? String(beforeDep.amount) : undefined,
                        displayAmount: beforeDep.displayAmount,
                        displayAdditionalFee: beforeDep.displayAdditionalFee,
                        policyInfo: beforeDep.policyInfo,
                        additionalFee: beforeDep.additionalFee,
                        displayCurrency: beforeDep.displayCurrency,
                      } : null,
                      after: afterDep ? {
                        amount: afterDep.amount ? String(afterDep.amount) : undefined,
                        displayAmount: afterDep.displayAmount,
                        displayAdditionalFee: afterDep.displayAdditionalFee,
                        policyInfo: afterDep.policyInfo,
                        additionalFee: afterDep.additionalFee,
                        displayCurrency: afterDep.displayCurrency,
                      } : null,
                    };
                  }

                  const p = policies[0];
                  return {
                    amount: p.amount ? String(p.amount) : undefined,
                    displayAmount: p.displayAmount,
                    displayAdditionalFee: p.displayAdditionalFee,
                    policyInfo: p.policyInfo,
                    additionalFee: p.additionalFee,
                    displayCurrency: p.displayCurrency,
                  };
                };

                setVerifiedPolicy({
                  isRefundable: tjIsRefundable,
                  cancelPenalty: buildTjPenalty(cancelRule),
                  changePenalty: buildTjPenalty(changeRule),
                  noShowPenalty: buildTjPenalty(noShowRule),
                });

                // Store fare rule info from search response
                if ((flight as any).fareRuleInfo) {
                  // Use fareRuleInformation from search if available
                }
              } else if (firstRule?.type === "cat16" && firstRule?.text) {
                // Cat 16 unstructured text
                setFareRules([{
                  category: 16,
                  categoryName: `Fare Rules — ${firstRule.route}`,
                  text: firstRule.text,
                }]);
                setVerifiedPolicy({
                  isRefundable: tjIsRefundable,
                  cancelPenalty: null,
                  changePenalty: null,
                  noShowPenalty: null,
                });
              } else {
                setVerifiedPolicy({
                  isRefundable: tjIsRefundable,
                  cancelPenalty: null,
                  changePenalty: null,
                  noShowPenalty: null,
                });
              }
            } else {
              // No fare rules available, still show refundable status
              setVerifiedPolicy({
                isRefundable: tjIsRefundable,
                cancelPenalty: null,
                changePenalty: null,
                noShowPenalty: null,
              });
            }
          })
          .catch(() => {
            // Fallback: at least show refundable status
            setVerifiedPolicy({
              isRefundable: tjIsRefundable,
              cancelPenalty: null,
              changePenalty: null,
              noShowPenalty: null,
            });
          })
          .finally(() => setDetailsLoading(false));
      } else {
        // No priceId, just show search-level data
        setVerifiedPolicy({
          isRefundable: tjIsRefundable,
          cancelPenalty: null,
          changePenalty: null,
          noShowPenalty: null,
        });
        setDetailsLoading(false);
      }
    }
  }, [
    shouldFetchLiveDetails,
    flight.id,
    flight.airline,
    flight.segments,
    flight.class,
    flight.source,
    adults,
    children,
    infants,
    studentFare,
  ]);

  // Priority: live API baggage > search baggage
  const effectiveBaggage = baggageData || flight.baggageAllowance;
  // Policy: use ONLY live-verified data (no search cache fallback)
  const effectiveCancelPenalty = verifiedPolicy?.cancelPenalty ?? null;
  const effectiveChangePenalty = verifiedPolicy?.changePenalty ?? null;
  const effectiveNoShowPenalty = verifiedPolicy?.noShowPenalty ?? null;
  const rawRefundable = verifiedPolicy ? verifiedPolicy.isRefundable : undefined;
  const effectiveRefundable = effectiveCancelPenalty && isCancelPenalty100Percent(effectiveCancelPenalty) ? false : rawRefundable;
  const policyAvailable = verifiedPolicy !== null;
  // Parse fare rules Category 16 for structured before/after departure penalties
  const fareRulePenalties = parsePenaltiesFromFareRules(fareRules);

  const handleTabClick = (key: Tab) => {
    setTab(key);
  };

  const fetchFullFareRules = () => {
    // Fare rules are now loaded from pricing response, just open dialog
    if (fareRules?.length) {
      setFareRulesOpen(true);
      return;
    }

    // Always open popup even when rules are unavailable
    setFareRulesOpen(true);

    // Fallback: try separate fare rules call if we have lookups
    if (fareRulesLoading) return;

    // Tripjack: fetch fare rules via tripjack-fare-rules
    if (flight.source === "tripjack") {
      const tjPriceId = (flight as any).tripjackPriceId;
      if (!tjPriceId) {
        setFareRules([]);
        return;
      }
      setFareRulesLoading(true);
      supabase.functions
        .invoke("tripjack-fare-rules", {
          body: { priceId: tjPriceId, flowType: "SEARCH", targetCurrency: displayCurrency },
        })
        .then(({ data }) => {
          if (data?.success && data?.rules?.length) {
            const formattedRules: { category: number; categoryName: string; text: string }[] = [];
            for (const rule of data.rules) {
              if (rule.type === "cat16" && rule.text) {
                formattedRules.push({ category: 16, categoryName: `Fare Rules — ${rule.route}`, text: rule.text });
              } else if (rule.type === "mini" && rule.rules) {
                // Format mini rules as readable text
                for (const [ruleType, ruleData] of Object.entries(rule.rules as Record<string, any>)) {
                  const policies = ruleData.policies || [];
                  const lines = policies.map((p: any) => {
                    const parts: string[] = [];
                    if (p.pp) parts.push(`Period: ${p.pp.replace(/_/g, " ")}`);
                    if (p.policyInfo) parts.push(p.policyInfo);
                    if (p.policyInfo) parts.push(p.policyInfo);
                    return parts.join("\n");
                  }).join("\n\n");
                  formattedRules.push({
                    category: ruleType === "CANCELLATION" ? 16 : ruleType === "DATECHANGE" ? 31 : 0,
                    categoryName: ruleType.replace(/_/g, " "),
                    text: lines || "No details available",
                  });
                }
              }
            }
            setFareRules(formattedRules.length > 0 ? formattedRules : []);
          } else {
            setFareRules([]);
          }
        })
        .catch(() => setFareRules([]))
        .finally(() => setFareRulesLoading(false));
      return;
    }

    // Travelport fallback
    if (!fareRuleLookups?.length) {
      setFareRules([]);
      return;
    }

    setFareRulesLoading(true);
    supabase.functions
      .invoke("travelport-fare-rules", {
        body: { fareRuleLookups, targetCurrency: displayCurrency },
      })
      .then(({ data }) => {
        if (data?.success && data?.rules?.length) {
          setFareRules(data.rules);
        } else {
          setFareRules([]);
        }
      })
      .catch(() => setFareRules([]))
      .finally(() => setFareRulesLoading(false));
  };

  // Use API-provided base/tax if available, otherwise calculate
  const apiBasePrice = flight.basePrice;
  const apiTaxes = flight.taxes;
  const paxP = flight.paxPricing;
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
  // Prices are already converted by the backend — use raw values directly
  const dispPerAdultBase = perAdultBase;
  const dispPerAdultTax = perAdultTax;
  const dispPerAdultTotal = dispPerAdultBase + dispPerAdultTax;
  const dispAdultTotal = dispPerAdultTotal * adults;

  const dispChildBase = childBase ?? 0;
  const dispChildTax = childTax ?? 0;
  const dispPerChildTotal = dispChildBase + dispChildTax;
  const dispChildTotal = dispPerChildTotal * children;

  const dispInfantBase = infantBase ?? 0;
  const dispInfantTax = infantTax ?? 0;
  const dispPerInfantTotal = dispInfantBase + dispInfantTax;
  const dispInfantTotal = dispPerInfantTotal * infants;

  const dispSubtotal = dispAdultTotal + dispChildTotal + dispInfantTotal;
  const subtotal = adultTotal + childTotal + infantTotal;
  const convenienceFee = Math.round(subtotal * (taxSettings.convenienceFeePercentage / 100));
  const dispConvenienceFee = Math.round(dispSubtotal * (taxSettings.convenienceFeePercentage / 100));
  const dispTotal = dispSubtotal + dispConvenienceFee;
  const total = subtotal + convenienceFee;
  const totalPax = adults + children + infants;
  const fmtDisp = (v: number) => `${CURRENCIES[displayCurrency].symbol}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const segments = flight.segments && flight.segments.length > 0 ? flight.segments : null;

  const tabConfig = [
    { key: "fare" as Tab, label: "Fare", icon: Clock },
    { key: "baggage" as Tab, label: "Baggage", icon: Luggage },
    { key: "policy" as Tab, label: "Policy", icon: Shield },
  ];

  return (
    <>
    <div className="border-t border-border/60">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 md:px-5 py-2.5 text-sm font-medium text-primary hover:bg-muted/20 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plane className="w-3.5 h-3.5" />
          Flight Details
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 md:px-5 pb-4 md:pb-5 border-t border-border/40">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 pt-3 md:pt-4">
                {/* Left: Segment details */}
                <div className="space-y-3 md:space-y-4">
                  <h4 className="text-xs md:text-sm font-semibold text-foreground flex items-center gap-2">
                    <span className="w-1 h-3.5 md:h-4 bg-primary rounded-full" />
                    Route Details
                  </h4>

                  {/* Segments or single route */}
                  {segments ? (<>{segments.map((seg: any, idx: number) => {
                    const segDur = seg.departure && seg.arrival && seg.departure.includes("T") && seg.arrival.includes("T")
                      ? (() => { const mins = Math.round((new Date(seg.arrival).getTime() - new Date(seg.departure).getTime()) / 60000); const h = Math.floor(mins / 60); const m = mins % 60; return mins > 0 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : null; })()
                      : null;
                    const layoverDur = idx < segments.length - 1 && seg.arrival && segments[idx + 1].departure && seg.arrival.includes("T") && segments[idx + 1].departure.includes("T")
                      ? (() => { const mins = Math.round((new Date(segments[idx + 1].departure).getTime() - new Date(seg.arrival).getTime()) / 60000); const h = Math.floor(mins / 60); const m = mins % 60; return mins > 0 ? (h > 0 ? `${h}h ${m}m` : `${m}m`) : null; })()
                      : null;
                    return (
                    <div key={idx}>
                      <div className="bg-muted/20 rounded-lg md:rounded-xl p-2.5 md:p-3.5 border border-border/30">
                        <div className="flex items-start gap-1.5 md:gap-2 mb-2 md:mb-3">
                          <div className="w-6 h-6 md:w-7 md:h-7 rounded-md md:rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img src={`https://pics.avs.io/56/56/${seg.carrier || flight.airline}.png`} alt="" className="w-4 h-4 md:w-5 md:h-5 object-contain"
                              onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.innerHTML = '<span class="text-[9px] md:text-[10px] font-bold text-primary">' + (seg.carrier || flight.airline) + '</span>'; }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] md:text-xs font-semibold text-foreground leading-tight">
                              {getAirlineName(seg.carrier || flight.airline)}
                            </p>
                            <p className="text-[9px] md:text-[10px] text-muted-foreground leading-snug">
                              {seg.flightNumber ? <span className="font-medium text-foreground/80">{formatFlightNum(seg.carrier || flight.airline, seg.flightNumber)}</span> : null}
                              {seg.flightNumber ? <span className="mx-1 text-border">|</span> : null}
                              <span>{flight.class}</span>
                              {seg.bookingCode && <span className="font-semibold text-primary"> ({seg.bookingCode})</span>}
                              {(flight as any).fareIdentifier && (flight as any).fareIdentifier !== "PUBLISHED" && (
                                <span className="ml-1 text-primary/70 font-medium"> • {(flight as any).fareIdentifier}</span>
                              )}
                            </p>
                            {seg.operatingCarrier && seg.operatingCarrier !== (seg.carrier || flight.airline) && (
                              <p className="text-[8px] md:text-[9px] text-accent truncate">Operated by {getAirlineName(seg.operatingCarrier)}</p>
                            )}
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center items-end gap-1 flex-shrink-0 ml-1">
                            {segDur && (
                              <Badge variant="outline" className="text-[9px] md:text-[10px] h-4 md:h-5 px-1.5">
                                <Clock className="w-2 h-2 md:w-2.5 md:h-2.5 mr-0.5" />{segDur}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[9px] md:text-[10px] h-4 md:h-5 px-1.5">Seg {idx + 1}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="text-right min-w-[45px] md:min-w-[55px]">
                            <p className="text-xs md:text-sm font-bold text-foreground">{fmtTime(seg.departure)}</p>
                            {fmtDate(seg.departure) && <p className="text-[9px] md:text-[10px] text-muted-foreground">{fmtDate(seg.departure)}</p>}
                            <p className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{seg.origin}</p>
                          </div>
                          <div className="flex-1 flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <div className="flex-1 h-px bg-primary/30" />
                            <Plane className="w-3 h-3 text-primary" />
                          </div>
                          <div className="text-left min-w-[45px] md:min-w-[55px]">
                            <p className="text-xs md:text-sm font-bold text-foreground">{fmtTime(seg.arrival)}</p>
                            {fmtDate(seg.arrival) && <p className="text-[9px] md:text-[10px] text-muted-foreground">{fmtDate(seg.arrival)}</p>}
                            <p className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{seg.destination}</p>
                          </div>
                        </div>
                      </div>
                      {idx < segments.length - 1 && (
                        <div className="flex items-center gap-1.5 text-[9px] md:text-[10px] text-accent font-medium bg-accent/5 rounded-md px-2.5 md:px-3 py-1 md:py-1.5 my-1.5 md:my-2 border border-accent/10">
                          <Clock className="w-2.5 h-2.5 md:w-3 md:h-3" /> Layover at {seg.destination}{layoverDur ? ` · ${layoverDur}` : ""}
                        </div>
                      )}
                    </div>
                    );
                  })}</>) : (
                    /* Single route */
                    <div className="bg-muted/20 rounded-lg md:rounded-xl p-3 md:p-4 border border-border/30">
                      <div className="flex items-center gap-2 mb-2 md:mb-3">
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-md md:rounded-lg bg-primary/5 border border-border/50 flex items-center justify-center overflow-hidden">
                          <img src={`https://pics.avs.io/64/64/${flight.airline}.png`} alt={airlineName} className="w-5 h-5 md:w-6 md:h-6 object-contain"
                            onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px] md:text-xs font-bold text-primary">' + flight.airline + '</span>'; }}
                          />
                        </div>
                        <div>
                          <p className="text-xs md:text-sm font-semibold text-foreground">{airlineName}</p>
                          <p className="text-[9px] md:text-[10px] text-muted-foreground">
                            {flight.flightNumber ? <span className="font-medium text-foreground/80">{formatFlightNum(flight.airline, flight.flightNumber)}</span> : <span>{flight.airline}</span>}
                            <span className="mx-1 text-border">|</span>
                            <span>{flight.class}</span>
                            {flight.segments?.[0]?.bookingCode && <span className="font-semibold text-primary"> ({flight.segments[0].bookingCode})</span>}
                            {(flight as any).fareIdentifier && (flight as any).fareIdentifier !== "PUBLISHED" && (
                              <span className="ml-1 text-primary/70 font-medium"> • {(flight as any).fareIdentifier}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3">
                        <div className="text-right min-w-[45px] md:min-w-[55px]">
                          <p className="text-sm md:text-base font-bold text-foreground">{fmtTime(flight.departure)}</p>
                          {fmtDate(flight.departure) && <p className="text-[9px] md:text-[10px] text-muted-foreground">{fmtDate(flight.departure)}</p>}
                          <p className="text-[10px] md:text-xs font-medium text-muted-foreground">{flight.from_city}</p>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="relative w-full h-[2px] bg-primary/20 rounded-full">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full border-2 border-primary bg-background" />
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full border-2 border-primary bg-primary" />
                            {flight.stops > 0 && Array.from({ length: flight.stops }).map((_, s) => (
                              <div key={s} className="w-1.5 h-1.5 rounded-full bg-accent border border-background absolute top-1/2" style={{ left: `${((s + 1) / (flight.stops + 1)) * 100}%`, transform: 'translate(-50%, -50%)' }} />
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 md:gap-2 text-[9px] md:text-[10px] text-muted-foreground">
                            <span>{flight.duration}</span>
                            <span>·</span>
                            <span className={flight.stops === 0 ? "text-green-600 dark:text-green-400 font-medium" : ""}>{flight.stops === 0 ? "Non-stop" : `${flight.stops} Stop`}</span>
                          </div>
                        </div>
                        <div className="text-left min-w-[45px] md:min-w-[55px]">
                          <p className="text-sm md:text-base font-bold text-foreground">{fmtTime(flight.arrival)}</p>
                          {fmtDate(flight.arrival) && <p className="text-[9px] md:text-[10px] text-muted-foreground">{fmtDate(flight.arrival)}</p>}
                          <p className="text-[10px] md:text-xs font-medium text-muted-foreground">{flight.to_city}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Return leg for non-segment flights */}
                  {hasReturn && !segments && (
                    <div className="bg-muted/20 rounded-xl p-4 border border-border/30">
                      <Badge variant="secondary" className="mb-2 text-[10px]">Return</Badge>
                      <div className="flex items-center gap-3">
                        <div className="text-right min-w-[55px]">
                          <p className="text-base font-bold text-foreground">{fmtTime(flight.arrival)}</p>
                          <p className="text-xs font-medium text-muted-foreground">{flight.to_city}</p>
                        </div>
                        <div className="flex-1 flex flex-col items-center gap-0.5">
                          <div className="relative w-full h-[2px] bg-primary/20 rounded-full">
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-primary bg-background" />
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-primary bg-primary" />
                          </div>
                          <span className="text-[10px] text-muted-foreground">{flight.duration}</span>
                        </div>
                        <div className="text-left min-w-[55px]">
                          <p className="text-base font-bold text-foreground">{fmtTime(flight.departure)}</p>
                          <p className="text-xs font-medium text-muted-foreground">{flight.from_city}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Tabs */}
                <div>
                  <div className="relative flex bg-muted/20 rounded-xl p-1 mb-3 md:mb-4 border border-border/30 backdrop-blur-sm">
                    {tabConfig.map((t) => {
                      const isActive = tab === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => handleTabClick(t.key)}
                          className={cn(
                            "relative flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 text-[11px] md:text-xs font-semibold rounded-lg transition-all duration-200",
                            isActive
                              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                          )}
                        >
                          <t.icon className={cn("w-3.5 h-3.5 md:w-4 md:h-4 transition-transform duration-200", isActive && "scale-110")} />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>

                  {tab === "baggage" && (
                    <div className="space-y-2">
                      {detailsLoading ? (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-xs text-muted-foreground">Loading baggage info...</span>
                        </div>
                      ) : effectiveBaggage ? (
                        <>
                          {effectiveBaggage.cabin && (
                            <div className="flex items-center justify-between bg-muted/20 rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 border border-border/30">
                              <div className="flex items-center gap-1.5 md:gap-2">
                                <Luggage className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground" />
                                <span className="text-xs md:text-sm text-foreground">Cabin</span>
                              </div>
                              <span className="text-xs md:text-sm font-semibold text-foreground">{effectiveBaggage.cabin}</span>
                            </div>
                          )}
                          {effectiveBaggage.checkin && (
                            <div className="flex items-center justify-between bg-muted/20 rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 border border-border/30">
                              <div className="flex items-center gap-1.5 md:gap-2">
                                <Luggage className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground" />
                                <span className="text-xs md:text-sm text-foreground">Check-in</span>
                              </div>
                              <span className="text-xs md:text-sm font-semibold text-foreground">{effectiveBaggage.checkin}</span>
                            </div>
                          )}
                          {effectiveBaggage.embargo && effectiveBaggage.embargo.length > 0 && (
                            <div className="flex items-start gap-1.5 bg-accent/5 rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 border border-accent/10">
                              <AlertCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-accent mt-0.5 flex-shrink-0" />
                              <span className="text-[10px] md:text-xs text-accent">{effectiveBaggage.embargo.join("; ")}</span>
                            </div>
                          )}
                          <p className="text-[9px] md:text-[10px] text-muted-foreground/60 mt-1">
                            Fare-specific baggage allowance
                          </p>
                        </>
                      ) : (
                        <div className="flex items-start gap-2 bg-muted/20 rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 border border-border/30">
                          <AlertCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground text-[11px] md:text-xs">Baggage information not available from the provider. Please check with the airline directly.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "fare" && (
                    <div className="space-y-1.5 text-xs md:text-sm">
                      {/* Adult breakdown */}
                      <div className="bg-muted/20 rounded-lg px-2.5 md:px-3 py-2 border border-border/30">
                        <p className="text-[9px] md:text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 md:mb-1.5">Adult{adults > 1 ? ` × ${adults}` : ""}</p>
                        {hasApiPricing ? (
                           <>
                            <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Base Fare</span><span className="text-foreground font-medium">{fmtDisp(dispPerAdultBase)}</span></div>
                            <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Taxes & Fees</span><span className="text-foreground font-medium">{fmtDisp(dispPerAdultTax)}</span></div>
                          </>
                        ) : (
                          <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Fare</span><span className="text-foreground font-medium">{fmtDisp(Number(flight.price))}</span></div>
                        )}
                        <div className="border-t border-border/40 mt-1 pt-1 flex justify-between">
                          <span className="text-muted-foreground font-medium">Adult Total</span>
                          <span className="text-foreground font-semibold">
                            {adults > 1 ? <span className="text-muted-foreground font-normal text-xs mr-1">({fmtDisp(dispPerAdultTotal)} × {adults})</span> : null}
                            {fmtDisp(dispAdultTotal)}
                          </span>
                        </div>
                      </div>

                      {/* Child breakdown */}
                      {children > 0 && (
                        <div className="bg-muted/20 rounded-lg px-3 py-2 border border-border/30">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Child{children > 1 ? ` × ${children}` : ""}</p>
                          {hasApiPricing ? (
                            <>
                              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Base Fare</span><span className="text-foreground font-medium">{fmtDisp(dispChildBase)}</span></div>
                              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Taxes & Fees</span><span className="text-foreground font-medium">{fmtDisp(dispChildTax)}</span></div>
                            </>
                          ) : (
                            <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Fare</span><span className="text-foreground font-medium">{fmtDisp(childPrice)}</span></div>
                          )}
                          <div className="border-t border-border/40 mt-1 pt-1 flex justify-between">
                            <span className="text-muted-foreground font-medium">Child Total</span>
                            <span className="text-foreground font-semibold">
                              {children > 1 ? <span className="text-muted-foreground font-normal text-xs mr-1">({fmtDisp(dispPerChildTotal)} × {children})</span> : null}
                              {fmtDisp(dispChildTotal)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Infant breakdown */}
                      {infants > 0 && (
                        <div className="bg-muted/20 rounded-lg px-3 py-2 border border-border/30">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Infant{infants > 1 ? ` × ${infants}` : ""}</p>
                          {hasApiPricing ? (
                            <>
                              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Base Fare</span><span className="text-foreground font-medium">{fmtDisp(dispInfantBase)}</span></div>
                              <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Taxes & Fees</span><span className="text-foreground font-medium">{fmtDisp(dispInfantTax)}</span></div>
                            </>
                          ) : (
                            <div className="flex justify-between py-0.5"><span className="text-muted-foreground">Fare</span><span className="text-foreground font-medium">{fmtDisp(infantPrice)}</span></div>
                          )}
                          <div className="border-t border-border/40 mt-1 pt-1 flex justify-between">
                            <span className="text-muted-foreground font-medium">Infant Total</span>
                            <span className="text-foreground font-semibold">
                              {infants > 1 ? <span className="text-muted-foreground font-normal text-xs mr-1">({fmtDisp(dispPerInfantTotal)} × {infants})</span> : null}
                              {fmtDisp(dispInfantTotal)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Admin charges */}
                       {convenienceFee > 0 && (
                        <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">Convenience Fee</span><span className="text-foreground font-medium">{fmtDisp(dispConvenienceFee)}</span></div>
                        </div>
                       )}
                    </div>
                  )}

                  {tab === "policy" && (
                    <div className="space-y-2.5 text-sm">
                      {detailsLoading ? (
                        <div className="flex items-center justify-center py-4 gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          <span className="text-muted-foreground text-xs">Fetching live policy…</span>
                        </div>
                      ) : policyAvailable ? (
                        <>
                          {/* Refundable / Non-refundable badge */}
                          {effectiveRefundable === false && (
                            <div className="flex items-center gap-2 bg-destructive/5 rounded-xl px-3.5 py-2.5 border border-destructive/15">
                              <div className="w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                <AlertCircle className="w-3 h-3 text-destructive" />
                              </div>
                              <span className="text-destructive text-xs font-semibold">Non-refundable ticket</span>
                            </div>
                          )}
                          {effectiveRefundable === true && (
                            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/10 rounded-xl px-3.5 py-2.5 border border-green-200 dark:border-green-800/30">
                              <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-800/20 flex items-center justify-center flex-shrink-0">
                                <Shield className="w-3 h-3 text-green-600 dark:text-green-400" />
                              </div>
                              <span className="text-green-700 dark:text-green-400 text-xs font-semibold">Refundable ticket</span>
                            </div>
                          )}

                          {/* Cancellation & Date Change cards */}
                          {(() => {
                            const fmtPv = (pv: ParsedPenaltyValue): string => {
                              if (pv.type === "amount") {
                                return formatDirectPrice(pv.amount);
                              }
                              return pv.text;
                            };
                            const valColor = (v: string) => cn("font-semibold text-xs", v === "Full fare forfeited" || v === "Non-Refundable" || v === "Not Permitted" ? "text-destructive" : v.includes("Free") ? "text-green-600 dark:text-green-400" : "text-foreground");

                            const renderPolicyCard = (title: string, icon: React.ReactNode, frp: PenaltyTiming | undefined, fallbackPenalty: any) => {
                              // Non-refundable cancellation override
                              if (title === "Cancellation" && effectiveRefundable === false) {
                                return (
                                  <div className="bg-muted/20 rounded-xl px-3.5 py-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      {icon}
                                      <span className="font-semibold text-foreground text-xs">{title}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground text-xs">Fee</span>
                                      <span className="text-destructive font-semibold text-xs">Full fare forfeited</span>
                                    </div>
                                    <div className="flex items-start gap-1.5 mt-2 bg-muted/30 rounded-lg px-2.5 py-1.5 border border-border/20">
                                      <AlertCircle className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                                      <span className="text-[10px] text-muted-foreground leading-relaxed">Unused government and airport taxes will be refunded where applicable.</span>
                                    </div>
                                  </div>
                                );
                              }

                              // Handle Tripjack split penalties
                              if (fallbackPenalty?._tripjackSplit) {
                                const beforeInfo = fallbackPenalty.before;
                                const afterInfo = fallbackPenalty.after;
                                const fmtTjAmount = (p: any) => {
                                  if (!p) return "Not Applicable";
                                  if (p.policyInfo?.toLowerCase().includes("not applicable") || p.policyInfo?.toLowerCase().includes("not available")) return "Not Permitted";
                                  // Use backend-converted displayAmount when available
                                  if (p.displayAmount != null) {
                                    const totalFee = p.displayAmount + (p.displayAdditionalFee || 0);
                                    return formatDirectPrice(totalFee);
                                  }
                                  if (p.amount) {
                                    const totalFee = Number(p.amount) + (Number(p.additionalFee) || 0);
                                    return formatDirectPrice(totalFee);
                                  }
                                  return p.policyInfo || "See airline policy";
                                };
                                const beforeVal = fmtTjAmount(beforeInfo);
                                const afterVal = fmtTjAmount(afterInfo);
                                const hasSplit = beforeInfo && afterInfo && beforeVal !== afterVal;

                                // Check if any policyInfo has detailed breakdown — if so, show only the regional rules
                                const detailSource = [beforeInfo, afterInfo].find((p: any) => p?.policyInfo && (
                                  (p.policyInfo.includes("__nls__") && p.policyInfo.includes("__bs__")) ||
                                  p.policyInfo.includes("Ex India to") ||
                                  (p.policyInfo.includes("Before") && p.policyInfo.includes("Within"))
                                ));
                                const filteredPolicyText = detailSource?.policyInfo ? filterTjRegionalPolicy(detailSource.policyInfo, flight.from_city, flight.to_city) : null;

                                return (
                                  <div className="bg-muted/20 rounded-xl px-3.5 py-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      {icon}
                                      <span className="font-semibold text-foreground text-xs">{title}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {detailSource && filteredPolicyText ? (
                                        <div>{parseTjMarkup(filteredPolicyText)}</div>
                                      ) : hasSplit ? (
                                        <>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground text-xs">Before Departure</span>
                                            <span className={valColor(beforeVal)}>{beforeVal}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground text-xs">After Departure</span>
                                            <span className={valColor(afterVal)}>{afterVal}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex justify-between items-center">
                                          <span className="text-muted-foreground text-xs">Fee</span>
                                          <span className={valColor(beforeVal || afterVal)}>{beforeVal || afterVal}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              // Handle simple Tripjack penalty (no split)
                              if (fallbackPenalty && !fallbackPenalty._tripjackSplit && fallbackPenalty.policyInfo !== undefined) {
                                const p = fallbackPenalty;
                                let displayVal: string;
                                let noteText: string | null = null;
                                const policyLower = (p.policyInfo || "").toLowerCase();
                                const filteredPolicy = p.policyInfo ? filterTjRegionalPolicy(p.policyInfo, flight.from_city, flight.to_city) : null;
                                const hasDetailedPolicy = !!filteredPolicy && (
                                  filteredPolicy.includes("Ex India to") ||
                                  (filteredPolicy.includes("Before") && filteredPolicy.includes("Within")) ||
                                  filteredPolicy.includes("__nls__")
                                );

                                if (policyLower.includes("not applicable") || policyLower.includes("not available") || policyLower.includes("no refund")) {
                                  displayVal = "Not Permitted";
                                } else if (hasDetailedPolicy) {
                                  displayVal = "See breakdown below";
                                  noteText = filteredPolicy;
                                } else if (p.displayAmount != null) {
                                  const totalFee = p.displayAmount + (p.displayAdditionalFee || 0);
                                  displayVal = formatDirectPrice(totalFee);
                                } else if (p.amount) {
                                  const totalFee = Number(p.amount) + (Number(p.additionalFee) || 0);
                                  displayVal = formatDirectPrice(totalFee);
                                } else if (title === "No-Show" && p.policyInfo) {
                                  displayVal = "Full fare forfeited";
                                  if (p.policyInfo.length > 20) noteText = p.policyInfo;
                                } else if (p.policyInfo && p.policyInfo.length > 40) {
                                  displayVal = "See details below";
                                  noteText = p.policyInfo;
                                } else {
                                  displayVal = p.policyInfo || "See airline policy";
                                }

                                return (
                                  <div className="bg-muted/20 rounded-xl px-3.5 py-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      {icon}
                                      <span className="font-semibold text-foreground text-xs">{title}</span>
                                    </div>
                                    {hasDetailedPolicy && noteText ? (
                                      <div>{parseTjMarkup(noteText)}</div>
                                    ) : (
                                      <>
                                        <div className="flex justify-between items-center">
                                          <span className="text-muted-foreground text-xs">Fee</span>
                                          <span className={valColor(displayVal)}>{displayVal}</span>
                                        </div>
                                        {displayVal === "Full fare forfeited" && !noteText && (
                                          <div className="flex items-start gap-1.5 mt-2 bg-muted/30 rounded-lg px-2.5 py-1.5 border border-border/20">
                                            <AlertCircle className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                                            <span className="text-[10px] text-muted-foreground leading-relaxed">Unused government and airport taxes will be refunded where applicable.</span>
                                          </div>
                                        )}
                                        {noteText && (
                                          <div className="mt-1.5 bg-muted/30 rounded-lg px-2.5 py-2 border border-border/20">
                                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                                              {noteText.includes("__nls__") || noteText.includes("__bs__")
                                              ? parseTjMarkup(noteText)
                                              : convertInrInText(noteText)}
                                            </p>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              }

                              // Prefer verified API penalties first (most reliable for airlines like US-Bangla)
                              const lines = fallbackPenalty ? buildPenaltyLines(fallbackPenalty, formatDirectPrice) : [];
                              if (lines.length > 0) {
                                const before = lines.find((l) => l.label === "Before Departure");
                                const after = lines.find((l) => l.label === "After Departure");
                                const anytimeEntry = lines.find((l) => l.label === "Anytime" || l.label === "");
                                const noShowVal = frp?.noShow ? fmtPv(frp.noShow) : null;

                                const hasTrueSplit = !!(before && after && before.value !== after.value);
                                const singleValue = (before && after && before.value === after.value)
                                  ? before.value
                                  : (before || after || anytimeEntry)?.value;

                                return (
                                  <div className="bg-muted/20 rounded-xl px-3.5 py-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      {icon}
                                      <span className="font-semibold text-foreground text-xs">{title}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {hasTrueSplit ? (
                                        <>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground text-xs">Before Departure</span>
                                            <span className={valColor(before!.value)}>{before!.value}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground text-xs">After Departure</span>
                                            <span className={valColor(after!.value)}>{after!.value}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex justify-between items-center">
                                          <span className="text-muted-foreground text-xs">Fee</span>
                                          <span className={valColor(singleValue || "See airline policy")}>{singleValue || "See airline policy"}</span>
                                        </div>
                                      )}
                                      {noShowVal && (
                                        <div className="flex justify-between items-center pt-1 border-t border-border/20">
                                          <span className="text-muted-foreground text-xs">No-Show</span>
                                          <span className="text-destructive font-semibold text-xs">{noShowVal}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              // Fallback to parsed fare rules when API penalty objects are unavailable
                              if (frp && (frp.before || frp.after || frp.anytime)) {
                                const beforeVal = frp.before ? fmtPv(frp.before) : null;
                                const afterVal = frp.after ? fmtPv(frp.after) : null;
                                const hasTrueSplit = !!(frp.before && frp.after && beforeVal !== afterVal);
                                const noShowVal = frp.noShow ? fmtPv(frp.noShow) : null;

                                return (
                                  <div className="bg-muted/20 rounded-xl px-3.5 py-3 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      {icon}
                                      <span className="font-semibold text-foreground text-xs">{title}</span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {hasTrueSplit ? (
                                        <>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground text-xs">Before Departure</span>
                                            <span className={valColor(beforeVal!)}>{beforeVal}</span>
                                          </div>
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground text-xs">After Departure</span>
                                            <span className={valColor(afterVal!)}>{afterVal}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex justify-between items-center">
                                          <span className="text-muted-foreground text-xs">Fee</span>
                                          <span className={valColor(fmtPv((frp.anytime || frp.before || frp.after)!))}>{fmtPv((frp.anytime || frp.before || frp.after)!)}</span>
                                        </div>
                                      )}
                                      {noShowVal && (
                                        <div className="flex justify-between items-center pt-1 border-t border-border/20">
                                          <span className="text-muted-foreground text-xs">No-Show</span>
                                          <span className="text-destructive font-semibold text-xs">{noShowVal}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              }

                              return null;
                            };

                            return (
                              <>
                                {renderPolicyCard(
                                  "Cancellation",
                                  <div className="w-5 h-5 rounded-md bg-destructive/10 flex items-center justify-center"><X className="w-2.5 h-2.5 text-destructive" /></div>,
                                  fareRulePenalties?.cancellation,
                                  effectiveCancelPenalty
                                )}
                                {renderPolicyCard(
                                  "Date Change",
                                  <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center"><Clock className="w-2.5 h-2.5 text-primary" /></div>,
                                  fareRulePenalties?.change,
                                  effectiveChangePenalty
                                )}
                                {effectiveRefundable !== false && effectiveNoShowPenalty && renderPolicyCard(
                                  "No-Show",
                                  <div className="w-5 h-5 rounded-md bg-amber-500/10 flex items-center justify-center"><AlertCircle className="w-2.5 h-2.5 text-amber-500" /></div>,
                                  undefined,
                                  effectiveNoShowPenalty
                                )}
                              </>
                            );
                          })()}

                          {/* No policy data at all */}
                          {!effectiveCancelPenalty && !effectiveChangePenalty && !effectiveNoShowPenalty && !fareRulePenalties && effectiveRefundable === undefined && (
                            <div className="flex items-start gap-2 bg-muted/20 rounded-xl px-3.5 py-2.5 border border-border/30">
                              <AlertCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground text-xs">No penalty details available for this fare.</span>
                            </div>
                          )}


                        </>
                      ) : (
                        <div className="flex items-start gap-2 bg-muted/20 rounded-xl px-3.5 py-2.5 border border-border/30">
                          <AlertCircle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground text-xs">Policy information not available from the provider. Please check with the airline directly.</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Total */}
                  <div className="mt-3 md:mt-4 bg-primary/5 rounded-lg md:rounded-xl px-3 md:px-4 py-2.5 md:py-3 flex justify-between items-center border border-primary/10">
                    <span className="font-medium text-foreground text-xs md:text-sm">Total <span className="text-muted-foreground font-normal text-[10px] md:text-xs">({totalPax} pax)</span></span>
                    <span className="text-base md:text-lg font-bold text-primary">{fmtDisp(dispTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

      {/* Full Fare Rules Dialog */}
      <Dialog open={fareRulesOpen} onOpenChange={setFareRulesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] p-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-primary" />
              Full Fare Rules — {airlineName} {flight.flightNumber || ""}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] px-5 py-4">
            {fareRulesLoading ? (
              <div className="flex items-center justify-center py-10 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground text-sm">Fetching fare rules…</span>
              </div>
            ) : fareRules && fareRules.length > 0 ? (
              <div className="space-y-4">
                {fareRules.map((rule, i) => (
                  <div key={i} className="border border-border/40 rounded-lg overflow-hidden">
                    <div className="bg-muted/30 px-3 py-2 border-b border-border/30">
                      <span className="text-xs font-semibold text-foreground">{rule.categoryName}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">Cat {rule.category}</span>
                    </div>
                    <div className="px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground break-words">
                      {rule.text.includes("__nls__") || rule.text.includes("__bs__") 
                        ? parseTjMarkup(filterTjRegionalPolicy(rule.text, flight.from_city, flight.to_city))
                        : <pre className="whitespace-pre-wrap font-mono">{convertInrInText(filterTjRegionalPolicy(rule.text, flight.from_city, flight.to_city))}</pre>
                      }
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-10">
                <span className="text-muted-foreground text-sm">No fare rules available for this fare.</span>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FlightDetailsPanel;
