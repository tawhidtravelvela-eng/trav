import { useState, useEffect } from "react";
import { Plane, ArrowRight, Clock, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AIRLINE_NAMES } from "@/data/airlines";
import { airports } from "@/data/airports";

interface PopularRoute {
  from_code: string;
  to_code: string;
  from_city: string;
  to_city: string;
  lowest_price: number;
  currency: string;
  airline: string;
  duration: string;
  stops: number;
  search_count: number;
  ai_suggested?: boolean;
}

// Map country codes to country names used in airports.ts
const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  BD: "Bangladesh", US: "United States", GB: "United Kingdom", AE: "United Arab Emirates",
  IN: "India", SG: "Singapore", MY: "Malaysia", TH: "Thailand", JP: "Japan",
  KR: "South Korea", CN: "China", AU: "Australia", CA: "Canada", DE: "Germany",
  FR: "France", IT: "Italy", ES: "Spain", TR: "Turkey", SA: "Saudi Arabia",
  QA: "Qatar", KW: "Kuwait", OM: "Oman", BH: "Bahrain", PK: "Pakistan",
  LK: "Sri Lanka", NP: "Nepal", PH: "Philippines", VN: "Vietnam", ID: "Indonesia",
  NL: "Netherlands", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  CH: "Switzerland", AT: "Austria", BE: "Belgium", PT: "Portugal", IE: "Ireland",
  EG: "Egypt", KE: "Kenya", ZA: "South Africa", ET: "Ethiopia", MA: "Morocco",
  BR: "Brazil", MX: "Mexico", AR: "Argentina", CL: "Chile", CO: "Colombia",
};

const TrendingFlights = () => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [routes, setRoutes] = useState<PopularRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    const fetchPopular = async () => {
      // Detect user's country
      let userCountry = "";
      let userCountryCode = "";
      try {
        const geoRes = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
        const geoData = await geoRes.json();
        const cc = geoData?.country_code as string;
        if (cc) {
          userCountryCode = cc;
          userCountry = COUNTRY_CODE_TO_NAME[cc] || geoData?.country_name || "";
        }
      } catch {
        // Continue without geo
      }

      // Get airport codes for user's country
      const userAirportCodes = userCountry
        ? airports.filter((a) => a.country === userCountry).map((a) => a.code)
        : [];

      // Fetch all popular routes from DB
      const { data, error } = await supabase
        .from("popular_routes")
        .select("*")
        .gt("lowest_price", 0)
        .order("search_count", { ascending: false })
        .limit(30);

      if (!error && data && data.length > 0) {
        // Deduplicate by route pair
        const seen = new Map<string, PopularRoute>();
        for (const r of data as PopularRoute[]) {
          const key = [r.from_code, r.to_code].sort().join("-");
          const existing = seen.get(key);
          if (!existing || r.lowest_price < existing.lowest_price) {
            seen.set(key, r);
          }
        }

        const allRoutes = Array.from(seen.values());

        if (userAirportCodes.length > 0) {
          // Split into geo-relevant and others
          const geoRoutes = allRoutes.filter(
            (r) => userAirportCodes.includes(r.from_code) || userAirportCodes.includes(r.to_code)
          );
          const otherRoutes = allRoutes.filter(
            (r) => !userAirportCodes.includes(r.from_code) && !userAirportCodes.includes(r.to_code)
          );

          const combined = [...geoRoutes, ...otherRoutes].slice(0, 6);

          if (combined.length >= 3) {
            setRoutes(combined);
            setLoading(false);
            return;
          }

          // Not enough geo routes — try AI suggestions to fill gaps
          if (userCountry) {
            try {
              const aiRoutes = await fetchAISuggestions(userCountry, userCountryCode);
              if (aiRoutes.length > 0) {
                // Merge: existing DB routes first, then AI routes (avoid duplicates)
                const existingKeys = new Set(combined.map((r) => [r.from_code, r.to_code].sort().join("-")));
                const uniqueAI = aiRoutes.filter(
                  (r) => !existingKeys.has([r.from_code, r.to_code].sort().join("-"))
                );
                setRoutes([...combined, ...uniqueAI].slice(0, 6));
                setLoading(false);
                return;
              }
            } catch {
              // AI fallback failed, use what we have
            }
          }

          setRoutes(combined.length > 0 ? combined : allRoutes.slice(0, 6));
        } else {
          // No geo info — check if we should get AI suggestions
          if (userCountry && allRoutes.length < 3) {
            try {
              const aiRoutes = await fetchAISuggestions(userCountry, userCountryCode);
              if (aiRoutes.length > 0) {
                const existingKeys = new Set(allRoutes.map((r) => [r.from_code, r.to_code].sort().join("-")));
                const uniqueAI = aiRoutes.filter(
                  (r) => !existingKeys.has([r.from_code, r.to_code].sort().join("-"))
                );
                setRoutes([...allRoutes, ...uniqueAI].slice(0, 6));
                setLoading(false);
                return;
              }
            } catch {
              // Use DB data
            }
          }
          setRoutes(allRoutes.slice(0, 6));
        }
      } else {
        // No DB data at all — try AI suggestions
        if (userCountry) {
          try {
            const aiRoutes = await fetchAISuggestions(userCountry, userCountryCode);
            if (aiRoutes.length > 0) {
              setRoutes(aiRoutes.slice(0, 6));
              setLoading(false);
              return;
            }
          } catch {
            // No data available
          }
        }
      }
      setLoading(false);
    };

    fetchPopular();
  }, []);

  const fetchAISuggestions = async (country: string, countryCode: string): Promise<PopularRoute[]> => {
    const { data, error } = await supabase.functions.invoke("suggest-popular-routes", {
      body: { country, countryCode },
    });
    if (error || !data?.success) return [];
    return (data.routes || []) as PopularRoute[];
  };

  if (loading || routes.length === 0) return null;

  const getAirlineLogo = (code: string) =>
    `https://pics.avs.io/60/60/${code}.png`;

  return (
    <section className="py-10 sm:py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-6 sm:mb-10">
          <div>
            <div className="inline-flex items-center gap-2 text-primary text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1.5 sm:mb-2">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Trending Now
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-foreground">
              Popular Flights
            </h2>
          </div>
          <Link
            to="/flights"
            className="hidden md:flex items-center gap-1 text-primary font-semibold text-sm hover:gap-2 transition-all"
          >
            See All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {routes.map((route, i) => {
            const isHovered = hoveredIdx === i;
            const isFeatured = i === 0;
            const stopsLabel =
              route.stops === 0
                ? "Non-stop"
                : `${route.stops} stop${route.stops > 1 ? "s" : ""}`;
            const airlineName =
              (route.airline && AIRLINE_NAMES[route.airline]) ||
              route.airline ||
              "Multiple Airlines";

            return (
              <Link
                key={`${route.from_code}-${route.to_code}`}
                to={`/flights?from=${route.from_code}&to=${route.to_code}&date=${new Date().toISOString().split("T")[0]}&adults=1&tripType=one-way`}
                className="group relative block transition-all duration-300 hover:-translate-y-1"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {isFeatured && (
                  <div className="absolute -top-2.5 left-4 z-10 bg-primary text-primary-foreground text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                    🔥 Most Popular
                  </div>
                )}

                <div
                  className={cn(
                    "rounded-xl sm:rounded-2xl border overflow-hidden transition-shadow duration-300",
                    isFeatured
                      ? "bg-gradient-to-br from-primary/[0.03] to-accent/[0.06] border-primary/25 shadow-lg shadow-primary/10 ring-1 ring-primary/10"
                      : "bg-card border-border/60 hover:shadow-xl hover:shadow-primary/5"
                  )}
                >
                  {/* Airline header */}
                  <div className="flex items-center gap-2.5 px-4 sm:px-5 pt-4 sm:pt-5 pb-2">
                    <img
                      src={getAirlineLogo(route.airline)}
                      alt={airlineName}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-md object-contain bg-muted/50 p-0.5"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                      {airlineName}
                    </span>
                    {route.ai_suggested && (
                      <span className="ml-auto text-[8px] sm:text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded font-medium">
                        Suggested
                      </span>
                    )}
                  </div>

                  {/* Route info */}
                  <div className="px-4 sm:px-5 py-3 sm:py-4">
                    <div className="flex items-center gap-3">
                      {/* From */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-bold text-foreground truncate">
                          {route.from_city || route.from_code}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">
                          {route.from_code}
                        </p>
                      </div>

                      {/* Flight path */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0 w-[90px] sm:w-[110px]">
                        {route.duration && (
                          <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-muted-foreground">
                            <Clock className="w-2.5 h-2.5" />
                            {route.duration}
                          </div>
                        )}
                        <div className="w-full flex items-center">
                          <div className="w-1.5 h-1.5 rounded-full border-2 border-primary shrink-0" />
                          <div className="flex-1 border-t border-dashed border-muted-foreground/40 relative mx-1">
                            <Plane
                              className={cn(
                                "w-3.5 h-3.5 text-primary absolute top-1/2 -translate-y-1/2 transition-all duration-700",
                                isHovered
                                  ? "left-[65%] rotate-0"
                                  : "left-[35%] -rotate-12"
                              )}
                            />
                          </div>
                          <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        </div>
                        <p className="text-[8px] sm:text-[9px] text-muted-foreground font-medium">
                          {stopsLabel}
                        </p>
                      </div>

                      {/* To */}
                      <div className="flex-1 min-w-0 text-right">
                        <p className="text-sm sm:text-base font-bold text-foreground truncate">
                          {route.to_city || route.to_code}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">
                          {route.to_code}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="relative mx-4 sm:mx-5">
                    <div className="border-t border-dashed border-border" />
                    <div className="absolute -left-6 sm:-left-7 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-muted/30 border border-border/50" />
                    <div className="absolute -right-6 sm:-right-7 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-muted/30 border border-border/50" />
                  </div>

                  {/* Price footer */}
                  <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4">
                    <div>
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                        {route.ai_suggested ? "Approx. from" : "Starting from"}
                      </span>
                      <p className="text-lg sm:text-xl font-extrabold text-primary leading-tight">
                        {formatPrice(route.lowest_price, "travelvela")}
                      </p>
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1 text-xs sm:text-sm font-bold text-primary transition-all duration-300",
                        isHovered
                          ? "opacity-100 translate-x-0"
                          : "opacity-60 -translate-x-1"
                      )}
                    >
                      Book Now{" "}
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-5 sm:mt-8 text-center md:hidden">
          <Link
            to="/flights"
            className="inline-flex items-center gap-1 text-primary font-semibold text-xs sm:text-sm"
          >
            See All Routes <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
};

export default TrendingFlights;
