// Amadeus flight price verification edge function
// Uses Flight Offers Price API to re-validate fares before booking

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

function formatDuration(isoDuration: string): string {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return isoDuration;
  return `${match[1] || "0"}h ${match[2] || "0"}m`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { rawOffer, tenantCredentials } = body;

    if (!rawOffer) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing rawOffer for price verification" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = await getAmadeusConfig();
    const apiKey = tenantCredentials?.api_key || config.apiKey;
    const apiSecret = tenantCredentials?.api_secret || config.apiSecret;
    const env = tenantCredentials?.environment || config.environment;

    if (!config.isActive && !tenantCredentials) {
      return new Response(
        JSON.stringify({ success: false, error: "Amadeus is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getAccessToken(apiKey, apiSecret, env);
    const baseUrl = getBaseUrl(env);

    // Call Flight Offers Price API
    const pricePayload = {
      data: {
        type: "flight-offers-pricing",
        flightOffers: [rawOffer],
      },
    };

    console.log("[AmadeusPrice] Verifying offer:", rawOffer.id);

    const priceRes = await fetch(`${baseUrl}/v1/shopping/flight-offers/pricing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-HTTP-Method-Override": "GET",
      },
      body: JSON.stringify(pricePayload),
    });

    if (!priceRes.ok) {
      const errText = await priceRes.text();
      console.error("[AmadeusPrice] API error:", priceRes.status, errText);

      // Check for specific error codes
      if (priceRes.status === 400) {
        const errJson = JSON.parse(errText).catch(() => null);
        const detail = errJson?.errors?.[0]?.detail || "Fare no longer available";
        return new Response(
          JSON.stringify({ success: false, error: detail, unavailable: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `Amadeus price verification failed: ${priceRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceData = await priceRes.json();
    const verifiedOffer = priceData.data?.flightOffers?.[0];

    if (!verifiedOffer) {
      return new Response(
        JSON.stringify({ success: false, error: "No verified offer returned", unavailable: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract verified pricing
    const totalPrice = parseFloat(verifiedOffer.price?.total || "0");
    const basePrice = parseFloat(verifiedOffer.price?.base || "0");
    const taxes = Math.round((totalPrice - basePrice) * 100) / 100;
    const currency = verifiedOffer.price?.currency || "USD";

    // Extract pax pricing
    const paxPricing: Record<string, { base: number; taxes: number; total: number }> = {};
    for (const tp of (verifiedOffer.travelerPricings || [])) {
      const type = tp.travelerType === "ADULT" ? "ADT"
        : tp.travelerType === "CHILD" ? "CHD"
        : (tp.travelerType === "SEATED_INFANT" || tp.travelerType === "HELD_INFANT") ? "INF"
        : "ADT";
      if (!paxPricing[type]) {
        const b = parseFloat(tp.price?.base || "0");
        const t = parseFloat(tp.price?.total || "0");
        paxPricing[type] = { base: b, taxes: t - b, total: t };
      }
    }

    // Extract baggage
    const fareDetails = verifiedOffer.travelerPricings?.[0]?.fareDetailsBySegment;
    let baggageAllowance: { cabin?: string; checkin?: string } | null = null;
    if (fareDetails?.length) {
      const checkin = fareDetails[0].includedCheckedBags;
      baggageAllowance = {
        checkin: checkin
          ? (checkin.weight ? `${checkin.weight} ${checkin.weightUnit || "Kg"}` : checkin.quantity ? `${checkin.quantity} piece(s)` : undefined)
          : undefined,
        cabin: "7 Kg",
      };
    }

    // Determine refundability
    const isRefundable = verifiedOffer.pricingOptions?.refundableFare === true;

    // Compare old vs new price
    const oldPrice = parseFloat(rawOffer.price?.total || "0");
    const priceChanged = Math.abs(totalPrice - oldPrice) > 0.01;

    console.log("[AmadeusPrice] Verified: old=", oldPrice, "new=", totalPrice, "changed=", priceChanged);

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        totalPrice,
        basePrice,
        taxes,
        currency,
        paxPricing: Object.keys(paxPricing).length > 0 ? paxPricing : null,
        baggageAllowance,
        isRefundable,
        priceChanged,
        oldPrice,
        // Return verified raw offer for booking
        verifiedRawOffer: verifiedOffer,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[AmadeusPrice] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});