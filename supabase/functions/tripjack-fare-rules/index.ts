// Tripjack Fare Rule V2 API edge function
// Routes through proxy: http://65.20.67.77/tj-pre/ → apitest.tripjack.com
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROXY_BASE_TEST = "http://65.20.67.77/tj-pre";
const PROXY_BASE_PROD = "http://65.20.67.77/tj";

// ── Currency conversion utilities (same as unified-flight-search) ──
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

/** Convert INR penalty amounts in rules to target currency */
function convertTripjackRules(rules: any[], targetCurrency: string, exchangeConfig: ExchangeConfig): any[] {
  const fromCurrency = exchangeConfig.sourceCurrencies["tripjack"] || "INR";
  
  return rules.map((rule: any) => {
    if (rule.type === "mini" && rule.rules) {
      const convertedRules: Record<string, any> = {};
      for (const [ruleType, ruleData] of Object.entries(rule.rules as Record<string, any>)) {
        const policies = ruleData.policies || [];
        convertedRules[ruleType] = {
          ...ruleData,
          policies: policies.map((p: any) => {
            const converted = { ...p };
            if (p.amount != null && p.amount > 0) {
              converted.displayAmount = convertAmount(p.amount, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
            }
            if (p.additionalFee != null && p.additionalFee > 0) {
              converted.displayAdditionalFee = convertAmount(p.additionalFee, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
            }
            // Convert INR amounts in policyInfo text
            if (p.policyInfo && typeof p.policyInfo === "string") {
              converted.policyInfo = p.policyInfo.replace(
                /(?:Rs\.?|INR)\s*([\d,]+)/gi,
                (_match: string, numStr: string) => {
                  const amt = Number(numStr.replace(/,/g, ""));
                  if (isNaN(amt)) return _match;
                  const convertedAmt = convertAmount(amt, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
                  return `${targetCurrency} ${convertedAmt.toLocaleString()}`;
                }
              );
            }
            converted.displayCurrency = targetCurrency;
            return converted;
          }),
        };
      }
      return { ...rule, rules: convertedRules };
    }
    
    if (rule.type === "cat16" && rule.text) {
      // Convert INR amounts in text
      const convertedText = rule.text.replace(
        /(?:Rs\.?|INR)\s*([\d,]+)/gi,
        (_match: string, numStr: string) => {
          const amt = Number(numStr.replace(/,/g, ""));
          if (isNaN(amt)) return _match;
          const convertedAmt = convertAmount(amt, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
          return `${targetCurrency} ${convertedAmt.toLocaleString()}`;
        }
      );
      return { ...rule, text: convertedText };
    }
    
    return rule;
  });
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
  return { isActive: data?.is_active ?? false, proxySecret, proxyBase };
}

async function tjFetch(path: string, body: any, proxySecret: string, proxyBase: string): Promise<Response> {
  const url = `${proxyBase}${path}`;
  console.log(`[TripjackFareRules] POST ${url}`);
  return fetch(url, {
    method: "POST",
    headers: {
      "x-vela-key": proxySecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

interface FareRulePolicy {
  type: string;
  policies: Array<{
    amount?: number;
    additionalFee?: number;
    policyInfo?: string;
    st?: number;
    et?: number;
    pp?: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { priceId, bookingId, flowType = "SEARCH", targetCurrency } = body;

    const id = bookingId || priceId;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing priceId or bookingId" }),
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

    const fareRuleRes = await tjFetch("/fms/v2/farerule", { id, flowType }, config.proxySecret, config.proxyBase);
    const fareRuleData = await fareRuleRes.json();

    console.log("[TripjackFareRules] Response status:", fareRuleData?.status?.httpStatus);

    if (!fareRuleData?.status?.success) {
      const errMsg = fareRuleData?.errors?.[0]?.message || "Fare rule fetch failed";
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse fare rules - can be mini rule (tfr) or Cat 16 (miscInfo)
    const fareRule = fareRuleData?.fareRule || {};
    let rules: any[] = [];

    for (const routeKey of Object.keys(fareRule)) {
      const routeRules = fareRule[routeKey];
      
      // Mini rule (structured)
      if (routeRules?.tfr) {
        const tfr = routeRules.tfr;
        const parsed: Record<string, FareRulePolicy> = {};

        for (const ruleType of ["CANCELLATION", "DATECHANGE", "NO_SHOW", "SEAT_CHARGEABLE"]) {
          if (tfr[ruleType]) {
            const policyList = Array.isArray(tfr[ruleType]) ? tfr[ruleType] : [tfr[ruleType]];
            parsed[ruleType] = {
              type: ruleType,
              policies: policyList.map((p: any) => ({
                amount: p.amount,
                additionalFee: p.additionalFee,
                policyInfo: p.policyInfo || p.policyinfo,
                st: p.st,
                et: p.et,
                pp: p.pp,
                ACF: p.ACF,
                ACFT: p.ACFT,
                CCF: p.CCF,
                CCFT: p.CCFT,
                ARF: p.ARF,
                ARFT: p.ARFT,
                CRF: p.CRF,
                CRFT: p.CRFT,
              })),
            };
          }
        }

        rules.push({ route: routeKey, type: "mini", rules: parsed });
      }

      // Cat 16 (unstructured text)
      if (routeRules?.miscInfo) {
        const miscText = Array.isArray(routeRules.miscInfo)
          ? routeRules.miscInfo.join("\n")
          : String(routeRules.miscInfo);
        rules.push({ route: routeKey, type: "cat16", text: miscText });
      }
    }

    // Convert penalty amounts to target currency if requested
    if (targetCurrency && rules.length > 0) {
      const sb = getSupabaseAdmin();
      const exchangeConfig = await loadExchangeConfig(sb);
      rules = convertTripjackRules(rules, targetCurrency, exchangeConfig);
    }

    return new Response(
      JSON.stringify({ success: true, rules, penaltyCurrency: targetCurrency || "INR", raw: fareRuleData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[TripjackFareRules] Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
