// TravelVela flight search edge function

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Simple in-memory rate limiter ──
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function parseAmount(value: any): number {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  if (value && typeof value === "object") {
    const candidates = ["TotalFare", "GrandTotal", "totalFare", "grandTotal", "total", "amount", "value"];
    for (const key of candidates) {
      const n = parseAmount(value[key]);
      if (Number.isFinite(n)) return n;
    }
  }

  return NaN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ success: false, error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const authToken = Deno.env.get("TRAVELVELA_AUTH_TOKEN");
    const username = Deno.env.get("TRAVELVELA_USERNAME");
    const password = Deno.env.get("TRAVELVELA_PASSWORD");

    if (!authToken || !username || !password) {
      throw new Error("TravelVela API credentials not configured");
    }

    const body = await req.json();

    // Test mode
    if (body.test) {
      const formData = new FormData();
      formData.append("keyword", "Dhaka");
      const res = await fetch("https://admin.travelvela.com/api/search/cities/airports", {
        method: "POST",
        headers: {
          Authorization: authToken,
          username,
          password,
        },
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`TravelVela test failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, message: "TravelVela credentials valid", data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { from, to, departDate, returnDate, adults = 1, children = 0, infants = 0, cabinClass = "Economy" } = body;

    if (!from || !to || !departDate) {
      return new Response(JSON.stringify({ success: false, error: "Missing required search parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = new FormData();
    formData.append("origin_location", from);
    formData.append("destination_location", to);
    formData.append("departure_date", departDate);
    formData.append("return_date", returnDate || "");
    formData.append("cabin_class", cabinClass);
    formData.append("traveler", String(adults));
    formData.append("traveler_child", String(children));
    formData.append("traveler_infant", String(infants));

    

    const searchRes = await fetch("https://admin.travelvela.com/api/flight/search", {
      method: "POST",
      headers: {
        Authorization: authToken,
        username,
        password,
      },
      body: formData,
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("TravelVela search error:", searchRes.status, errText.substring(0, 300));
      // Return empty results instead of 502 so the client doesn't break
      return new Response(JSON.stringify({ success: true, flights: [], count: 0, note: `Upstream API returned ${searchRes.status}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchData = await searchRes.json();


    // The response structure may vary - try to normalize it
    // Common patterns: searchData.data, searchData.flights, searchData.results
    let rawFlights: any[] = [];
    if (Array.isArray(searchData)) {
      rawFlights = searchData;
    } else if (searchData.data?.data && Array.isArray(searchData.data.data)) {
      // TravelVela nests as { success, data: { data: [...] } }
      rawFlights = searchData.data.data;
    } else if (searchData.data && Array.isArray(searchData.data)) {
      rawFlights = searchData.data;
    } else if (searchData.flights && Array.isArray(searchData.flights)) {
      rawFlights = searchData.flights;
    } else if (searchData.results && Array.isArray(searchData.results)) {
      rawFlights = searchData.results;
    }


    // Map to normalized flight format based on TravelVela's actual structure
    const flights = rawFlights.slice(0, 30).map((f: any, idx: number) => {
      // TravelVela: { itineraries: [{ segments: [...], duration, FareBreakdown }] }
      const itinerary = f.itineraries?.[0];
      const segments = itinerary?.segments || f.segments || [];
      const firstSeg = segments[0] || {};
      const lastSeg = segments[segments.length - 1] || firstSeg;


      const airline = firstSeg.carrierCode || firstSeg.OperatingCarrier || f.carrier || "TV";
      const flightNum = firstSeg.FlightNumber || "";
      const flightNumber = `${airline}${flightNum}`;

      const departure = firstSeg.departure?.at || firstSeg.departure?.DepartureTimeFormated2Time || "";
      const arrival = lastSeg.arrival?.at || lastSeg.arrival?.ArrivalTimeFormated2Time || "";

      const duration = itinerary?.duration || firstSeg.duration || "0h 0m";
      // Parse duration to minutes for booking API
      let durationMinutes = 0;
      if (typeof duration === "string") {
        const hMatch = duration.match(/(\d+)\s*h/);
        const mMatch = duration.match(/(\d+)\s*m/);
        durationMinutes = (hMatch ? parseInt(hMatch[1]) * 60 : 0) + (mMatch ? parseInt(mMatch[1]) : 0);
      } else if (typeof duration === "number") {
        durationMinutes = duration;
      }
      const stops = Math.max(0, segments.length - 1);

      // Price from FareBreakdown (array/object) or top-level price object
      const fareBreakdown = itinerary?.FareBreakdown || f.FareBreakdown || [];
      let fareRows: any[] = [];
      if (Array.isArray(fareBreakdown)) {
        fareRows = fareBreakdown;
      } else if (typeof fareBreakdown === "string") {
        try {
          const parsed = JSON.parse(fareBreakdown);
          fareRows = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
        } catch {
          fareRows = [];
        }
      } else {
        fareRows = Object.values(fareBreakdown || {});
      }
      const firstFareRaw: any = fareRows[0] || {};
      const firstFare: any =
        typeof firstFareRaw === "string"
          ? (() => {
              try {
                return JSON.parse(firstFareRaw);
              } catch {
                return {};
              }
            })()
          : firstFareRaw;

      const rawPrice =
        firstFare.TotalFare ??
        firstFare.GrandTotal ??
        firstFare.totalFare ??
        firstFare.grandTotal ??
        f.price?.TotalFare ??
        f.price?.grandTotal ??
        f.price?.total ??
        f.grandTotal ??
        f.total_price ??
        f.price;

      const parsedPrice = parseAmount(rawPrice);
      const price = Number.isFinite(parsedPrice) ? parsedPrice : 0;
      const currency =
        firstFare.Currency ||
        firstFare.currency ||
        f.price?.currency ||
        f.currency ||
        "BDT";

      // Build normalized segments array with transit details - prefer full ISO timestamps
      // Track operating carrier vs marketing carrier for codeshare display
      const normalizedSegments = segments.map((seg: any, si: number) => {
        const marketingCarrier = seg.carrierCode || seg.MarketingCarrier || airline;
        const opCarrier = seg.OperatingCarrier || seg.operating?.carrierCode || seg.operatingCarrierCode || undefined;
        return {
          origin: seg.departure?.iataCode || "",
          destination: seg.arrival?.iataCode || "",
          departure: seg.departure?.at || seg.departure?.DepartureTimeFormated2Time || "",
          arrival: seg.arrival?.at || seg.arrival?.ArrivalTimeFormated2Time || "",
          carrier: marketingCarrier,
          flightNumber: seg.FlightNumber || seg.flightNumber || "",
          operatingCarrier: opCarrier && opCarrier !== marketingCarrier ? opCarrier : undefined,
          operatingFlightNumber: seg.OperatingFlightNumber || seg.operatingFlightNumber || undefined,
          baggage: seg.AirBaggageAllowance || undefined,
        };
      });

      // Extract baggage allowance from API response or from segments
      const baggageInfo = f.baggageAllowance || itinerary?.baggageAllowance || null;
      const checkinBaggage = f.checkinBaggage || f.CheckinBaggage || itinerary?.CheckinBaggage || baggageInfo?.checkin || null;
      const cabinBaggage = f.cabinBaggage || f.CabinBaggage || itinerary?.CabinBaggage || baggageInfo?.cabin || null;
      // Fall back to segment-level baggage if top-level is missing
      const segBaggage = segments[0]?.AirBaggageAllowance || null;
      const effectiveCheckin = checkinBaggage || segBaggage;
      const apiBaggage = (effectiveCheckin || cabinBaggage) ? { checkin: effectiveCheckin || undefined, cabin: cabinBaggage || undefined } : null;

      // Extract base price and taxes from fare breakdown
      const baseFare = parseAmount(firstFare.BaseFare ?? firstFare.baseFare ?? firstFare.BaseAmount);
      const taxesAmt = parseAmount(firstFare.Tax ?? firstFare.tax ?? firstFare.Taxes ?? firstFare.taxes ?? firstFare.TotalTax);

      return {
        id: `travelvela-${f.id || idx}`,
        airline: typeof airline === "string" ? airline.substring(0, 2).toUpperCase() : "TV",
        flightNumber: String(flightNumber),
        from_city: firstSeg.departure?.iataCode || from,
        to_city: lastSeg.arrival?.iataCode || to,
        departure: String(departure),
        arrival: String(arrival),
        duration: String(duration),
        stops,
        price,
        currency,
        class: f.cabin_class || cabinClass,
        seats: f.numberOfBookableSeats ? parseInt(f.numberOfBookableSeats) : 9,
        is_active: true,
        source: "travelvela",
        segments: normalizedSegments,
        isRefundable: f.IsRefundable ?? false,
        changePenalties: f.ChangePenalties || null,
        cancelPenalties: f.CancelPenalties || null,
        baggageAllowance: apiBaggage,
        basePrice: Number.isFinite(baseFare) ? baseFare : null,
        taxes: Number.isFinite(taxesAmt) ? taxesAmt : null,
        // Pass through price_id needed for booking
        priceId: f.price_id || null,
        // Booking API needs duration in minutes and carrier info strings
        durationMinutes,
        originCarrierInfo: `${normalizedSegments[0]?.operatingCarrier || normalizedSegments[0]?.carrier || airline} ${normalizedSegments[0]?.flightNumber || ""}`.trim(),
        destinationCarrierInfo: `${normalizedSegments[normalizedSegments.length - 1]?.operatingCarrier || normalizedSegments[normalizedSegments.length - 1]?.carrier || airline} ${normalizedSegments[normalizedSegments.length - 1]?.flightNumber || ""}`.trim(),
      };
    });

    return new Response(JSON.stringify({ success: true, flights, count: flights.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("TravelVela function error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
