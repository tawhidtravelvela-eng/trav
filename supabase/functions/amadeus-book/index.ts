// Amadeus flight booking edge function
// Uses Flight Orders API to create a booking (PNR)
// Flow: search → price (verify) → book

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AmadeusToken {
  access_token: string;
  expires_in: number;
}

let cachedToken: AmadeusToken | null = null;
let tokenExpiry = 0;

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function getAmadeusConfig() {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("api_settings")
    .select("is_active, settings")
    .eq("provider", "amadeus")
    .maybeSingle();

  const settings = data?.settings as any;
  return {
    isActive: data?.is_active ?? false,
    apiKey: Deno.env.get("AMADEUS_API_KEY") || "",
    apiSecret: Deno.env.get("AMADEUS_API_SECRET") || "",
    environment: settings?.environment || "test",
  };
}

function getBaseUrl(env: string): string {
  return env === "production"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";
}

async function getAccessToken(apiKey: string, apiSecret: string, env: string): Promise<string> {
  if (!apiKey || !apiSecret) throw new Error("Amadeus API credentials not configured");

  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken.access_token;
  }

  const baseUrl = getBaseUrl(env);
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
  cachedToken = token;
  tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;
  return token.access_token;
}

interface Passenger {
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

function mapGender(title: string): string {
  const t = title.toUpperCase().replace(/\./g, "").trim();
  if (t === "MR" || t === "MSTR" || t === "MASTER") return "MALE";
  return "FEMALE";
}

function mapCountryCode(country: string | undefined): string {
  if (!country) return "BD";
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

    const config = await getAmadeusConfig();
    if (!config.isActive) {
      return new Response(
        JSON.stringify({ success: false, error: "Amadeus booking is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      rawOffer,
      passengers,
      contactEmail,
      contactPhone = "",
    } = body as {
      rawOffer: any;
      passengers: Passenger[];
      contactEmail: string;
      contactPhone?: string;
    };

    if (!rawOffer) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing rawOffer for booking" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!passengers?.length || !contactEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing passengers or contact email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAccessToken(config.apiKey, config.apiSecret, config.environment);
    const baseUrl = getBaseUrl(config.environment);

    // Build travelers array for Amadeus Flight Orders API
    // The traveler IDs must match those in the offer's travelerPricings
    const travelers = passengers.map((pax, idx) => {
      const travelerId = String(idx + 1); // Amadeus uses "1", "2", etc.

      const traveler: Record<string, any> = {
        id: travelerId,
        dateOfBirth: pax.dob || "1990-01-01",
        name: {
          firstName: pax.firstName.toUpperCase(),
          lastName: pax.lastName.toUpperCase(),
        },
        gender: mapGender(pax.title),
        contact: {
          emailAddress: contactEmail,
          phones: contactPhone ? [{
            deviceType: "MOBILE",
            countryCallingCode: "880",
            number: contactPhone.replace(/[^0-9]/g, "").slice(-10),
          }] : [],
        },
      };

      // Add documents (passport)
      if (pax.passportNumber) {
        traveler.documents = [{
          documentType: "PASSPORT",
          birthPlace: "",
          issuanceLocation: "",
          issuanceDate: "",
          number: pax.passportNumber,
          expiryDate: pax.passportExpiry || "2030-01-01",
          issuanceCountry: mapCountryCode(pax.passportCountry),
          validityCountry: mapCountryCode(pax.passportCountry),
          nationality: mapCountryCode(pax.nationality),
          holder: true,
        }];
      }

      return traveler;
    });

    // Build booking payload
    const bookPayload = {
      data: {
        type: "flight-order",
        flightOffers: [rawOffer],
        travelers,
        remarks: {
          general: [
            { subType: "GENERAL_MISCELLANEOUS", text: "ONLINE BOOKING" },
          ],
        },
        ticketingAgreement: {
          option: "DELAY_TO_QUEUE",
          dateTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0] + "T23:59:00",
        },
        contacts: [{
          addresseeName: { firstName: passengers[0].firstName.toUpperCase(), lastName: passengers[0].lastName.toUpperCase() },
          companyName: "TRAVEL PLATFORM",
          purpose: "STANDARD",
          phones: contactPhone ? [{
            deviceType: "MOBILE",
            countryCallingCode: "880",
            number: contactPhone.replace(/[^0-9]/g, "").slice(-10),
          }] : [],
          emailAddress: contactEmail,
        }],
      },
    };

    console.log("[AmadeusBook] Creating flight order...");

    const bookRes = await fetch(`${baseUrl}/v1/booking/flight-orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookPayload),
    });

    const bookData = await bookRes.json();

    if (!bookRes.ok) {
      const errorDetail = bookData?.errors?.[0]?.detail || bookData?.errors?.[0]?.title || "Booking failed";
      const errorCode = bookData?.errors?.[0]?.code;
      console.error("[AmadeusBook] Booking failed:", JSON.stringify(bookData).substring(0, 2000));
      return new Response(
        JSON.stringify({ success: false, error: `${errorDetail}${errorCode ? ` (${errorCode})` : ""}`, apiResponse: bookData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract PNR from response
    const orderId = bookData.data?.id || "";
    const associatedRecords = bookData.data?.associatedRecords || [];
    const pnr = associatedRecords[0]?.reference || orderId;
    const airlinePnr = associatedRecords.length > 1 ? associatedRecords[1]?.reference : null;

    // Extract ticket numbers if available
    const ticketNumbers: string[] = [];
    for (const traveler of (bookData.data?.travelers || [])) {
      // Tickets might be in traveler info
    }
    for (const tp of (bookData.data?.flightOffers?.[0]?.travelerPricings || [])) {
      // Check for ticket numbers in various places
    }

    console.log("[AmadeusBook] Success - orderId:", orderId, "PNR:", pnr, "airlinePnr:", airlinePnr);

    return new Response(
      JSON.stringify({
        success: true,
        pnr,
        airlinePnr,
        amadeusOrderId: orderId,
        status: "CONFIRMED",
        raw: bookData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[AmadeusBook] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});