// Amadeus flight search edge function
// Enhanced: returns segments, pax pricing, raw offer for pricing/booking

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

interface AmadeusToken {
  access_token: string;
  expires_in: number;
}

let cachedToken: AmadeusToken | null = null;
let tokenExpiry = 0;

async function getAccessToken(overrideKey?: string, overrideSecret?: string, overrideEnv?: string): Promise<string> {
  const apiKey = overrideKey || Deno.env.get("AMADEUS_API_KEY");
  const apiSecret = overrideSecret || Deno.env.get("AMADEUS_API_SECRET");

  if (!apiKey || !apiSecret) {
    throw new Error("Amadeus API credentials not configured");
  }

  if (!overrideKey && cachedToken && Date.now() < tokenExpiry) {
    return cachedToken.access_token;
  }

  const baseUrl = (overrideEnv === "production")
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";

  const res = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(apiSecret)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus auth failed: ${res.status} ${text}`);
  }

  const token: AmadeusToken = await res.json();
  if (!overrideKey) {
    cachedToken = token;
    tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;
  }
  return token.access_token;
}

function getBaseUrl(env?: string): string {
  return env === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";
}

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoDuration;
  const h = match[1] || "0";
  const m = match[2] || "0";
  return `${h}h ${m}m`;
}

function durationToMinutes(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 60) + parseInt(match[2] || "0");
}

function mapCabinClass(cabin: string): string {
  const map: Record<string, string> = {
    ECONOMY: "Economy",
    PREMIUM_ECONOMY: "Premium Economy",
    BUSINESS: "Business",
    FIRST: "First",
  };
  return map[cabin] || cabin;
}

// Extract per-passenger-type pricing from travelerPricings
function extractPaxPricing(offer: any): Record<string, { base: number; taxes: number; total: number }> | null {
  const travelerPricings = offer.travelerPricings;
  if (!travelerPricings?.length) return null;

  const paxMap: Record<string, { base: number; taxes: number; total: number; count: number }> = {};

  for (const tp of travelerPricings) {
    const type = tp.travelerType; // ADULT, CHILD, SEATED_INFANT, HELD_INFANT
    const key = type === "ADULT" ? "ADT"
      : type === "CHILD" ? "CHD"
      : (type === "SEATED_INFANT" || type === "HELD_INFANT") ? "INF"
      : "ADT";

    const base = parseFloat(tp.price?.base || "0");
    const total = parseFloat(tp.price?.total || "0");
    const taxes = total - base;

    if (!paxMap[key]) {
      paxMap[key] = { base, taxes, total, count: 1 };
    }
    // Use first occurrence's pricing (all same type should have same price)
  }

  const result: Record<string, { base: number; taxes: number; total: number }> = {};
  for (const [key, val] of Object.entries(paxMap)) {
    result[key] = { base: val.base, taxes: val.taxes, total: val.total };
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Build segments array from Amadeus offer for downstream use
function buildSegments(offer: any, dictionaries: any): any[] {
  const segments: any[] = [];
  const itineraries = offer.itineraries || [];

  for (let iIdx = 0; iIdx < itineraries.length; iIdx++) {
    const itin = itineraries[iIdx];
    const segs = itin.segments || [];
    for (const seg of segs) {
      const carrier = seg.carrierCode || "";
      const operating = seg.operating?.carrierCode || carrier;
      const airlineName = dictionaries?.carriers?.[carrier] || carrier;
      const operatingName = dictionaries?.carriers?.[operating] || operating;

      segments.push({
        carrier,
        operatingCarrier: operating !== carrier ? operating : undefined,
        operatingCarrierName: operating !== carrier ? operatingName : undefined,
        flightNumber: `${carrier}${seg.number || ""}`,
        origin: seg.departure?.iataCode || "",
        destination: seg.arrival?.iataCode || "",
        departure: seg.departure?.at || "",
        arrival: seg.arrival?.at || "",
        duration: seg.duration ? durationToMinutes(seg.duration) : 0,
        durationFormatted: seg.duration ? formatDuration(seg.duration) : "",
        cabin: mapCabinClass(
          offer.travelerPricings?.[0]?.fareDetailsBySegment?.find(
            (fds: any) => fds.segmentId === seg.id
          )?.cabin || "ECONOMY"
        ),
        bookingCode: offer.travelerPricings?.[0]?.fareDetailsBySegment?.find(
          (fds: any) => fds.segmentId === seg.id
        )?.class || "Y",
        airline: carrier,
        airlineName,
        group: iIdx,
        segmentId: seg.id,
        equipment: seg.aircraft?.code || "",
        terminal: {
          departure: seg.departure?.terminal || "",
          arrival: seg.arrival?.terminal || "",
        },
      });
    }
  }
  return segments;
}

// Extract baggage from fareDetailsBySegment
function extractBaggage(offer: any): { cabin?: string; checkin?: string } | null {
  const fareDetails = offer.travelerPricings?.[0]?.fareDetailsBySegment;
  if (!fareDetails?.length) return null;
  const first = fareDetails[0];
  const checkin = first.includedCheckedBags;
  const cabin = first.amenities?.find((a: any) => a.amenityType === "BAGGAGE");

  return {
    checkin: checkin
      ? (checkin.weight ? `${checkin.weight} ${checkin.weightUnit || "Kg"}` : checkin.quantity ? `${checkin.quantity} piece(s)` : undefined)
      : undefined,
    cabin: cabin?.description || "7 Kg",
  };
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
    const body = await req.json();
    const tc = body.tenantCredentials;
    const env = tc?.environment || body.environment || "test";

    // Test mode: just verify credentials
    if (body.test) {
      const token = await getAccessToken(tc?.api_key, tc?.api_secret, env);
      return new Response(JSON.stringify({ success: true, message: "Amadeus credentials valid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getAccessToken(tc?.api_key, tc?.api_secret, env);
    const baseUrl = getBaseUrl(env);

    const { from, to, departDate, returnDate, adults = 1, children = 0, infants = 0, cabinClass = "Economy" } = body;

    if (!from || !to || !departDate) {
      return new Response(JSON.stringify({ success: false, error: "Missing required search parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cabinMap: Record<string, string> = {
      Economy: "ECONOMY",
      "Premium Economy": "PREMIUM_ECONOMY",
      Business: "BUSINESS",
      First: "FIRST",
    };

    const params = new URLSearchParams({
      originLocationCode: from,
      destinationLocationCode: to,
      departureDate: departDate,
      adults: String(adults),
      travelClass: cabinMap[cabinClass] || "ECONOMY",
      max: "30",
      currencyCode: "USD",
    });

    if (children > 0) params.set("children", String(children));
    if (infants > 0) params.set("infants", String(infants));
    if (returnDate) params.set("returnDate", returnDate);

    const searchRes = await fetch(
      `${baseUrl}/v2/shopping/flight-offers?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error("Amadeus search error:", errText);
      return new Response(JSON.stringify({ success: false, error: `Amadeus API error: ${searchRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchData = await searchRes.json();
    const offers = searchData.data || [];
    const dictionaries = searchData.dictionaries || {};

    const flights = offers.map((offer: any, idx: number) => {
      const segments = buildSegments(offer, dictionaries);
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];

      const totalPrice = parseFloat(offer.price?.total || "0");
      const basePrice = parseFloat(offer.price?.base || "0");
      const taxes = totalPrice - basePrice;

      const paxPricing = extractPaxPricing(offer);
      const baggage = extractBaggage(offer);

      // Determine if flight is instant ticketing (LCC) or hold eligible
      const isInstantTicket = offer.instantTicketingRequired === true;
      const isRefundable = offer.pricingOptions?.refundableFare === true;

      return {
        id: `amadeus-${offer.id || idx}`,
        airline: firstSegment?.carrier || "Unknown",
        flightNumber: firstSegment?.flightNumber || "",
        from_city: firstSegment?.origin || from,
        to_city: lastSegment?.destination || to,
        departure: firstSegment?.departure || "",
        arrival: lastSegment?.arrival || "",
        duration: offer.itineraries?.[0]?.duration
          ? formatDuration(offer.itineraries[0].duration)
          : "",
        stops: Math.max(0, segments.length - 1),
        price: totalPrice,
        basePrice,
        taxes: Math.round(taxes * 100) / 100,
        currency: offer.price?.currency || "USD",
        class: segments[0]?.cabin || mapCabinClass("ECONOMY"),
        seats: offer.numberOfBookableSeats || 9,
        is_active: true,
        source: "amadeus",
        segments,
        paxPricing,
        baggageAllowance: baggage,
        isRefundable,
        isInstantTicket,
        // Store raw Amadeus offer for pricing/booking calls
        amadeusRawOffer: offer,
        amadeusOfferId: offer.id,
        classOfBooking: segments[0]?.bookingCode || "Y",
        // Store dictionaries for booking
        amadeusDictionaries: dictionaries,
      };
    });

    return new Response(JSON.stringify({ success: true, flights, count: flights.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Amadeus function error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});