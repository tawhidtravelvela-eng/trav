// Tripjack Air Book edge function
// Flow: search → review (gets bookingId) → book (creates PNR)
// Routes through proxy: http://65.20.67.77/tj-pre/ → apitest.tripjack.com
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROXY_BASE_TEST = "http://65.20.67.77/tj-pre";
const PROXY_BASE_PROD = "http://65.20.67.77/tj";

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

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
  console.log(`[TripjackBook] POST ${url}`);
  return fetch(url, {
    method: "POST",
    headers: {
      "x-vela-key": proxySecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function parseJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

interface TripjackPassenger {
  title: string;
  firstName: string;
  lastName: string;
  dob?: string;
  nationality?: string;
  passportNumber?: string;
  passportCountry?: string;
  passportExpiry?: string;
  type: "ADT" | "CNN" | "INF";
}

function mapTitle(title: string, paxType: string): string {
  const t = title.toUpperCase().replace(/\./g, "").trim();
  // Children and infants use "Master" per Tripjack API spec
  if (paxType === "CNN" || paxType === "INF") return "Master";
  if (t === "MR" || t === "MR.") return "Mr";
  if (t === "MRS" || t === "MRS.") return "Mrs";
  if (t === "MS" || t === "MS." || t === "MISS") return "Ms";
  if (t === "MSTR" || t === "MSTR." || t === "MASTER") return "Master";
  return "Mr";
}

function mapPaxType(type: string): string {
  if (type === "ADT") return "ADULT";
  if (type === "CNN") return "CHILD";
  if (type === "INF") return "INFANT";
  return "ADULT";
}

function mapCountryCode(country: string | undefined): string {
  if (!country) return "";
  // Common country name to ISO code mapping
  const map: Record<string, string> = {
    "bangladesh": "BD", "india": "IN", "pakistan": "PK", "usa": "US",
    "united states": "US", "uk": "GB", "united kingdom": "GB",
    "saudi arabia": "SA", "uae": "AE", "united arab emirates": "AE",
    "canada": "CA", "australia": "AU", "malaysia": "MY", "singapore": "SG",
    "thailand": "TH", "indonesia": "ID", "china": "CN", "japan": "JP",
    "south korea": "KR", "germany": "DE", "france": "FR", "italy": "IT",
    "spain": "ES", "netherlands": "NL", "turkey": "TR", "qatar": "QA",
    "oman": "OM", "bahrain": "BH", "kuwait": "KW", "nepal": "NP",
    "sri lanka": "LK", "maldives": "MV", "myanmar": "MM", "vietnam": "VN",
    "philippines": "PH", "egypt": "EG", "south africa": "ZA",
    "brazil": "BR", "mexico": "MX", "russia": "RU", "ireland": "IE",
    "new zealand": "NZ", "hong kong": "HK", "taiwan": "TW",
  };
  // If it's already 2 chars, assume ISO code
  if (country.length === 2) return country.toUpperCase();
  return map[country.toLowerCase()] || country.substring(0, 2).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Require authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = await getConfig();
    if (!config.isActive) {
      return new Response(
        JSON.stringify({ success: false, error: "Tripjack flight booking is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      bookingId,
      passengers,
      contactEmail,
      contactPhone = "",
      paymentAmount,
      gstInfo,
      ssrInfoPerPax,
    } = body as {
      bookingId: string;
      passengers: TripjackPassenger[];
      contactEmail: string;
      contactPhone?: string;
      paymentAmount?: number;
      gstInfo?: any;
      ssrInfoPerPax?: (Record<string, any[]> | undefined)[];
    };

    if (!bookingId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing bookingId from review step" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!passengers?.length || !contactEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing passengers or contact email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build travellerInfo array per Tripjack API spec
    const travellerInfo = passengers.map((pax, paxIdx) => {
      const info: Record<string, any> = {
        ti: mapTitle(pax.title, pax.type),
        fN: pax.firstName,
        lN: pax.lastName,
        pt: mapPaxType(pax.type),
      };

      // DOB is required for all passengers (YYYY-MM-DD)
      if (pax.dob) info.dob = pax.dob;

      // pNat = passport nationality (2-letter ISO code) — required for all pax types
      if (pax.nationality) {
        info.pNat = mapCountryCode(pax.nationality);
      }

      // Passport number — send for all pax types when available
      if (pax.passportNumber) {
        info.pNum = pax.passportNumber;
      }

      // Passport issuing country — send for all pax types when available
      if (pax.passportCountry) {
        info.pid = mapCountryCode(pax.passportCountry);
      }

      // Passport expiry (eD) — send for all pax types when available
      if (pax.passportExpiry) {
        info.eD = pax.passportExpiry; // format: YYYY-MM-DD
      }

      // Merge SSR selections (seat, baggage, meal) if provided for this passenger
      if (ssrInfoPerPax?.[paxIdx]) {
        const paxSsr = ssrInfoPerPax[paxIdx];
        if (paxSsr?.ssrSeatInfos) info.ssrSeatInfos = paxSsr.ssrSeatInfos;
        if (paxSsr?.ssrBaggageInfos) info.ssrBaggageInfos = paxSsr.ssrBaggageInfos;
        if (paxSsr?.ssrMealInfos) info.ssrMealInfos = paxSsr.ssrMealInfos;
      }

      return info;
    });

    // Build delivery info
    const deliveryInfo: Record<string, any> = {
      emails: [contactEmail],
      contacts: contactPhone ? [contactPhone.replace(/[^0-9+]/g, "")] : [],
    };

    // Build booking payload
    const bookPayload: Record<string, any> = {
      bookingId,
      travellerInfo,
      deliveryInfo,
    };

    // Include payment only when caller provides a valid amount (Tripjack rejects hardcoded 0)
    if (typeof paymentAmount === "number" && Number.isFinite(paymentAmount) && paymentAmount > 0) {
      bookPayload.paymentInfos = [{ amount: Math.round(paymentAmount) }];
    }

    // Add GST info if provided (optional for Indian nationals)
    if (gstInfo && gstInfo.gstNumber) {
      bookPayload.gstInfo = {
        gstNumber: gstInfo.gstNumber,
        ...(gstInfo.companyName ? { registeredName: gstInfo.companyName } : {}),
        ...(gstInfo.companyAddress ? { address: gstInfo.companyAddress } : {}),
        ...(gstInfo.email ? { email: gstInfo.email } : {}),
        ...(gstInfo.phone ? { mobile: gstInfo.phone } : {}),
      };
    }

    console.log("[TripjackBook] Booking payload:", JSON.stringify(bookPayload).substring(0, 2000));

    const bookPaths = ["/fms/v1/book", "/oms/v1/air/book", "/oms/v1/book"];
    let bookData: any = null;
    let chosenPath: string | null = null;
    let lastStatus = 0;

    for (const path of bookPaths) {
      const bookRes = await tjFetch(path, bookPayload, config.proxySecret, config.proxyBase);
      lastStatus = bookRes.status;
      const parsed = await parseJsonSafe(bookRes);
      console.log("[TripjackBook] Try path:", path, "httpStatus:", bookRes.status, "success:", parsed?.status?.success);

      if (bookRes.status === 404) {
        continue;
      }

      bookData = parsed;
      chosenPath = path;
      break;
    }

    if (!bookData) {
      console.error("[TripjackBook] No valid booking endpoint found. Last status:", lastStatus);
      return new Response(
        JSON.stringify({ success: false, error: "Tripjack booking endpoint not available for this account/environment" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[TripjackBook] Final path:", chosenPath, "response status:", bookData?.status?.httpStatus, "success:", bookData?.status?.success);

    if (!bookData?.status?.success) {
      const errMsg = bookData?.errors?.[0]?.message || bookData?.error?.message || bookData?.message || "Booking failed";
      console.error("[TripjackBook] Booking failed:", JSON.stringify(bookData).substring(0, 1000));
      return new Response(
        JSON.stringify({ success: false, error: errMsg, apiResponse: bookData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract PNR from response
    const order = bookData?.itemInfos?.AIR?.travellerInfos?.[0];
    const pnr = bookData?.bookingId || bookingId;
    const airlinePnr = order?.pnrDetails?.airlinePnr || null;
    const crsPnr = order?.pnrDetails?.crsPnr || null;

    console.log("[TripjackBook] Success - bookingId:", pnr, "airlinePnr:", airlinePnr, "crsPnr:", crsPnr);

    return new Response(
      JSON.stringify({
        success: true,
        pnr: crsPnr || pnr,
        airlinePnr: airlinePnr || null,
        tripjackBookingId: pnr,
        status: bookData?.order?.status || "CONFIRMED",
        raw: bookData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[TripjackBook] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
