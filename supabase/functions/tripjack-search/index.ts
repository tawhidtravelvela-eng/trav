// Tripjack Air API v1 flight search edge function
// Routes through proxy: http://65.20.67.77/tj-pre/ → apitest.tripjack.com
// Proxy injects the apikey header automatically
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const PROXY_BASE_TEST = "http://65.20.67.77/tj-pre";
const PROXY_BASE_PROD = "http://65.20.67.77/tj";

async function getConfig() {
  const proxySecret = Deno.env.get("PROXY_SECRET_KEY");
  if (!proxySecret) throw new Error("PROXY_SECRET_KEY not configured");
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("api_settings").select("is_active, settings").eq("provider", "tripjack_flight").maybeSingle();
  const environment = (data?.settings as any)?.environment || "test";
  const proxyBase = environment === "production" ? PROXY_BASE_PROD : PROXY_BASE_TEST;
  return { isActive: data?.is_active ?? false, proxySecret, environment, proxyBase };
}

async function tjFetch(path: string, body: any, proxySecret: string, proxyBase: string): Promise<Response> {
  const url = `${proxyBase}${path}`;
  console.log(`tjFetch: POST ${url}`);
  return fetch(url, {
    method: "POST",
    headers: {
      "x-vela-key": proxySecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function mapCabinClass(cls: string): string {
  const map: Record<string, string> = {
    Economy: "ECONOMY",
    "Premium Economy": "PREMIUM_ECONOMY",
    Business: "BUSINESS",
    First: "FIRST",
  };
  return map[cls] || "ECONOMY";
}

function unmapCabinClass(cls: string): string {
  const map: Record<string, string> = {
    ECONOMY: "Economy",
    PREMIUM_ECONOMY: "Premium Economy",
    BUSINESS: "Business",
    FIRST: "First",
  };
  return map[cls] || cls;
}

interface TjSegment {
  id: string;
  da: { code: string; name?: string; terminal?: string; city?: string; cityCode?: string; country?: string; countryCode?: string };
  aa: { code: string; name?: string; terminal?: string; city?: string; cityCode?: string; country?: string; countryCode?: string };
  dt: string; // departure time
  at: string; // arrival time
  fD: { aI: { code: string; name: string; isLcc?: boolean }; fN: string; eT?: string };
  oB?: { code: string; name?: string };
  duration?: number;
  stops?: number;
  sN?: number;
  cT?: number; // connecting time
  iand?: boolean;
  isRs?: boolean;
}

interface TjPriceInfo {
  id: string;
  fd: Record<string, {
    fC: { BF: number; TAF: number; TF: number; NF?: number; NCM?: number };
    afC?: { TAF?: { OT?: number; YQ?: number; YR?: number; AGST?: number; MF?: number; MFT?: number } };
    bI?: { iB?: string; cB?: string; isHB?: boolean };
    rT?: number;
    cc?: string;
    cB?: string;
    fB?: string;
    mi?: boolean;
    sR?: number;
  }>;
  fareIdentifier?: string;
  sri?: string;
  msri?: string[];
}

interface TjTripInfo {
  sI: TjSegment[];
  totalPriceList: TjPriceInfo[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: "Too many requests" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    // Test mode
    if (body.test) {
      const config = await getConfig();
      // Simple connectivity test — search a known route
      const testBody = {
        searchQuery: {
          cabinClass: "ECONOMY",
          paxInfo: { ADULT: "1", CHILD: "0", INFANT: "0" },
          routeInfos: [
            {
              fromCityOrAirport: { code: "DEL" },
              toCityOrAirport: { code: "BOM" },
              travelDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
            },
          ],
          searchModifiers: { pft: "REGULAR" },
        },
      };
      const res = await tjFetch("/fms/v1/air-search-all", testBody, config.proxySecret, config.proxyBase);
      const data = await res.json();
      if (data?.status?.success || data?.searchResult) {
        return new Response(
          JSON.stringify({ success: true, message: "Tripjack Air API is reachable" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: data?.errors?.[0]?.message || "API returned no results" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Flight search
    const config = await getConfig();
    if (!config.isActive) {
      return new Response(
        JSON.stringify({ success: false, error: "Tripjack flight search is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { from, to, departDate, returnDate, adults = 1, children = 0, infants = 0, cabinClass = "Economy", directFlight = false, studentFare = false, legs } = body;

    if (!from || !to || !departDate) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required search parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build route infos
    const routeInfos: any[] = [];

    if (legs && Array.isArray(legs) && legs.length >= 2) {
      // Multi-city
      for (const leg of legs) {
        routeInfos.push({
          fromCityOrAirport: { code: leg.from },
          toCityOrAirport: { code: leg.to },
          travelDate: leg.date,
        });
      }
    } else {
      // One-way or round-trip
      routeInfos.push({
        fromCityOrAirport: { code: from },
        toCityOrAirport: { code: to },
        travelDate: departDate,
      });
      if (returnDate) {
        routeInfos.push({
          fromCityOrAirport: { code: to },
          toCityOrAirport: { code: from },
          travelDate: returnDate,
        });
      }
    }

    const searchModifiers: any = {};
    if (directFlight) {
      searchModifiers.isDirectFlight = true;
      searchModifiers.isConnectingFlight = false;
    } else {
      searchModifiers.isDirectFlight = false;
      searchModifiers.isConnectingFlight = true;
    }
    if (studentFare) {
      searchModifiers.pft = "STUDENT";
    } else {
      searchModifiers.pft = "REGULAR";
    }

    const searchPayload = {
      searchQuery: {
        cabinClass: mapCabinClass(cabinClass),
        paxInfo: {
          ADULT: String(adults),
          CHILD: String(children),
          INFANT: String(infants),
        },
        routeInfos,
        searchModifiers,
      },
    };

    console.log("[TripjackSearch] Searching:", JSON.stringify({ from, to, departDate, returnDate, adults, children, infants }));

    const searchRes = await tjFetch("/fms/v1/air-search-all", searchPayload, config.proxySecret, config.proxyBase);
    const searchData = await searchRes.json();

    if (!searchData?.searchResult && !searchData?.status?.success) {
      const errMsg = searchData?.errors?.[0]?.message || "No flights found";
      console.log("[TripjackSearch] No results:", errMsg);
      return new Response(
        JSON.stringify({ success: true, flights: [], count: 0, note: errMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = searchData.searchResult;
    const flights: any[] = [];

    // Parse trips from ONWARD, RETURN, or COMBO
    const tripSections = ["ONWARD", "RETURN", "COMBO"];
    const allTrips: { key: string; trips: TjTripInfo[] }[] = [];

    for (const section of tripSections) {
      if (result?.tripInfos?.[section]) {
        allTrips.push({ key: section, trips: result.tripInfos[section] });
      }
    }

    // Also check for multi-city indexed keys (0, 1, 2, ...)
    if (result?.tripInfos) {
      for (const key of Object.keys(result.tripInfos)) {
        if (!tripSections.includes(key) && Array.isArray(result.tripInfos[key])) {
          allTrips.push({ key, trips: result.tripInfos[key] });
        }
      }
    }

    // For ONWARD trips (one-way or onward leg), parse each trip as a flight
    for (const { key, trips } of allTrips) {
      for (const trip of trips) {
        if (!trip.sI || !trip.totalPriceList || trip.totalPriceList.length === 0) continue;

        const segments = trip.sI;
        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];

        // Use the cheapest price option
        let bestPrice: TjPriceInfo | null = null;
        let lowestTotal = Infinity;

        for (const price of trip.totalPriceList) {
          const adultFare = price.fd?.ADULT;
          if (adultFare?.fC?.TF != null && adultFare.fC.TF < lowestTotal) {
            lowestTotal = adultFare.fC.TF;
            bestPrice = price;
          }
        }

        if (!bestPrice) continue;

        const adultFare = bestPrice.fd.ADULT;
        const childFare = bestPrice.fd.CHILD;
        const infantFare = bestPrice.fd.INFANT;

        // Calculate total price for all passengers
        const adultTotal = (adultFare?.fC?.TF || 0) * adults;
        const childTotal = (childFare?.fC?.TF || 0) * children;
        const infantTotal = (infantFare?.fC?.TF || 0) * infants;
        const totalPrice = adultTotal + childTotal + infantTotal;

        // Per-adult price for display
        const perAdultPrice = adultFare?.fC?.TF || 0;

        // Calculate total duration across all segments
        let totalDuration = 0;
        for (const seg of segments) {
          totalDuration += seg.duration || 0;
          if (seg.cT) totalDuration += seg.cT; // Add connecting time
        }

        // Count actual stops (segments - 1)
        const actualStops = segments.length - 1;

        // Build normalized segments
        const normalizedSegments = segments.map((seg) => ({
          airline: seg.fD?.aI?.code || "",
          airlineName: seg.fD?.aI?.name || "",
          flightNumber: seg.fD?.fN || "",
          carrier: seg.fD?.aI?.code || "",
          origin: seg.da?.code || "",
          destination: seg.aa?.code || "",
          from: seg.da?.code || "",
          fromCity: seg.da?.city || seg.da?.name || "",
          fromTerminal: seg.da?.terminal || "",
          to: seg.aa?.code || "",
          toCity: seg.aa?.city || seg.aa?.name || "",
          toTerminal: seg.aa?.terminal || "",
          departure: seg.dt || "",
          arrival: seg.at || "",
          duration: seg.duration ? formatMinutes(seg.duration) : "",
          durationMinutes: seg.duration || 0,
          equipmentType: seg.fD?.eT || "",
          operatingCarrier: seg.oB?.code || seg.fD?.aI?.code || "",
          operatingCarrierName: seg.oB?.name || "",
          connectingTime: seg.cT ? formatMinutes(seg.cT) : undefined,
          segmentId: seg.id || "",
        }));

        // Baggage info
        const baggage = adultFare?.bI;
        const cabinBaggage = baggage?.cB || "";
        const checkinBaggage = baggage?.iB || "";

        // Refund type
        const refundType = adultFare?.rT; // 0=non-refundable, 1=refundable, 2=partial

        // Cabin class from fare
        const fareClass = adultFare?.cc ? unmapCabinClass(adultFare.cc) : cabinClass;

        const flight = {
          id: `tj-${bestPrice.id}`,
          airline: firstSeg.fD?.aI?.code || "",
          flightNumber: `${firstSeg.fD?.aI?.code || ""}${firstSeg.fD?.fN || ""}`,
          from_city: firstSeg.da?.code || from,
          to_city: lastSeg.aa?.code || to,
          departure: firstSeg.dt || "",
          arrival: lastSeg.at || "",
          duration: formatMinutes(totalDuration),
          stops: actualStops,
          price: perAdultPrice,
          totalPrice,
          basePrice: adultFare?.fC?.BF || 0,
          taxes: adultFare?.fC?.TAF || 0,
          currency: "INR",
          class: fareClass,
          seats: adultFare?.sR || 9,
          is_active: true,
          source: "tripjack",
          segments: normalizedSegments,
          // Tripjack-specific fields for review/booking
          tripjackPriceId: bestPrice.id,
          fareIdentifier: bestPrice.fareIdentifier || "PUBLISHED",
          sri: bestPrice.sri,
          msri: bestPrice.msri,
          // Baggage
          cabinBaggage,
          checkinBaggage,
          // Refund
          refundType,
          isRefundable: refundType === 1,
          isPartialRefundable: refundType === 2,
          // Per-pax fare breakdown
          adultFare: adultFare?.fC ? { baseFare: adultFare.fC.BF, taxes: adultFare.fC.TAF, totalFare: adultFare.fC.TF } : undefined,
          childFare: childFare?.fC ? { baseFare: childFare.fC.BF, taxes: childFare.fC.TAF, totalFare: childFare.fC.TF } : undefined,
          infantFare: infantFare?.fC ? { baseFare: infantFare.fC.BF, taxes: infantFare.fC.TAF, totalFare: infantFare.fC.TF } : undefined,
          // Fare rule info from search
          fareRuleInfo: bestPrice.fd?.ADULT ? undefined : undefined, // Will be fetched via fare rule API
          isLcc: firstSeg.fD?.aI?.isLcc ?? false,
          mealIncluded: adultFare?.mi === true,
          classOfBooking: adultFare?.cB || "",
          fareBasis: adultFare?.fB || "",
          tripSection: key, // ONWARD, RETURN, COMBO
        };

        flights.push(flight);
      }
    }

    // Sort by price
    flights.sort((a, b) => a.price - b.price);

    console.log(`[TripjackSearch] Found ${flights.length} flights`);

    return new Response(
      JSON.stringify({ success: true, flights, count: flights.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[TripjackSearch] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
