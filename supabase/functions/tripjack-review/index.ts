// Tripjack Air Review (revalidate/price) edge function
// Routes through proxy: http://65.20.67.77/tj-pre/ → apitest.tripjack.com
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
  console.log(`[TripjackReview] POST ${url}`);
  return fetch(url, {
    method: "POST",
    headers: {
      "x-vela-key": proxySecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { priceIds, targetCurrency } = body;

    if (!priceIds || !Array.isArray(priceIds) || priceIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing priceIds" }),
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

    const reviewRes = await tjFetch("/fms/v1/review", { priceIds }, config.proxySecret, config.proxyBase);
    const reviewData = await reviewRes.json();

    console.log("[TripjackReview] Response status:", reviewData?.status?.httpStatus, "success:", reviewData?.status?.success);

    if (!reviewData?.status?.success) {
      const errMsg = reviewData?.errors?.[0]?.message || "Review failed";
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract baggage info from review response
    const tripInfos = reviewData?.tripInfos || [];
    let baggageAllowance: { cabin?: string; checkin?: string } | null = null;
    let fareRuleInfo: any = null;
    let isRefundable: boolean | undefined;
    let bookingId = reviewData?.bookingId || null;
    let conditions = reviewData?.conditions || null;
    let totalPriceInfo = reviewData?.totalPriceInfo || null;

    // Extract SSR options (meals, baggage) from segment data
    const ssrMealOptions: any[] = [];
    const ssrBaggageOptions: any[] = [];

    for (const trip of tripInfos) {
      // Extract SSR from segments
      if (trip?.sI) {
        for (const seg of trip.sI) {
          const segId = seg.id || "";
          const segLabel = `${seg.da?.code || ""} → ${seg.aa?.code || ""}`;

          // Meals
          if (seg.ssrInfo?.MEAL) {
            for (const m of seg.ssrInfo.MEAL) {
              ssrMealOptions.push({
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

          // Extra baggage
          const baggage = seg.ssrInfo?.BAGGAGE || seg.ssrInfo?.EXTRA_BAGGAGE || [];
          for (const b of baggage) {
            ssrBaggageOptions.push({
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
        }
      }

      if (!trip?.totalPriceList?.length) continue;
      const priceInfo = trip.totalPriceList[0];
      const adultFare = priceInfo?.fd?.ADULT;

      // Baggage
      if (adultFare?.bI) {
        baggageAllowance = {
          cabin: adultFare.bI.cB || undefined,
          checkin: adultFare.bI.iB || undefined,
        };
      }

      // Refund type
      if (adultFare?.rT !== undefined) {
        isRefundable = adultFare.rT === 1;
      }

      // Fare rule info from review (fareRuleInformation field)
      if (priceInfo?.fareRuleInformation) {
        fareRuleInfo = priceInfo.fareRuleInformation;
      }
    }

    // Extract fare alerts (price changes)
    const alerts = reviewData?.alerts || [];
    const fareAlert = alerts.find((a: any) => a.type === "FAREALERT");

    // Convert SSR prices to target currency if requested
    let finalMealOptions = ssrMealOptions;
    let finalBaggageOptions = ssrBaggageOptions;
    if (targetCurrency) {
      const sb = getSupabaseAdmin();
      const exchangeConfig = await loadExchangeConfig(sb);
      finalMealOptions = convertSsrItems(ssrMealOptions, targetCurrency, exchangeConfig);
      finalBaggageOptions = convertSsrItems(ssrBaggageOptions, targetCurrency, exchangeConfig);
    }

    return new Response(
      JSON.stringify({
        success: true,
        bookingId,
        baggageAllowance,
        isRefundable,
        fareRuleInfo,
        conditions,
        totalPriceInfo,
        fareAlert: fareAlert ? { oldFare: fareAlert.oldFare, newFare: fareAlert.newFare } : null,
        ssrData: {
          mealOptions: finalMealOptions,
          baggageOptions: finalBaggageOptions,
        },
        raw: reviewData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[TripjackReview] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
