// Tripjack SSR (Special Service Request) edge function
// Fetches available ancillaries: seats, extra baggage, meals
// Called after review to get SSR options for booking
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROXY_BASE_TEST = "http://65.20.67.77/tj-pre";
const PROXY_BASE_PROD = "http://65.20.67.77/tj";

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

function convertSsrItems(items: any[], targetCurrency: string, exchangeConfig: ExchangeConfig): any[] {
  const fromCurrency = exchangeConfig.sourceCurrencies["tripjack"] || "INR";
  return items.map((item: any) => ({
    ...item,
    originalAmount: item.amount,
    originalCurrency: item.currency || fromCurrency,
    amount: convertAmount(item.amount || 0, item.currency || fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup),
    currency: targetCurrency,
  }));
}

function convertSeatMaps(seatMaps: any[], targetCurrency: string, exchangeConfig: ExchangeConfig): any[] {
  const fromCurrency = exchangeConfig.sourceCurrencies["tripjack"] || "INR";
  return seatMaps.map((sm: any) => ({
    ...sm,
    rows: (sm.rows || []).map((row: any) => ({
      ...row,
      seats: (row.seats || []).map((seat: any) => ({
        ...seat,
        originalAmount: seat.amount,
        originalCurrency: seat.currency || fromCurrency,
        amount: convertAmount(seat.amount || 0, seat.currency || fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup),
        currency: targetCurrency,
      })),
    })),
  }));
}

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
  console.log(`[TripjackSSR] POST ${url}`);
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
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { bookingId, type, targetCurrency } = body as { bookingId: string; type?: "seatMap" | "ssr" | "all"; targetCurrency?: string };

    if (!bookingId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing bookingId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = await getConfig();
    if (!config.isActive) {
      return new Response(
        JSON.stringify({ success: false, error: "Tripjack flight is disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestType = type || "all";
    const results: Record<string, any> = {};

    // Load exchange config if currency conversion needed
    let exchangeConfig: ExchangeConfig | null = null;
    if (targetCurrency) {
      const sb = getSupabaseAdmin();
      exchangeConfig = await loadExchangeConfig(sb);
    }

    // Fetch seat map
    if (requestType === "seatMap" || requestType === "all") {
      try {
        const seatRes = await tjFetch("/fms/v1/seat-map", { bookingId }, config.proxySecret, config.proxyBase);
        const seatData = await parseJsonSafe(seatRes);
        
        if (seatData?.status?.success && seatData?.tripSeatMap) {
          const seatMaps: any[] = [];
          const tripSeatMap = seatData.tripSeatMap;
          
          for (const trip of Object.values(tripSeatMap) as any[]) {
            if (!trip?.sInfo) continue;
            for (const segment of trip.sInfo) {
              const segmentSeats: any = {
                segmentId: segment.sI?.id || "",
                airline: segment.sI?.fD?.aI?.code || "",
                flightNumber: segment.sI?.fD?.fN || "",
                origin: segment.sI?.da?.code || "",
                destination: segment.sI?.aa?.code || "",
                rows: [],
              };

              if (segment.sData) {
                for (const row of segment.sData) {
                  const rowData: any = {
                    rowNumber: row.row,
                    seats: [],
                  };
                  if (row.cs) {
                    for (const seat of row.cs) {
                      rowData.seats.push({
                        number: `${row.row}${seat.cl}`,
                        column: seat.cl,
                        available: seat.avl === true,
                        amount: seat.amt || 0,
                        currency: seat.cur || "INR",
                        type: seat.st || "",
                        characteristics: seat.chars || [],
                        ssrType: 4,
                        key: seat.key || seat.ssrKey || "",
                      });
                    }
                  }
                  segmentSeats.rows.push(rowData);
                }
              }
              seatMaps.push(segmentSeats);
            }
          }

          // Convert seat prices if targetCurrency provided
          results.seatMaps = targetCurrency && exchangeConfig
            ? convertSeatMaps(seatMaps, targetCurrency, exchangeConfig)
            : seatMaps;
        } else {
          console.log("[TripjackSSR] Seat map not available:", seatData?.errors?.[0]?.message || "No data");
          results.seatMaps = [];
        }
      } catch (err) {
        console.error("[TripjackSSR] Seat map error:", err);
        results.seatMaps = [];
      }
    }

    // Fetch SSR (baggage + meals)
    if (requestType === "ssr" || requestType === "all") {
      try {
        const ssrPaths = ["/fms/v1/ssr", "/oms/v1/air/ssr"];
        let ssrData: any = null;

        for (const path of ssrPaths) {
          const ssrRes = await tjFetch(path, { bookingId }, config.proxySecret, config.proxyBase);
          if (ssrRes.status === 404) continue;
          const parsed = await parseJsonSafe(ssrRes);
          if (parsed?.status?.success || parsed?.ssrInfo) {
            ssrData = parsed;
            break;
          }
          if (parsed && !parsed?.raw) {
            ssrData = parsed;
            break;
          }
        }

        if (ssrData) {
          const baggageOptions: any[] = [];
          const mealOptions: any[] = [];

          const ssrInfoSource = ssrData.ssrInfo || {};
          const tripInfos = ssrData.tripInfos || [];

          for (const trip of tripInfos) {
            if (!trip?.sI) continue;
            for (const seg of trip.sI) {
              const segId = seg.id || "";
              const segLabel = `${seg.da?.code || ""} → ${seg.aa?.code || ""}`;

              const baggage = seg.ssrInfo?.BAGGAGE || seg.ssrInfo?.EXTRA_BAGGAGE || [];
              for (const b of baggage) {
                baggageOptions.push({
                  segmentId: segId,
                  segmentLabel: segLabel,
                  code: b.code || b.desc,
                  description: b.desc || b.code,
                  amount: b.amount || 0,
                  currency: b.cur || "INR",
                  ssrType: 2,
                  key: b.key || b.ssrKey || "",
                });
              }

              const meals = seg.ssrInfo?.MEAL || [];
              for (const m of meals) {
                mealOptions.push({
                  segmentId: segId,
                  segmentLabel: segLabel,
                  code: m.code,
                  description: m.desc || m.code,
                  amount: m.amount || 0,
                  currency: m.cur || "INR",
                  ssrType: 3,
                  key: m.key || m.ssrKey || "",
                });
              }
            }
          }

          if (ssrInfoSource.BAGGAGE || ssrInfoSource.EXTRA_BAGGAGE) {
            const baggage = ssrInfoSource.BAGGAGE || ssrInfoSource.EXTRA_BAGGAGE || [];
            for (const b of baggage) {
              baggageOptions.push({
                segmentId: "",
                segmentLabel: "",
                code: b.code || b.desc,
                description: b.desc || b.code,
                amount: b.amount || 0,
                currency: b.cur || "INR",
                ssrType: 2,
                key: b.key || b.ssrKey || "",
              });
            }
          }

          if (ssrInfoSource.MEAL) {
            for (const m of ssrInfoSource.MEAL) {
              mealOptions.push({
                segmentId: "",
                segmentLabel: "",
                code: m.code,
                description: m.desc || m.code,
                amount: m.amount || 0,
                currency: m.cur || "INR",
                ssrType: 3,
                key: m.key || m.ssrKey || "",
              });
            }
          }

          // Convert prices if targetCurrency provided
          results.baggageOptions = targetCurrency && exchangeConfig
            ? convertSsrItems(baggageOptions, targetCurrency, exchangeConfig)
            : baggageOptions;
          results.mealOptions = targetCurrency && exchangeConfig
            ? convertSsrItems(mealOptions, targetCurrency, exchangeConfig)
            : mealOptions;
        } else {
          console.log("[TripjackSSR] SSR endpoint not available");
          results.baggageOptions = [];
          results.mealOptions = [];
        }
      } catch (err) {
        console.error("[TripjackSSR] SSR error:", err);
        results.baggageOptions = [];
        results.mealOptions = [];
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        displayCurrency: targetCurrency || "INR",
        ...results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[TripjackSSR] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
