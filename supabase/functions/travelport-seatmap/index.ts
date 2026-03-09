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

interface TravelportSettings {
  target_branch: string;
  username: string;
  password: string;
  endpoint: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildSeatMapRequest(settings: TravelportSettings, segments: any[]): string {
  const segmentXml = segments
    .map(
      (seg: any, i: number) => `
      <air:AirSegment Key="seg${i}" Group="0"
        Carrier="${escapeXml(seg.carrier)}" FlightNumber="${escapeXml(seg.flightNumber)}"
        Origin="${escapeXml(seg.origin)}" Destination="${escapeXml(seg.destination)}"
        DepartureTime="${seg.departure}" ArrivalTime="${seg.arrival}"
        ProviderCode="1G">
      </air:AirSegment>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <air:SeatMapReq TargetBranch="${escapeXml(settings.target_branch)}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      ${segmentXml}
    </air:SeatMapReq>
  </soap:Body>
</soap:Envelope>`;
}

function parseSeatMapResponse(xmlText: string, segments: any[]): any[] {
  const seatMaps: any[] = [];

  const normalized = xmlText
    .replace(/air_v\d+_\d+:/g, "air:")
    .replace(/<\/air_v\d+_\d+:/g, "</air:");

  const seatMapRegex = /<air:AirSeatMap[^>]*>([\s\S]*?)<\/air:AirSeatMap>/g;
  let mapMatch;
  let mapIdx = 0;

  while ((mapMatch = seatMapRegex.exec(normalized)) !== null) {
    const mapBody = mapMatch[0];

    const carrierMatch = mapBody.match(/Carrier="([^"]*)"/);
    const flightNumMatch = mapBody.match(/FlightNumber="([^"]*)"/);
    const originMatch = mapBody.match(/Origin="([^"]*)"/);
    const destMatch = mapBody.match(/Destination="([^"]*)"/);

    const carrier = carrierMatch?.[1] || segments[mapIdx]?.carrier || "";
    const flightNumber = flightNumMatch?.[1] || segments[mapIdx]?.flightNumber || "";
    const origin = originMatch?.[1] || segments[mapIdx]?.origin || "";
    const destination = destMatch?.[1] || segments[mapIdx]?.destination || "";

    const rows: any[] = [];

    const rowRegex = /<air:Row Number="(\d+)">([\s\S]*?)<\/air:Row>/g;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(mapBody)) !== null) {
      const rowNumber = parseInt(rowMatch[1]);
      const rowBody = rowMatch[2];
      const seats: any[] = [];

      const facilityRegex = /<air:Facility[^>]*SeatCode="([^"]*)"[^>]*>([\s\S]*?)<\/air:Facility>/g;
      let facilityMatch;

      while ((facilityMatch = facilityRegex.exec(rowBody)) !== null) {
        const seatCode = facilityMatch[1];
        const facilityBody = facilityMatch[0];

        const availMatch = facilityBody.match(/Avail="([^"]*)"/);
        const typeMatch = facilityBody.match(/SeatType="([^"]*)"/);

        const charRegex = /<air:Characteristic Value="([^"]*)"/g;
        const chars: string[] = [];
        let charMatch;
        while ((charMatch = charRegex.exec(facilityBody)) !== null) {
          chars.push(charMatch[1]);
        }

        const priceMatch = facilityBody.match(/<air:SeatPrice[^>]*TotalAmount="([A-Z]{3})([\d.]+)"/);
        const facilityPriceMatch = facilityBody.match(/TotalAmount="([A-Z]{3})([\d.]+)"/);

        const column = seatCode.replace(/\d/g, "");
        const priceInfo = priceMatch || facilityPriceMatch;

        seats.push({
          number: `${rowNumber}${column}`,
          column,
          available: availMatch?.[1] === "Available" || availMatch?.[1] === "true",
          amount: priceInfo ? parseFloat(priceInfo[2]) : 0,
          currency: priceInfo ? priceInfo[1] : "USD",
          type: typeMatch?.[1] || "Standard",
          characteristics: chars,
          ssrType: 4,
          key: `seat-${rowNumber}${column}`,
        });
      }

      if (seats.length > 0) {
        rows.push({ rowNumber, seats });
      }
    }

    seatMaps.push({
      segmentId: `tp-seg-${mapIdx}`,
      airline: carrier,
      flightNumber,
      origin,
      destination,
      rows,
    });

    mapIdx++;
  }

  return seatMaps;
}

function convertSeatMaps(seatMaps: any[], targetCurrency: string, exchangeConfig: ExchangeConfig): any[] {
  const fromCurrency = exchangeConfig.sourceCurrencies["travelport"] || "BDT";
  return seatMaps.map((sm: any) => ({
    ...sm,
    rows: (sm.rows || []).map((row: any) => ({
      ...row,
      seats: (row.seats || []).map((seat: any) => {
        const seatCurrency = seat.currency || fromCurrency;
        return {
          ...seat,
          originalAmount: seat.amount,
          originalCurrency: seatCurrency,
          amount: convertAmount(seat.amount || 0, seatCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup),
          currency: targetCurrency,
        };
      }),
    })),
  }));
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
    const { segments, targetCurrency } = body;

    if (!segments?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing segments for seat map" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const seatMapXml = buildSeatMapRequest(settings, segments);
    const credentials = btoa(`${settings.username}:${settings.password}`);

    console.log("[travelport-seatmap] Fetching seat map...");

    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Authorization: `Basic ${credentials}`,
        SOAPAction: "",
      },
      body: seatMapXml,
    });

    const responseText = await response.text();

    if (!response.ok) {
      const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
      if (faultMatch) {
        console.warn("[travelport-seatmap] SOAP fault:", faultMatch[1]);
        return new Response(
          JSON.stringify({ success: true, seatMaps: [], warning: faultMatch[1] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, seatMaps: [], warning: `API error: ${response.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let seatMaps = parseSeatMapResponse(responseText, segments);
    console.log(`[travelport-seatmap] Parsed ${seatMaps.length} seat maps`);

    // Convert seat prices to target currency if requested
    if (targetCurrency && seatMaps.length > 0) {
      const exchangeConfig = await loadExchangeConfig(adminClient);
      seatMaps = convertSeatMaps(seatMaps, targetCurrency, exchangeConfig);
    }

    return new Response(
      JSON.stringify({ success: true, displayCurrency: targetCurrency || null, seatMaps }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[travelport-seatmap] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
