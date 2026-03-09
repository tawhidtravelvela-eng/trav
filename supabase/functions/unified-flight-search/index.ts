// Unified flight search edge function
// Orchestrates all providers, normalizes, applies markups/commissions, deduplicates,
// tracks popular routes, and caches prices — all on the backend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Rate limiter ──
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
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

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Helper functions ──

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeApiFareFields(f: any): { basePrice: number | undefined; taxes: number | undefined } {
  const basePrice =
    toFiniteNumber(f?.basePrice) ??
    toFiniteNumber(f?.base_price) ??
    toFiniteNumber(f?.baseFare);

  const taxes =
    toFiniteNumber(f?.taxes) ??
    toFiniteNumber(f?.tax) ??
    toFiniteNumber(f?.taxesAmount) ??
    toFiniteNumber(f?.taxes_amount);

  return { basePrice, taxes };
}

function flightDeduplicationKey(f: any): string {
  if (f.segments?.length) {
    return f.segments
      .map((s: any) => `${s.carrier || s.airline || f.airline}-${s.flightNumber || ""}-${s.departure}`)
      .join("|");
  }
  return `${f.airline}-${f.flightNumber || ""}-${f.departure}-${f.arrival}`;
}

function computeTotalFare(flight: any, adults: number, children: number, infants: number): number {
  const paxP = flight.paxPricing;
  const hasApi = flight.basePrice !== undefined && flight.taxes !== undefined;
  const aBase = Math.round(hasApi ? flight.basePrice : Number(flight.price));
  const aTax = Math.round(hasApi ? flight.taxes : 0);
  const adultPrice = aBase + aTax;
  const cBase = paxP?.CHD ? Math.round(paxP.CHD.base) : (hasApi ? Math.round(aBase * 0.75) : null);
  const cTax = paxP?.CHD ? Math.round(paxP.CHD.taxes) : (hasApi ? Math.round(aTax * 0.75) : null);
  const childPrice = cBase != null && cTax != null ? cBase + cTax : Math.round(adultPrice * 0.75);
  const iBase = paxP?.INF ? Math.round(paxP.INF.base) : (hasApi ? Math.round(aBase * 0.10) : null);
  const iTax = paxP?.INF ? Math.round(paxP.INF.taxes) : (hasApi ? Math.round(aTax * 0.10) : null);
  const infantPrice = iBase != null && iTax != null ? iBase + iTax : Math.round(adultPrice * 0.10);
  return adultPrice * adults + childPrice * children + infantPrice * infants;
}

// ── Provider config ──

interface PerApiMarkup {
  global: number;
  airlines: Record<string, number>;
}

interface AitConfig {
  enabled: boolean;
  perApi: Record<string, number>; // e.g. { travelport: 0.3, amadeus: 0.5 }
}

interface ProviderConfig {
  showLocalInventory: boolean;
  travelportEnabled: boolean;
  amadeusEnabled: boolean;
  travelvelaEnabled: boolean;
  tripjackFlightEnabled: boolean;
  travelportStudentFare: boolean;
  amadeusStudentFare: boolean;
  travelvelaStudentFare: boolean;
  tripjackStudentFare: boolean;
  perApiMarkups: Record<string, PerApiMarkup>;
  commissionRules: { airline_code: string; api_source: string; commission_pct: number; markup_pct: number; origin?: string; destination?: string; type?: string; profit_type?: string; module?: string }[];
  ait: AitConfig;
}

async function loadProviderConfig(sb: any): Promise<ProviderConfig> {
  const config: ProviderConfig = {
    showLocalInventory: true,
    travelportEnabled: false,
    amadeusEnabled: false,
    travelvelaEnabled: false,
    tripjackFlightEnabled: false,
    travelportStudentFare: false,
    amadeusStudentFare: false,
    travelvelaStudentFare: false,
    tripjackStudentFare: false,
    perApiMarkups: {
      travelport: { global: 0, airlines: {} },
      amadeus: { global: 0, airlines: {} },
      travelvela: { global: 0, airlines: {} },
      tripjack: { global: 0, airlines: {} },
    },
    commissionRules: [],
    ait: { enabled: false, perApi: { travelport: 0, amadeus: 0, travelvela: 0, tripjack: 0 } },
  };

  const { data: settings } = await sb.from("api_settings").select("provider, is_active, settings");
  if (settings) {
    for (const s of settings) {
      if (s.provider === "local_inventory") config.showLocalInventory = s.is_active;
      if (s.provider === "travelport") {
        config.travelportEnabled = s.is_active;
        config.travelportStudentFare = !!(s.settings as any)?.student_fare_enabled;
      }
      if (s.provider === "amadeus") {
        config.amadeusEnabled = s.is_active;
        config.amadeusStudentFare = !!(s.settings as any)?.student_fare_enabled;
      }
      if (s.provider === "travelvela") {
        config.travelvelaEnabled = s.is_active;
        config.travelvelaStudentFare = !!(s.settings as any)?.student_fare_enabled;
      }
      if (s.provider === "tripjack_flight") {
        config.tripjackFlightEnabled = s.is_active;
        config.tripjackStudentFare = !!(s.settings as any)?.student_fare_enabled;
      }
      if (s.provider === "api_markup") {
        const m = s.settings as any;
        if (m?.per_api) {
          // New per-API format
          config.perApiMarkups = m.per_api;
        } else {
          // Legacy: single global for all
          const legacy: PerApiMarkup = { global: m?.markup_percentage || 0, airlines: m?.airline_markups || {} };
          config.perApiMarkups = {
            travelport: { ...legacy },
            amadeus: { global: legacy.global, airlines: {} },
            travelvela: { global: legacy.global, airlines: {} },
            tripjack: { global: legacy.global, airlines: {} },
          };
        }
      }
      if (s.provider === "airline_commissions") {
        config.commissionRules = ((s.settings as any)?.rules || []);
      }
      if (s.provider === "ait_settings") {
        config.ait.enabled = s.is_active;
        const aitData = s.settings as any;
        if (aitData?.per_api) config.ait.perApi = aitData.per_api;
      }
    }
  }
  return config;
}

function getApiMarkup(config: ProviderConfig, airlineCode: string, apiSource: string): number {
  const apiConfig = config.perApiMarkups[apiSource];
  if (!apiConfig) return 0;
  if (apiConfig.airlines[airlineCode] !== undefined) return apiConfig.airlines[airlineCode];
  return apiConfig.global;
}

function applyCommissionMarkup(
  basePrice: number,
  airlineCode: string,
  apiSource: string,
  rules: ProviderConfig["commissionRules"],
  originCode?: string,
  destinationCode?: string
): number {
  // Find best matching rule: specific origin+dest > origin only > global (no origin/dest)
  const candidates = rules.filter(r => {
    if (r.airline_code !== airlineCode) return false;
    if (r.api_source !== apiSource && r.api_source !== "all") return false;
    if (r.module && r.module !== "flights") return false;
    // Origin filter
    if (r.origin && originCode && r.origin !== originCode) return false;
    if (r.origin && !originCode) return false;
    // Destination filter
    if (r.destination && destinationCode && r.destination !== destinationCode) return false;
    if (r.destination && !destinationCode) return false;
    return true;
  });

  // Score: specific api_source > "all", origin match > no origin, dest match > no dest
  const scored = candidates.map(r => {
    let score = 0;
    if (r.api_source === apiSource) score += 100;
    if (r.origin && r.origin === originCode) score += 10;
    if (r.destination && r.destination === destinationCode) score += 5;
    return { rule: r, score };
  }).sort((a, b) => b.score - a.score);

  const rule = scored[0]?.rule;
  if (!rule) return basePrice;

  const isFixed = rule.profit_type === "fixed";
  const ruleType = rule.type || "commission";

  if (ruleType === "commission") {
    const amount = isFixed ? rule.commission_pct : basePrice * (rule.commission_pct / 100);
    return Math.round((basePrice - amount) * 100) / 100;
  } else {
    // markup type
    const amount = isFixed ? rule.markup_pct : basePrice * (rule.markup_pct / 100);
    return Math.round((basePrice + amount) * 100) / 100;
  }
}

// ── Internal edge function caller ──

async function callEdgeFunction(functionName: string, body: any): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  const controller = new AbortController();
  const timeoutMs = 18_000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": anonKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[unified] ${functionName} HTTP ${response.status}: ${text}`);
      return null;
    }

    return await response.json();
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    if (timedOut) {
      console.error(`[unified] ${functionName} timeout after ${timeoutMs}ms`);
    } else {
      console.error(`[unified] ${functionName} error:`, e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Process provider results ──

function hasAirlineSpecificRule(
  airlineCode: string,
  apiSource: string,
  rules: ProviderConfig["commissionRules"],
  perApiMarkups: ProviderConfig["perApiMarkups"],
  originCode?: string,
  destinationCode?: string
): boolean {
  // Check if there's a commission rule for this airline
  const hasCommRule = rules.some(r => {
    if (r.airline_code !== airlineCode) return false;
    if (r.api_source !== apiSource && r.api_source !== "all") return false;
    if (r.module && r.module !== "flights") return false;
    if (r.origin && originCode && r.origin !== originCode) return false;
    if (r.origin && !originCode) return false;
    if (r.destination && destinationCode && r.destination !== destinationCode) return false;
    if (r.destination && !destinationCode) return false;
    return true;
  });
  if (hasCommRule) return true;
  // Check if there's an airline-specific API markup override
  const apiConfig = perApiMarkups[apiSource];
  if (apiConfig && apiConfig.airlines[airlineCode] !== undefined) return true;
  return false;
}

function processProviderFlights(
  flights: any[],
  source: string,
  config: ProviderConfig,
  searchOrigin?: string,
  searchDestination?: string
): any[] {
  return flights.map((f: any) => {
    const { basePrice: rawBase, taxes } = normalizeApiFareFields(f);
    const flightOrigin = f.from_code || f.from || searchOrigin || "";
    const flightDest = f.to_code || f.to || searchDestination || "";

    // If this airline has a specific commission/markup rule, skip global markup
    const hasSpecificRule = hasAirlineSpecificRule(
      f.airline, source, config.commissionRules, config.perApiMarkups, flightOrigin, flightDest
    );

    const adjustedBase = rawBase != null
      ? applyCommissionMarkup(rawBase, f.airline, source, config.commissionRules, flightOrigin, flightDest)
      : undefined;
    const adjustedTotal = adjustedBase != null && taxes != null ? adjustedBase + taxes : f.price;
    const rawApiPrice = f.price;

    // Only apply global API markup if NO airline-specific rule exists
    const m = hasSpecificRule ? 0 : getApiMarkup(config, f.airline, source);
    const appliedMarkupPct = m;
    const markupMultiplier = m > 0 ? (1 + m / 100) : 1;

    const finalBase = adjustedBase != null ? Math.round(adjustedBase * markupMultiplier) : undefined;
    const finalTaxes = taxes != null ? Math.round(taxes * markupMultiplier) : undefined;
    const finalPrice = (finalBase != null && finalTaxes != null) 
      ? finalBase + finalTaxes 
      : Math.round(adjustedTotal * markupMultiplier);

    // Inject classOfBooking into segments for tripjack
    const segments = source === "tripjack" && f.segments
      ? f.segments.map((seg: any) => ({
          ...seg,
          bookingCode: seg.bookingCode || f.classOfBooking || undefined,
        }))
      : f.segments;

    // ── AIT calculation ──
    // AIT % is applied to total fare (base + taxes) and ALWAYS added on top.
    let aitAmount = 0;
    const aitPct = config.ait.enabled ? (config.ait.perApi[source] || 0) : 0;
    let displayPrice = finalPrice;
    let displayBase = finalBase;
    if (aitPct > 0) {
      aitAmount = Math.round(finalPrice * (aitPct / 100));
      displayPrice = finalPrice + aitAmount;
      if (displayBase != null) {
        displayBase = finalBase! + aitAmount;
      }
    }

    return {
      ...f,
      segments,
      basePrice: displayBase,
      taxes: finalTaxes,
      price: displayPrice,
      rawApiPrice,
      appliedMarkupPct,
      aitAmount,
      aitPct,
      source,
    };
  });
}

// ── Currency conversion ──

const DEFAULT_SOURCE_CURRENCIES: Record<string, string> = {
  tripjack: "INR",
  travelport: "BDT",
  travelvela: "BDT",
  amadeus: "USD",
  database: "USD",
};

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
    sourceCurrencies: { ...DEFAULT_SOURCE_CURRENCIES },
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
  const markupMultiplier = 1 + markup / 100;
  return Math.round((amount / fromRate) * toRate * markupMultiplier);
}

function convertFlightPrices(flight: any, targetCurrency: string, exchangeConfig: ExchangeConfig): any {
  const source = flight.source || "database";
  const fromCurrency = exchangeConfig.sourceCurrencies[source] || "USD";

  // Always preserve the original API price & currency for admin reference
  const converted = {
    ...flight,
    originalCurrency: fromCurrency,
    originalPrice: flight.price != null ? Math.round(Number(flight.price)) : undefined,
    originalBasePrice: flight.basePrice != null ? Math.round(Number(flight.basePrice)) : undefined,
    originalTaxes: flight.taxes != null ? Math.round(Number(flight.taxes)) : undefined,
  };

  if (fromCurrency === targetCurrency) {
    return { ...converted, currency: targetCurrency };
  }
  
  const convert = (amount: number) => convertAmount(amount, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);
  converted.currency = targetCurrency;
  
  // Convert base and taxes first, then derive price from their sum to ensure consistency
  if (converted.basePrice != null) converted.basePrice = convert(converted.basePrice);
  if (converted.taxes != null) converted.taxes = convert(converted.taxes);
  // Price must equal basePrice + taxes to prevent rounding discrepancies
  if (converted.basePrice != null && converted.taxes != null) {
    converted.price = converted.basePrice + converted.taxes;
  } else if (converted.price != null) {
    converted.price = convert(converted.price);
  }
  if (converted.rawApiPrice != null) converted.rawApiPrice = convert(converted.rawApiPrice);
  
  // Convert paxPricing (preserve originals)
  if (converted.paxPricing) {
    const newPax: any = {};
    for (const [type, pricing] of Object.entries(converted.paxPricing as Record<string, any>)) {
      const convertedBase = convert(pricing.base);
      const convertedTaxes = convert(pricing.taxes);
      newPax[type] = {
        base: convertedBase,
        taxes: convertedTaxes,
        total: convertedBase + convertedTaxes, // Derive from components to ensure consistency
      };
    }
    converted.originalPaxPricing = { ...converted.paxPricing };
    converted.paxPricing = newPax;
  }
  
  return converted;
}

// ── Main search logic ──

interface SearchRequest {
  mode?: "search" | "date-prices";
  from: string;
  to: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  children?: number;
  infants?: number;
  cabinClass?: string;
  directFlight?: boolean;
  studentFare?: boolean;
  legs?: { from: string; to: string; date: string }[];
  // For date-prices mode
  dates?: string[];
  // Tenant support
  tenant_id?: string;
  // Target display currency
  currency?: string;
}

// ── Tenant API settings loader ──

interface TenantProviderOverride {
  travelportCredentials?: any;
  amadeusCredentials?: any;
  travelportEnabled: boolean;
  amadeusEnabled: boolean;
}

async function loadTenantOverrides(sb: any, tenantId: string): Promise<TenantProviderOverride | null> {
  const { data: rows } = await sb
    .from("tenant_api_settings")
    .select("provider, is_active, settings")
    .eq("tenant_id", tenantId);

  if (!rows || rows.length === 0) return null;

  const overrides: TenantProviderOverride = {
    travelportEnabled: false,
    amadeusEnabled: false,
  };

  let hasAny = false;
  for (const row of rows) {
    if (row.provider === "travelport" && row.is_active) {
      overrides.travelportEnabled = true;
      overrides.travelportCredentials = row.settings;
      hasAny = true;
    }
    if (row.provider === "amadeus" && row.is_active) {
      overrides.amadeusEnabled = true;
      overrides.amadeusCredentials = row.settings;
      hasAny = true;
    }
  }

  return hasAny ? overrides : null;
}

// ── Provider group loader for white-label tenants ──

interface ProviderGroupConfig {
  travelport: boolean;
  amadeus: boolean;
  travelvela: boolean;
  tripjack: boolean;
}

async function loadTenantProviderGroup(sb: any, tenantId: string): Promise<ProviderGroupConfig | null> {
  // Fetch tenant's provider_group_id, then load the group's providers
  const { data: tenant } = await sb
    .from("tenants")
    .select("provider_group_id")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant?.provider_group_id) return null;

  const { data: group } = await sb
    .from("provider_groups")
    .select("providers")
    .eq("id", tenant.provider_group_id)
    .maybeSingle();

  if (!group?.providers) return null;

  const p = group.providers as Record<string, boolean>;
  return {
    travelport: !!p.travelport,
    amadeus: !!p.amadeus,
    travelvela: !!p.travelvela,
    tripjack: !!p.tripjack,
  };
}

async function performSearch(
  body: SearchRequest,
  config: ProviderConfig,
  sb: any,
  tenantOverrides?: TenantProviderOverride | null,
  providerGroup?: ProviderGroupConfig | null
): Promise<any[]> {
  const hasBYOK = !!tenantOverrides;
  const hasGroup = !!providerGroup;
  const results: any[] = [];
  const isMultiCity = body.legs && body.legs.length >= 2;

  // Priority: BYOK tenant keys > Provider group (white-label) > Global config
  // BYOK: tenant has own API keys — use only those
  // Provider group: tenant uses our global APIs but limited to group's enabled set
  // Global: no tenant context — use all enabled global providers
  let useLocalInventory: boolean;
  let useTravelport: boolean;
  let useAmadeus: boolean;
  let useTravelvela: boolean;
  let useTripjack: boolean;

  if (hasBYOK) {
    // BYOK tenant — use only their own keys
    useLocalInventory = false;
    useTravelport = tenantOverrides?.travelportEnabled ?? false;
    useAmadeus = tenantOverrides?.amadeusEnabled ?? false;
    useTravelvela = false;
    useTripjack = false;
  } else if (hasGroup) {
    // White-label tenant with provider group — use global APIs filtered by group
    useLocalInventory = false;
    useTravelport = providerGroup!.travelport && config.travelportEnabled;
    useAmadeus = providerGroup!.amadeus && config.amadeusEnabled;
    useTravelvela = providerGroup!.travelvela && config.travelvelaEnabled;
    useTripjack = providerGroup!.tripjack && config.tripjackFlightEnabled;
  } else {
    // No tenant context — global
    useLocalInventory = config.showLocalInventory;
    useTravelport = config.travelportEnabled;
    useAmadeus = config.amadeusEnabled;
    useTravelvela = config.travelvelaEnabled;
    useTripjack = config.tripjackFlightEnabled;
  }

  // Student fare filtering — only use providers with student_fare_enabled
  const isStudentFare = body.studentFare === true;
  if (isStudentFare) {
    useLocalInventory = false; // No local inventory for student fares
    if (!config.travelportStudentFare) useTravelport = false;
    if (!config.amadeusStudentFare) useAmadeus = false;
    if (!config.travelvelaStudentFare) useTravelvela = false;
    if (!config.tripjackStudentFare) useTripjack = false;
    console.log(`[unified] student fare filter: tp=${useTravelport}, am=${useAmadeus}, tv=${useTravelvela}, tj=${useTripjack}`);
  }

  if (useLocalInventory) {
    try {
      const { data: dbFlights } = await sb.from("flights").select("*").eq("is_active", true);
      if (dbFlights) {
        results.push(
          ...dbFlights.map((f: any) => {
            const markup = f.markup_percentage || 0;
            const finalPrice = Math.round(f.price * (1 + markup / 100) * 100) / 100;
            return { ...f, price: finalPrice, source: "database" };
          })
        );
      }
    } catch (e) {
      console.error("[unified] local inventory error:", e);
    }
  }

  // Build common search body for providers
  const searchBody: any = {
    from: body.from,
    to: body.to,
    departDate: body.departDate,
    returnDate: body.returnDate || null,
    adults: body.adults,
    children: body.studentFare ? 0 : (body.children || 0),
    infants: body.studentFare ? 0 : (body.infants || 0),
    cabinClass: body.cabinClass || "Economy",
    directFlight: body.directFlight || false,
    studentFare: body.studentFare || false,
  };

  if (isMultiCity) {
    searchBody.legs = body.legs;
  }

  // Call providers in parallel
  const apiCalls: Promise<void>[] = [];

  if (useTravelport) {
    apiCalls.push((async () => {
      const tpBody = tenantOverrides?.travelportCredentials
        ? { ...searchBody, tenantCredentials: tenantOverrides.travelportCredentials }
        : searchBody;
      const data = await callEdgeFunction("travelport-search", tpBody);
      if (data?.success && data?.flights?.length > 0) {
        results.push(...processProviderFlights(data.flights, "travelport", config, body.from, body.to));
      }
    })());
  }

  if (useAmadeus) {
    apiCalls.push((async () => {
      const amBody = tenantOverrides?.amadeusCredentials
        ? { ...searchBody, tenantCredentials: tenantOverrides.amadeusCredentials }
        : searchBody;
      const data = await callEdgeFunction("amadeus-search", amBody);
      if (data?.success && data?.flights?.length > 0) {
        results.push(...processProviderFlights(data.flights, "amadeus", config, body.from, body.to));
      }
    })());
  }

  if (useTravelvela) {
    apiCalls.push((async () => {
      const tvBody = {
        from: body.from,
        to: body.to,
        departDate: body.departDate,
        returnDate: isMultiCity ? null : body.returnDate,
        adults: body.adults,
        children: body.children || 0,
        infants: body.infants || 0,
        cabinClass: body.cabinClass || "Economy",
      };
      const data = await callEdgeFunction("travelvela-search", tvBody);
      if (data?.success && data?.flights?.length > 0) {
        results.push(...processProviderFlights(data.flights, "travelvela", config, body.from, body.to));
      }
    })());
  }

  if (useTripjack) {
    apiCalls.push((async () => {
      const tjBody = {
        from: body.from,
        to: body.to,
        departDate: body.departDate,
        returnDate: isMultiCity ? null : body.returnDate,
        adults: body.adults,
        children: body.children || 0,
        infants: body.infants || 0,
        cabinClass: body.cabinClass || "Economy",
        directFlight: body.directFlight || false,
        studentFare: body.studentFare || false,
        ...(isMultiCity ? { legs: body.legs } : {}),
      };
      const data = await callEdgeFunction("tripjack-search", tjBody);
      if (data?.success && data?.flights?.length > 0) {
        results.push(...processProviderFlights(data.flights, "tripjack", config, body.from, body.to));
      }
    })());
  }

  await Promise.all(apiCalls);

  // Deduplicate: same itinerary → keep lowest fare
  const dedupMap = new Map<string, any>();
  for (const f of results) {
    const key = flightDeduplicationKey(f);
    const existing = dedupMap.get(key);
    if (!existing || f.price < existing.price) {
      dedupMap.set(key, f);
    }
  }

  return Array.from(dedupMap.values());
}

// ── Track popular route + cache price ──

async function trackAndCache(
  flights: any[],
  body: SearchRequest,
  sb: any
): Promise<void> {
  if (flights.length === 0 || !body.from || !body.to) return;

  const lowest = flights.reduce((min, f) => f.price < min.price ? f : min, flights[0]);
  const adults = body.adults || 1;
  const children = body.children || 0;
  const infants = body.infants || 0;

  // Upsert popular route (fire-and-forget)
  try {
    await sb.rpc("upsert_popular_route", {
      p_from_code: body.from,
      p_to_code: body.to,
      p_from_city: lowest.from_city || body.from,
      p_to_city: lowest.to_city || body.to,
      p_price: lowest.price,
      p_currency: lowest.currency || "BDT",
      p_airline: lowest.airline || "",
      p_duration: lowest.duration || "",
      p_stops: lowest.stops ?? 0,
    });
  } catch { }

  // Compute total fare for caching
  const totalPrice = computeTotalFare(lowest, adults, children, infants);

  // Upsert price cache
  try {
    await sb.rpc("upsert_flight_price_cache", {
      p_from_code: body.from,
      p_to_code: body.to,
      p_travel_date: body.departDate || "",
      p_cabin_class: body.cabinClass || "Economy",
      p_adults: adults,
      p_children: children,
      p_infants: infants,
      p_lowest_price: totalPrice,
      p_currency: lowest.currency || "INR",
      p_source: lowest.source || "unknown",
    });
  } catch { }
}

// ── Date prices mode ──

async function fetchDatePrices(
  body: SearchRequest,
  config: ProviderConfig,
  sb: any
): Promise<Record<string, { price: number; source: string } | null>> {
  const dates = body.dates || [];
  if (dates.length === 0) return {};

  const adults = body.adults || 1;
  const children = body.children || 0;
  const infants = body.infants || 0;

  // First check server cache
  const result: Record<string, { price: number; source: string } | null> = {};
  const toFetch: string[] = [];

  try {
    const { data: cachedRows } = await sb
      .from("flight_price_cache")
      .select("travel_date, lowest_price, currency, source, expires_at")
      .eq("from_code", body.from)
      .eq("to_code", body.to)
      .eq("cabin_class", body.cabinClass || "Economy")
      .eq("adults", adults)
      .eq("children", children)
      .eq("infants", infants)
      .in("travel_date", dates);

    const now = new Date();
    const cachedDates = new Set<string>();
    if (cachedRows) {
      for (const row of cachedRows) {
        if (new Date(row.expires_at) > now) {
          result[row.travel_date] = { price: Number(row.lowest_price), source: row.source };
          cachedDates.add(row.travel_date);
        }
      }
    }

    for (const d of dates) {
      if (!cachedDates.has(d)) toFetch.push(d);
    }
  } catch {
    toFetch.push(...dates);
  }

  if (toFetch.length === 0) return result;

  // Fetch uncached dates by calling providers
  await Promise.all(
    toFetch.map(async (dateStr) => {
      const searchBody: SearchRequest = {
        ...body,
        departDate: dateStr,
        mode: "search",
      };
      const flights = await performSearch(searchBody, config, sb);

      if (flights.length > 0) {
        const lowest = flights.reduce((min: any, f: any) => f.price < min.price ? f : min, flights[0]);
        const totalPrice = computeTotalFare(lowest, adults, children, infants);
        result[dateStr] = { price: totalPrice, source: lowest.source };

        // Cache it
        try {
          await sb.rpc("upsert_flight_price_cache", {
            p_from_code: body.from,
            p_to_code: body.to,
            p_travel_date: dateStr,
            p_cabin_class: body.cabinClass || "Economy",
            p_adults: adults,
            p_children: children,
            p_infants: infants,
            p_lowest_price: totalPrice,
            p_currency: lowest.currency || "INR",
            p_source: lowest.source || "unknown",
          });
        } catch { }
      } else {
        result[dateStr] = null;
      }
    })
  );

  return result;
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ success: false, error: "Rate limit exceeded" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body: SearchRequest = await req.json();
    const mode = body.mode || "search";
    const sb = getSupabaseAdmin();

    console.log(`[unified] mode=${mode}, from=${body.from}, to=${body.to}, date=${body.departDate}, tenant=${body.tenant_id || "global"}`);

    // Load provider configuration
    const config = await loadProviderConfig(sb);

    // Load tenant-specific API overrides and provider group if tenant_id provided
    let tenantOverrides: TenantProviderOverride | null = null;
    let providerGroup: ProviderGroupConfig | null = null;
    if (body.tenant_id) {
      // Load BYOK overrides and provider group in parallel
      const [byok, group] = await Promise.all([
        loadTenantOverrides(sb, body.tenant_id),
        loadTenantProviderGroup(sb, body.tenant_id),
      ]);
      tenantOverrides = byok;
      providerGroup = group;
      console.log(`[unified] tenant BYOK: tp=${tenantOverrides?.travelportEnabled}, am=${tenantOverrides?.amadeusEnabled}`);
      console.log(`[unified] tenant group: ${providerGroup ? `tp=${providerGroup.travelport}, am=${providerGroup.amadeus}, tv=${providerGroup.travelvela}, tj=${providerGroup.tripjack}` : "none"}`);
    }

    console.log(`[unified] providers: tp=${config.travelportEnabled}, am=${config.amadeusEnabled}, tv=${config.travelvelaEnabled}, tj=${config.tripjackFlightEnabled}, local=${config.showLocalInventory}`);

    // Load exchange config for currency conversion
    const targetCurrency = body.currency || "BDT";
    const exchangeConfig = await loadExchangeConfig(sb);
    console.log(`[unified] target currency: ${targetCurrency}`);

    if (mode === "date-prices") {
      const datePrices = await fetchDatePrices(body, config, sb);
      // Convert date prices to target currency
      const convertedDatePrices: Record<string, { price: number; source: string } | null> = {};
      for (const [dateStr, entry] of Object.entries(datePrices)) {
        if (entry && typeof entry === "object" && "price" in entry) {
          const source = entry.source || "unknown";
          const fromCurrency = exchangeConfig.sourceCurrencies[source] || "USD";
          convertedDatePrices[dateStr] = {
            price: convertAmount(entry.price, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup),
            source: entry.source,
          };
        } else {
          convertedDatePrices[dateStr] = null;
        }
      }
      return new Response(
        JSON.stringify({ success: true, datePrices: convertedDatePrices, displayCurrency: targetCurrency }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Full search mode
    const flights = await performSearch(body, config, sb, tenantOverrides, providerGroup);

    // Sort by price
    flights.sort((a, b) => a.price - b.price);

    console.log(`[unified] total results after dedup: ${flights.length}`);

    // Track popular route + cache (fire-and-forget) — skip for tenant searches
    if (!tenantOverrides && !providerGroup) {
      trackAndCache(flights, body, sb).catch(() => { });
    }

    // Convert all prices to target currency
    const convertedFlights = flights.map(f => convertFlightPrices(f, targetCurrency, exchangeConfig));

    // Build providers response reflecting actual resolution
    const isTenantSearch = !!tenantOverrides || !!providerGroup;
    const resolvedProviders = tenantOverrides
      ? { local: false, travelport: tenantOverrides.travelportEnabled, amadeus: tenantOverrides.amadeusEnabled, travelvela: false, tripjack: false }
      : providerGroup
        ? { local: false, travelport: providerGroup.travelport && config.travelportEnabled, amadeus: providerGroup.amadeus && config.amadeusEnabled, travelvela: providerGroup.travelvela && config.travelvelaEnabled, tripjack: providerGroup.tripjack && config.tripjackFlightEnabled }
        : { local: config.showLocalInventory, travelport: config.travelportEnabled, amadeus: config.amadeusEnabled, travelvela: config.travelvelaEnabled, tripjack: config.tripjackFlightEnabled };

    return new Response(
      JSON.stringify({
        success: true,
        flights: convertedFlights,
        count: convertedFlights.length,
        providers: resolvedProviders,
        displayCurrency: targetCurrency,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[unified] error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
