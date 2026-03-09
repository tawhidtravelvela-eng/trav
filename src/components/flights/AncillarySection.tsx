import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Armchair, Luggage, UtensilsCrossed, ChevronDown, ChevronUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───
export interface SsrSeat {
  number: string;
  column: string;
  available: boolean;
  amount: number;
  currency: string;
  type: string;
  characteristics: string[];
  ssrType: number;
  key: string;
}

export interface SeatMapRow {
  rowNumber: number;
  seats: SsrSeat[];
}

export interface SeatMapSegment {
  segmentId: string;
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  rows: SeatMapRow[];
}

export interface SsrOption {
  segmentId: string;
  segmentLabel: string;
  code: string;
  description: string;
  amount: number;
  currency: string;
  ssrType: number;
  key: string;
}

// Per-passenger selections
export interface PaxSsrSelections {
  seat?: SsrSeat | null;
  baggage?: SsrOption | null;
  meal?: SsrOption | null;
}

interface Props {
  bookingId: string | null;
  flightSource: string; // "tripjack" | "travelport" | etc.
  segments?: any[]; // Travelport segments for seatmap/ancillary fetch
  adults?: number;
  children?: number;
  infants?: number;
  passengerCount: number;
  passengerLabels: { type: string; num: number; name: string }[];
  selections: PaxSsrSelections[];
  onSelectionsChange: (selections: PaxSsrSelections[]) => void;
  formatAmount: (amount: number) => string;
  reviewSsrData?: { mealOptions?: SsrOption[]; baggageOptions?: SsrOption[] } | null;
  displayCurrency?: string;
}

export default function AncillarySection({
  bookingId,
  flightSource,
  segments,
  adults = 1,
  children = 0,
  infants = 0,
  passengerCount,
  passengerLabels,
  selections,
  onSelectionsChange,
  formatAmount,
  reviewSsrData,
  displayCurrency,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [seatMaps, setSeatMaps] = useState<SeatMapSegment[]>([]);
  const [baggageOptions, setBaggageOptions] = useState<SsrOption[]>([]);
  const [mealOptions, setMealOptions] = useState<SsrOption[]>([]);
  const [fetched, setFetched] = useState(false);
  const [activePaxIdx, setActivePaxIdx] = useState(0);

  // Use review SSR data if available immediately (Tripjack)
  useEffect(() => {
    if (reviewSsrData) {
      if (reviewSsrData.mealOptions?.length) setMealOptions(reviewSsrData.mealOptions);
      if (reviewSsrData.baggageOptions?.length) setBaggageOptions(reviewSsrData.baggageOptions);
    }
  }, [reviewSsrData]);

  const isTripjack = flightSource === "tripjack";
  const isTravelport = flightSource === "travelport";

  // Only show for supported providers
  if (!isTripjack && !isTravelport) return null;

  const hasAnyData = seatMaps.length > 0 || baggageOptions.length > 0 || mealOptions.length > 0;
  const totalSsrCost = selections.reduce((sum, sel) => {
    return sum + (sel.seat?.amount || 0) + (sel.baggage?.amount || 0) + (sel.meal?.amount || 0);
  }, 0);

  const fetchTripjackSsr = async () => {
    if (!bookingId) return;
    try {
      const { data, error } = await supabase.functions.invoke("tripjack-ssr", {
        body: { bookingId, type: "all", targetCurrency: displayCurrency },
      });
      if (!error && data?.success) {
        if (data.seatMaps?.length) setSeatMaps(data.seatMaps);
        if (data.baggageOptions?.length) setBaggageOptions(data.baggageOptions);
        if (data.mealOptions?.length) setMealOptions(data.mealOptions);
      }
    } catch (err) {
      console.warn("[Ancillary] Failed to fetch Tripjack SSR:", err);
    }
  };

  const fetchTravelportSsr = async () => {
    if (!segments?.length) return;

    // Fetch seat map + ancillaries in parallel
    const [seatResult, ancResult] = await Promise.all([
      supabase.functions.invoke("travelport-seatmap", {
        body: { segments, targetCurrency: displayCurrency },
      }),
      supabase.functions.invoke("travelport-ancillaries", {
        body: { segments, adults, children, infants, targetCurrency: displayCurrency },
      }),
    ]);

    // Process seat maps
    if (!seatResult.error && seatResult.data?.success && seatResult.data.seatMaps?.length) {
      setSeatMaps(seatResult.data.seatMaps);
    }

    // Process baggage & meal options
    if (!ancResult.error && ancResult.data?.success) {
      if (ancResult.data.baggageOptions?.length) {
        const mapped: SsrOption[] = ancResult.data.baggageOptions.map((b: any) => ({
          segmentId: b.segmentRef || "",
          segmentLabel: "",
          code: b.code || b.subCode || b.key,
          description: b.description,
          amount: b.amount,
          currency: b.currency,
          ssrType: 2,
          key: b.key,
        }));
        setBaggageOptions(mapped);
      }
      if (ancResult.data.mealOptions?.length) {
        const mapped: SsrOption[] = ancResult.data.mealOptions.map((m: any) => ({
          segmentId: m.segmentRef || "",
          segmentLabel: "",
          code: m.code || m.subCode || m.key,
          description: m.description,
          amount: m.amount,
          currency: m.currency,
          ssrType: 3,
          key: m.key,
        }));
        setMealOptions(mapped);
      }
    }
  };

  const fetchSsrData = async () => {
    if (fetched) return;
    setLoading(true);
    try {
      if (isTripjack) {
        await fetchTripjackSsr();
      } else if (isTravelport) {
        await fetchTravelportSsr();
      }
    } catch (err) {
      console.warn("[Ancillary] Failed to fetch SSR:", err);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  const handleExpand = () => {
    if (!expanded && !fetched) fetchSsrData();
    setExpanded(!expanded);
  };

  const updateSelection = (paxIdx: number, key: keyof PaxSsrSelections, value: any) => {
    const newSelections = [...selections];
    newSelections[paxIdx] = { ...newSelections[paxIdx], [key]: value };
    onSelectionsChange(newSelections);
  };

  // Deduplicate meals/baggage by code
  const uniqueMeals = mealOptions.filter((m, i, arr) => arr.findIndex((x) => x.code === m.code) === i);
  const uniqueBaggage = baggageOptions.filter((b, i, arr) => arr.findIndex((x) => x.code === b.code) === i);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={handleExpand}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Armchair className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">Add-ons & Extras</h3>
            <p className="text-xs text-muted-foreground">Seats, baggage & meals (optional)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {totalSsrCost > 0 && (
            <Badge variant="secondary" className="text-xs font-semibold">
              +{formatAmount(totalSsrCost)}
            </Badge>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <CardContent className="pt-0 pb-5 px-4 border-t border-border">
              {loading ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading available add-ons...</span>
                </div>
              ) : !hasAnyData && fetched ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">No add-ons available for this flight.</p>
                </div>
              ) : (
                <div className="space-y-5 pt-4">
                  {/* Passenger tabs */}
                  {passengerCount > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {passengerLabels.map((pax, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActivePaxIdx(idx)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border",
                            activePaxIdx === idx
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-foreground hover:border-primary/50"
                          )}
                        >
                          {pax.type} {pax.num}{pax.name ? ` — ${pax.name}` : ""}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Seat Selection */}
                  {seatMaps.length > 0 && (
                    <SeatSelector
                      seatMaps={seatMaps}
                      selected={selections[activePaxIdx]?.seat || null}
                      onSelect={(seat) => updateSelection(activePaxIdx, "seat", seat)}
                      formatAmount={formatAmount}
                      occupiedSeats={selections
                        .filter((_, i) => i !== activePaxIdx)
                        .map((s) => s.seat?.number)
                        .filter(Boolean) as string[]}
                    />
                  )}

                  {/* Extra Baggage */}
                  {uniqueBaggage.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Luggage className="w-4 h-4 text-primary" />
                        <h4 className="font-semibold text-sm">Extra Baggage</h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => updateSelection(activePaxIdx, "baggage", null)}
                          className={cn(
                            "p-3 rounded-lg border text-left transition-all text-xs",
                            !selections[activePaxIdx]?.baggage
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <p className="font-medium">No extra</p>
                          <p className="text-muted-foreground mt-0.5">Included only</p>
                        </button>
                        {uniqueBaggage.map((opt) => {
                          const isSelected = selections[activePaxIdx]?.baggage?.code === opt.code;
                          return (
                            <button
                              key={opt.code}
                              type="button"
                              onClick={() => updateSelection(activePaxIdx, "baggage", opt)}
                              className={cn(
                                "p-3 rounded-lg border text-left transition-all text-xs relative",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50"
                              )}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-primary absolute top-2 right-2" />}
                              <p className="font-medium pr-5">{opt.description}</p>
                              <p className="text-primary font-semibold mt-1">
                                {opt.amount > 0 ? `+${formatAmount(opt.amount)}` : "Free"}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Meal Selection */}
                  {uniqueMeals.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <UtensilsCrossed className="w-4 h-4 text-primary" />
                        <h4 className="font-semibold text-sm">Meal Preference</h4>
                      </div>
                      <Select
                        value={selections[activePaxIdx]?.meal?.code || "none"}
                        onValueChange={(code) => {
                          if (code === "none") {
                            updateSelection(activePaxIdx, "meal", null);
                          } else {
                            const meal = uniqueMeals.find((m) => m.code === code);
                            if (meal) updateSelection(activePaxIdx, "meal", meal);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No meal preference" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No meal preference</SelectItem>
                          {uniqueMeals.map((m) => (
                            <SelectItem key={m.code} value={m.code}>
                              {m.description}
                              {m.amount > 0 ? ` (+${formatAmount(m.amount)})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Summary */}
                  {totalSsrCost > 0 && (
                    <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">Total add-ons cost</span>
                      <span className="text-sm font-bold text-primary">+{formatAmount(totalSsrCost)}</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ─── Seat Selector (Visual grid) ───
function SeatSelector({
  seatMaps,
  selected,
  onSelect,
  formatAmount,
  occupiedSeats,
}: {
  seatMaps: SeatMapSegment[];
  selected: SsrSeat | null;
  onSelect: (seat: SsrSeat | null) => void;
  formatAmount: (n: number) => string;
  occupiedSeats: string[];
}) {
  const segment = seatMaps[0]; // Show first segment
  if (!segment?.rows?.length) return null;

  // Get unique column letters for the header
  const allCols = segment.rows[0]?.seats?.map((s) => s.column) || [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Armchair className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">Seat Selection</h4>
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear seat
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-1">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/30 inline-block" /> Available</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary inline-block" /> Selected</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-muted inline-block" /> Occupied</span>
      </div>

      <p className="text-xs text-muted-foreground">
        {segment.origin} → {segment.destination} • {segment.airline}{segment.flightNumber}
      </p>

      <div className="max-h-64 overflow-y-auto border border-border rounded-lg p-2">
        {/* Column headers */}
        <div className="flex items-center gap-0.5 mb-1 sticky top-0 bg-card pb-1 z-10">
          <div className="w-7 text-center text-[10px] text-muted-foreground font-medium" />
          {allCols.map((col) => (
            <div key={col} className="w-7 text-center text-[10px] text-muted-foreground font-medium">{col}</div>
          ))}
        </div>

        {segment.rows.map((row) => (
          <div key={row.rowNumber} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-7 text-center text-[10px] text-muted-foreground font-medium">{row.rowNumber}</div>
            {row.seats.map((seat) => {
              const isSelected = selected?.number === seat.number;
              const isOccupied = occupiedSeats.includes(seat.number);
              const isAvailable = seat.available && !isOccupied;
              return (
                <button
                  key={seat.number}
                  type="button"
                  disabled={!isAvailable && !isSelected}
                  onClick={() => isSelected ? onSelect(null) : onSelect(seat)}
                  title={`${seat.number} - ${seat.type}${seat.amount > 0 ? ` (${formatAmount(seat.amount)})` : " (Free)"}`}
                  className={cn(
                    "w-7 h-7 rounded-sm text-[9px] font-medium transition-all border",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : isAvailable
                        ? "bg-primary/10 border-primary/20 hover:bg-primary/25 hover:border-primary/40 text-foreground cursor-pointer"
                        : "bg-muted border-border text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  {seat.column}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selected && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium">Seat {selected.number} ({selected.type})</span>
          <span className="text-xs font-bold text-primary">
            {selected.amount > 0 ? `+${formatAmount(selected.amount)}` : "Free"}
          </span>
        </div>
      )}
    </div>
  );
}
