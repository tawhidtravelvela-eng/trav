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

/** Convert currency amounts embedded in fare rule text */
function convertFareRuleText(rules: any[], targetCurrency: string, exchangeConfig: ExchangeConfig): any[] {
  return rules.map((rule: any) => {
    if (!rule.text) return rule;
    const convertedText = rule.text.replace(
      /\b([A-Z]{3})\s*([\d,]+(?:\.\d+)?)\b/g,
      (match: string, cur: string, amt: string) => {
        if (!exchangeConfig.rates[cur]) return match;
        const amount = parseFloat(amt.replace(/,/g, ""));
        if (isNaN(amount) || amount === 0) return match;
        const converted = convertAmount(amount, cur, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
        return `${targetCurrency} ${converted.toLocaleString()}`;
      }
    );
    return { ...rule, text: convertedText };
  });
}

interface TravelportSettings {
  target_branch: string;
  username: string;
  password: string;
  endpoint: string;
}

interface FareRuleLookupParams {
  origin: string;
  destination: string;
  carrier: string;
  fareBasis: string;
}

function buildFareRulesRequest(
  settings: TravelportSettings,
  lookups: FareRuleLookupParams[]
): string {
  const lookupXml = lookups.map((l) =>
    `<air:FareRuleLookup Origin="${l.origin}" Destination="${l.destination}" Carrier="${l.carrier}" FareBasis="${l.fareBasis}" ProviderCode="1G"/>`
  ).join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:air="http://www.travelport.com/schema/air_v54_0"
  xmlns:com="http://www.travelport.com/schema/common_v54_0">
  <soap:Body>
    <air:AirFareRulesReq TargetBranch="${settings.target_branch}">
      <com:BillingPointOfSaleInfo OriginApplication="UAPI"/>
      ${lookupXml}
    </air:AirFareRulesReq>
  </soap:Body>
</soap:Envelope>`;
}

const categoryNames: Record<number, string> = {
  1: "Eligibility", 2: "Day/Time", 3: "Seasonality", 4: "Flight Application",
  5: "Advance Reservation/Ticketing", 6: "Minimum Stay", 7: "Maximum Stay",
  8: "Stopovers", 9: "Transfers", 10: "Combinations", 11: "Blackout Dates",
  12: "Surcharges", 13: "Accompanied Travel", 14: "Travel Restrictions",
  15: "Sales Restrictions", 16: "Penalties", 18: "Ticket Endorsements",
  19: "Children Discounts", 20: "Tour Conductor Discounts", 21: "Agent Discounts",
  22: "All Other Discounts", 23: "Miscellaneous Provisions", 25: "Fare By Rule",
  26: "Groups", 27: "Tours", 28: "Visit Another Country", 29: "Deposits",
  31: "Voluntary Changes", 33: "Voluntary Refunds", 35: "Negotiated Fares",
  50: "Application and Other",
};

function parseFareRulesResponse(xmlText: string): any {
  const rules: any[] = [];

  const ruleRegex = /<air:FareRuleLong[^>]*>([\s\S]*?)<\/air:FareRuleLong>/g;
  let match;
  while ((match = ruleRegex.exec(xmlText)) !== null) {
    const ruleBlock = match[0];
    const catMatch = ruleBlock.match(/Category="(\d+)"/);
    const category = catMatch ? parseInt(catMatch[1]) : 0;
    const text = match[1].trim();
    if (text) {
      rules.push({
        category,
        categoryName: categoryNames[category] || `Category ${category}`,
        text,
      });
    }
  }

  if (rules.length === 0) {
    const ruleRegex2 = /<air:FareRule[^>]*>[\s\S]*?<\/air:FareRule>/g;
    while ((match = ruleRegex2.exec(xmlText)) !== null) {
      const ruleBlock = match[0];
      const catMatch = ruleBlock.match(/Category="(\d+)"/);
      const category = catMatch ? parseInt(catMatch[1]) : 0;
      const textMatch = ruleBlock.match(/<air:FareRuleText>([\s\S]*?)<\/air:FareRuleText>/);
      const text = textMatch ? textMatch[1].trim() : "";
      if (text) {
        rules.push({
          category,
          categoryName: categoryNames[category] || `Category ${category}`,
          text,
        });
      }
    }
  }

  const penalties: any = {};
  const changePenaltyMatch = xmlText.match(/<air:ChangePenalty[^>]*>([\s\S]*?)<\/air:ChangePenalty>/);
  if (changePenaltyMatch) {
    const amountMatch = changePenaltyMatch[1].match(/<air:Amount>([A-Z]{3})([\d.]+)<\/air:Amount>/);
    const percentMatch = changePenaltyMatch[1].match(/<air:Percentage>([\d.]+)<\/air:Percentage>/);
    penalties.change = amountMatch
      ? { type: "amount", currency: amountMatch[1], value: parseFloat(amountMatch[2]) }
      : percentMatch
        ? { type: "percentage", value: parseFloat(percentMatch[1]) }
        : null;
  }

  const cancelPenaltyMatch = xmlText.match(/<air:CancelPenalty[^>]*>([\s\S]*?)<\/air:CancelPenalty>/);
  if (cancelPenaltyMatch) {
    const amountMatch = cancelPenaltyMatch[1].match(/<air:Amount>([A-Z]{3})([\d.]+)<\/air:Amount>/);
    const percentMatch = cancelPenaltyMatch[1].match(/<air:Percentage>([\d.]+)<\/air:Percentage>/);
    penalties.cancel = amountMatch
      ? { type: "amount", currency: amountMatch[1], value: parseFloat(amountMatch[2]) }
      : percentMatch
        ? { type: "percentage", value: parseFloat(percentMatch[1]) }
        : null;
  }

  const isRefundable = xmlText.includes('Refundable="true"');

  return { rules, penalties, isRefundable };
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
    const { fareRuleLookups, targetCurrency } = body;

    if (!fareRuleLookups?.length) {
      return new Response(
        JSON.stringify({ success: true, rules: [], penalties: {}, isRefundable: false, warning: "No fare rule data available. Please expand flight details first." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fareRulesXml = buildFareRulesRequest(settings, fareRuleLookups);
    const credentials = btoa(`${settings.username}:${settings.password}`);

    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        Authorization: `Basic ${credentials}`,
        SOAPAction: "",
      },
      body: fareRulesXml,
    });

    const responseText = await response.text();

    const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      console.warn("Fare rules SOAP fault:", faultMatch[1]);
      return new Response(
        JSON.stringify({ success: true, rules: [], penalties: {}, isRefundable: false, warning: faultMatch[1] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!response.ok) {
      console.error("Fare rules API error:", response.status, responseText.substring(0, 500));
      return new Response(
        JSON.stringify({ success: true, rules: [], penalties: {}, isRefundable: false, warning: `API error: ${response.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result = parseFareRulesResponse(responseText);

    // Convert currency amounts in fare rule text if targetCurrency is provided
    if (targetCurrency && result.rules.length > 0) {
      const exchangeConfig = await loadExchangeConfig(adminClient);
      result.rules = convertFareRuleText(result.rules, targetCurrency, exchangeConfig);
      result.penaltyCurrency = targetCurrency;
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Travelport fare rules error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
