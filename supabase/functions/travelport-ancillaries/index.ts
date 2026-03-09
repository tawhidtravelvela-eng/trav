import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Currency conversion utilities ──
const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, BDT: 110.5, INR: 83, CNY: 7.24,
};

interface ExchangeConfig {
  rates: Record<string, number>;
  markup: number;
  sourceCurrencies: Record<string, string>;
}

async function loadExchangeConfig(sb: any): Promise<ExchangeConfig> {
  const config: ExchangeConfig = {
    rates: { ...DEFAULT_EXCHANGE_RATES },
    markup: 0,
    sourceCurrencies: { travelport: "BDT", tripjack: "INR", amadeus: "USD" },
  };
  try {
    const { data } = await sb
      .from("api_settings")
      .select("settings")
      .eq("provider", "currency_rates")
      .maybeSingle();
    if (data?.settings) {
      const s = data.settings as any;
      if (s.live_rates) config.rates = { ...config.rates, ...s.live_rates };
      if (s.conversion_markup !== undefined) config.markup = s.conversion_markup;
      if (s.api_source_currencies) config.sourceCurrencies = { ...config.sourceCurrencies, ...s.api_source_currencies };
    }
  } catch {}
  return config;
}

function convertAmount(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>, markup: number): number {
  if (fromCurrency === toCurrency) return Math.round(amount);
  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;
  return Math.round((amount / fromRate) * toRate * (1 + markup / 100));
}

function convertOptionItems(items: any[], targetCurrency: string, exchangeConfig: ExchangeConfig, provider: string): any[] {
  const fromCurrency = exchangeConfig.sourceCurrencies[provider] || "USD";
  return items.map((item: any) => {
    const itemCurrency = item.currency || fromCurrency;
    return {
      ...item,
      originalAmount: item.amount,
      originalCurrency: itemCurrency,
      amount: convertAmount(item.amount || 0, itemCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup),
      currency: targetCurrency,
    };
  });
}

interface TravelportSettings {
  target_branch: string;
  username: string;
  password: string;
  endpoint: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildMerchandisingRequest(
  settings: TravelportSettings,
  segments: any[],
  passengers: { type: string; count: number }[]
): string {
  const segmentXml = segments
    .map((seg: any, i: number) => {
      const key = seg.key || `seg${i}`;
      return `
      <air:AirSegment Key="${escapeXml(key)}" Group="${seg.group ?? 0}"
        Carrier="${escapeXml(seg.carrier)}" FlightNumber="${escapeXml(seg.flightNumber)}"
        Origin="${escapeXml(seg.origin)}" Destination="${escapeXml(seg.destination)}"
        DepartureTime="${seg.departure}" ArrivalTime="${seg.arrival}"
        ClassOfService="${escapeXml(seg.bookingCode || seg.classOfService || "Y")}"
        ProviderCode="1G">
      </air:AirSegment>`;
    })
    .join("");

  let travelerIdx = 0;
  const travelerXml = passengers
    .flatMap((pax) => {
      const typeCode = pax.type === "ADT" ? "ADT" : pax.type === "CNN" ? "CNN" : "INF";
      return Array.from({ length: pax.count }, () => {
        const key = `trav${travelerIdx++}`;
        return `<com:SearchTraveler Key="${key}" TravelerType="${typeCode}"/>`;
      });
    })
    .join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <air:AirMerchandisingOfferAvailabilityReq TargetBranch="${escapeXml(settings.target_branch)}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      ${segmentXml}
      ${travelerXml}
    </air:AirMerchandisingOfferAvailabilityReq>
  </soap:Body>
</soap:Envelope>`;
}

interface ParsedOptionalService {
  type: string;
  code: string;
  description: string;
  amount: number;
  currency: string;
  carrier: string;
  segmentRef: string;
  key: string;
  subCode: string;
  ssrCode: string;
}

function normalizeNamespaces(xml: string): string {
  return xml
    .replace(/air_v\d+_\d+:/g, "air:")
    .replace(/common_v\d+_\d+:/g, "com:")
    .replace(/<\/air_v\d+_\d+:/g, "</air:")
    .replace(/<\/common_v\d+_\d+:/g, "</com:");
}

function parseMerchandisingResponse(xmlText: string): {
  baggageOptions: ParsedOptionalService[];
  mealOptions: ParsedOptionalService[];
  otherOptions: ParsedOptionalService[];
} {
  const normalized = normalizeNamespaces(xmlText);

  const baggageOptions: ParsedOptionalService[] = [];
  const mealOptions: ParsedOptionalService[] = [];
  const otherOptions: ParsedOptionalService[] = [];

  const optServiceRegex = /<air:OptionalService\s([^>]*?)(?:\/>|>([\s\S]*?)<\/air:OptionalService>)/g;
  let match;
  let keyCounter = 0;

  while ((match = optServiceRegex.exec(normalized)) !== null) {
    const attrs = match[1];
    const body = match[2] || "";

    const typeMatch = attrs.match(/Type="([^"]*)"/);
    const type = typeMatch?.[1] || "Other";

    const priceMatch = attrs.match(/TotalPrice="([A-Z]{3})([\d.]+)"/);
    const currency = priceMatch?.[1] || "USD";
    const amount = priceMatch ? parseFloat(priceMatch[2]) : 0;

    const carrierMatch = attrs.match(/SupplierCode="([^"]*)"/);
    const carrier = carrierMatch?.[1] || "";

    const keyMatch = attrs.match(/Key="([^"]*)"/);
    const key = keyMatch?.[1] || `opt${keyCounter++}`;

    const subCodeMatch = attrs.match(/ServiceSubCode="([^"]*)"/);
    const subCode = subCodeMatch?.[1] || "";

    const ssrCodeMatch = attrs.match(/SSRCode="([^"]*)"/);
    const ssrCode = ssrCodeMatch?.[1] || "";

    const nameMatch = body.match(/<air:ServiceData[^>]*>([\s\S]*?)<\/air:ServiceData>/);
    let description = "";
    if (nameMatch) {
      const descMatch = nameMatch[1].match(/<air:Description>(.*?)<\/air:Description>/);
      description = descMatch?.[1] || "";
    }
    if (!description) {
      const commNameMatch = attrs.match(/CommercialName="([^"]*)"/);
      description = commNameMatch?.[1] || `${type} - ${subCode}`;
    }

    const item: ParsedOptionalService = {
      type,
      code: subCode || ssrCode || key,
      description,
      amount,
      currency,
      carrier,
      segmentRef: "",
      key,
      subCode,
      ssrCode,
    };

    const typeLower = type.toLowerCase();
    if (typeLower === "baggage") {
      baggageOptions.push(item);
    } else if (typeLower === "meal" || typeLower === "inflight meal" || ssrCode === "MEAL") {
      mealOptions.push(item);
    } else if (typeLower !== "seat") {
      otherOptions.push(item);
    }
  }

  return { baggageOptions, mealOptions, otherOptions };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const { data: apiSettings } = await adminClient
      .from("api_settings")
      .select("is_active, settings")
      .eq("provider", "travelport")
      .single();

    if (!apiSettings?.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: "Travelport API not configured or disabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const secretUsername = Deno.env.get("TRAVELPORT_USERNAME");
    const secretPassword = Deno.env.get("TRAVELPORT_PASSWORD");
    const secretBranch = Deno.env.get("TRAVELPORT_TARGET_BRANCH");
    const dbSettings = (apiSettings.settings || {}) as any;
    const settings: TravelportSettings = (secretUsername && secretPassword && secretBranch)
      ? { target_branch: secretBranch, username: secretUsername, password: secretPassword, endpoint: dbSettings.endpoint || "https://apac.universal-api.travelport.com/B2BGateway/connect/uAPI/AirService" }
      : dbSettings as TravelportSettings;
    const body = await req.json();
    const { segments, adults = 1, children = 0, infants = 0, targetCurrency } = body;

    if (!segments?.length) {
      return new Response(
        JSON.stringify({ success: true, baggageOptions: [], mealOptions: [], otherOptions: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const passengerTypes: { type: string; count: number }[] = [];
    if (adults > 0) passengerTypes.push({ type: "ADT", count: adults });
    if (children > 0) passengerTypes.push({ type: "CNN", count: children });
    if (infants > 0) passengerTypes.push({ type: "INF", count: infants });

    const merchandisingXml = buildMerchandisingRequest(settings, segments, passengerTypes);
    const credentials = btoa(`${settings.username}:${settings.password}`);

    console.log("[travelport-ancillaries] Sending AMOA request...");

    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Authorization: `Basic ${credentials}`,
        SOAPAction: "",
      },
      body: merchandisingXml,
    });

    const responseText = await response.text();

    const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      console.warn("[travelport-ancillaries] SOAP fault:", faultMatch[1]);
      return new Response(
        JSON.stringify({ success: true, baggageOptions: [], mealOptions: [], otherOptions: [], warning: faultMatch[1] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      console.warn("[travelport-ancillaries] API error:", response.status);
      return new Response(
        JSON.stringify({ success: true, baggageOptions: [], mealOptions: [], otherOptions: [], warning: `API error: ${response.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parseMerchandisingResponse(responseText);
    console.log(`[travelport-ancillaries] Found ${result.baggageOptions.length} baggage, ${result.mealOptions.length} meal options`);

    // Convert prices to target currency if requested
    if (targetCurrency) {
      const exchangeConfig = await loadExchangeConfig(adminClient);
      result.baggageOptions = convertOptionItems(result.baggageOptions, targetCurrency, exchangeConfig, "travelport") as any;
      result.mealOptions = convertOptionItems(result.mealOptions, targetCurrency, exchangeConfig, "travelport") as any;
      result.otherOptions = convertOptionItems(result.otherOptions, targetCurrency, exchangeConfig, "travelport") as any;
    }

    return new Response(
      JSON.stringify({ success: true, displayCurrency: targetCurrency || null, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[travelport-ancillaries] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
