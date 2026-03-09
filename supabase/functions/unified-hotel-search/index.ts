// Unified hotel search edge function
// Orchestrates all hotel providers (TravelVela, Tripjack, Agoda),
// normalizes results, applies markups, deduplicates, and returns unified response.

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

// ── Helper ──

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Provider config ──

interface HotelProviderConfig {
  travelvelaEnabled: boolean;
  tripjackEnabled: boolean;
  agodaEnabled: boolean;
  markupPercentage: number;
  perApiMarkups: Record<string, number>; // e.g. { travelvela: 5, tripjack: 3, agoda: 4 }
}

async function loadProviderConfig(sb: any): Promise<HotelProviderConfig> {
  const config: HotelProviderConfig = {
    travelvelaEnabled: false,
    tripjackEnabled: false,
    agodaEnabled: false,
    markupPercentage: 0,
    perApiMarkups: {},
  };

  const { data: settings } = await sb
    .from("api_settings")
    .select("provider, is_active, settings")
    .in("provider", ["travelvela_hotel", "tripjack_hotel", "agoda_hotel", "api_markup"]);

  if (settings) {
    for (const s of settings) {
      if (s.provider === "travelvela_hotel") config.travelvelaEnabled = !!s.is_active;
      if (s.provider === "tripjack_hotel") config.tripjackEnabled = !!s.is_active;
      if (s.provider === "agoda_hotel") config.agodaEnabled = !!s.is_active;
      if (s.provider === "api_markup") {
        const m = s.settings as any;
        config.markupPercentage = m?.markup_percentage || 0;
        if (m?.per_api_hotel) {
          config.perApiMarkups = m.per_api_hotel;
        }
      }
    }
  }
  return config;
}

function getMarkup(config: HotelProviderConfig, source: string): number {
  if (config.perApiMarkups[source] !== undefined) return config.perApiMarkups[source];
  return config.markupPercentage;
}

// ── Currency conversion ──

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
    sourceCurrencies: { travelvela: "BDT", tripjack: "INR", agoda: "USD" },
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
      if (s.api_source_currencies) {
        config.sourceCurrencies = { ...config.sourceCurrencies, ...s.api_source_currencies };
      }
    }
  } catch { }
  return config;
}

function convertAmount(amount: number, fromCurrency: string, toCurrency: string, rates: Record<string, number>, markup: number): number {
  if (fromCurrency === toCurrency) return Math.round(amount);
  const fromRate = rates[fromCurrency] || 1;
  const toRate = rates[toCurrency] || 1;
  const markupMultiplier = 1 + markup / 100;
  return Math.round((amount / fromRate) * toRate * markupMultiplier);
}

// ── Internal edge function caller ──

async function callEdgeFunction(functionName: string, body: any): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  const controller = new AbortController();
  const timeoutMs = 25_000; // Hotels can be slower
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
      console.error(`[unified-hotel] ${functionName} HTTP ${response.status}: ${text.slice(0, 300)}`);
      return null;
    }

    return await response.json();
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "AbortError";
    if (timedOut) {
      console.error(`[unified-hotel] ${functionName} timeout after ${timeoutMs}ms`);
    } else {
      console.error(`[unified-hotel] ${functionName} error:`, e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Normalize hotel results ──

interface NormalizedHotel {
  id: string;
  name: string;
  city: string;
  country: string;
  rating: number;
  reviews: number;
  stars: number;
  price: number;
  originalPrice: number;
  originalCurrency: string;
  crossedOutRate: number;
  discountPercentage: number;
  image: string | null;
  images: string[];
  amenities: string[];
  propertyType: string;
  landingUrl: string;
  roomTypeName: string;
  currency: string;
  availableRooms: any[];
  source: string;
  searchId?: string;
  description: string;
  mealBasis: string;
}

function normalizeTravelvelaHotels(data: any, markup: number): NormalizedHotel[] {
  if (!data?.success || !data?.hotels?.length) return [];
  return data.hotels.map((h: any) => {
    const price = Math.round((h.price || 0) * (1 + markup / 100));
    return {
      id: h.id || `tv-${Math.random().toString(36).slice(2)}`,
      name: h.name || "Unknown Hotel",
      city: h.city || "",
      country: h.country || "",
      rating: h.rating || 0,
      reviews: h.reviews || 0,
      stars: h.stars || 0,
      price,
      originalPrice: h.price || 0,
      originalCurrency: "BDT",
      crossedOutRate: 0,
      discountPercentage: 0,
      image: h.image || null,
      images: h.images || [],
      amenities: Array.isArray(h.amenities) ? h.amenities : [],
      propertyType: h.type || h.propertyType || "Hotel",
      landingUrl: "",
      roomTypeName: "",
      currency: "BDT",
      availableRooms: (h.availableRooms || []).map((r: any) => ({
        ...r,
        price: r.price ? Math.round(r.price * (1 + markup / 100)) : r.price,
        total_price: r.total_price ? Math.round(r.total_price * (1 + markup / 100)) : r.total_price,
        rate: r.rate ? Math.round(r.rate * (1 + markup / 100)) : r.rate,
        discount_price: r.discount_price ? Math.round(r.discount_price * (1 + markup / 100)) : r.discount_price,
        source: "travelvela",
      })),
      source: "travelvela",
      searchId: h.searchId || undefined,
      description: h.description || "",
      mealBasis: h.mealBasis || "",
    };
  });
}

function normalizeTripjackHotels(data: any, markup: number): NormalizedHotel[] {
  if (!data?.success || !data?.hotels?.length) return [];
  return data.hotels.map((h: any) => {
    const price = Math.round((h.price || 0) * (1 + markup / 100));
    return {
      id: h.id || `tj-${Math.random().toString(36).slice(2)}`,
      name: h.name || "Unknown Hotel",
      city: h.city || "",
      country: h.country || "",
      rating: h.rating || 0,
      reviews: 0,
      stars: h.stars || 0,
      price,
      originalPrice: h.price || 0,
      originalCurrency: "INR",
      crossedOutRate: 0,
      discountPercentage: 0,
      image: h.image || null,
      images: h.images || [],
      amenities: Array.isArray(h.amenities) ? h.amenities : [],
      propertyType: h.type || h.propertyType || "Hotel",
      landingUrl: "",
      roomTypeName: "",
      currency: "INR",
      availableRooms: [],
      source: "tripjack",
      description: h.description || "",
      mealBasis: h.mealBasis || "",
    };
  });
}

function normalizeAgodaHotels(data: any, markup: number): NormalizedHotel[] {
  if (!data?.success || !data?.hotels?.length) return [];
  return data.hotels.map((h: any) => {
    const price = Math.round((h.price || 0) * (1 + markup / 100));
    return {
      id: h.id || `agoda-${Math.random().toString(36).slice(2)}`,
      name: h.name || "Unknown Hotel",
      city: h.city || "",
      country: h.country || "",
      rating: h.rating || 0,
      reviews: h.reviews || 0,
      stars: h.stars || 0,
      price,
      originalPrice: h.price || 0,
      originalCurrency: h.currency || "USD",
      crossedOutRate: h.crossedOutRate ? Math.round(h.crossedOutRate * (1 + markup / 100)) : 0,
      discountPercentage: h.discountPercentage || 0,
      image: h.image || null,
      images: h.images || [],
      amenities: h.amenities || [],
      propertyType: h.propertyType || "Hotel",
      landingUrl: h.landingUrl || "",
      roomTypeName: h.roomTypeName || "",
      currency: h.currency || "USD",
      availableRooms: (h.availableRooms || []).map((r: any) => ({
        ...r,
        price: r.price ? Math.round(r.price * (1 + markup / 100)) : r.price,
        total_price: r.total_price ? Math.round(r.total_price * (1 + markup / 100)) : r.total_price,
        source: "agoda",
      })),
      source: "agoda",
      description: h.description || "",
      mealBasis: h.mealBasis || "",
    };
  });
}

// ── Deduplication ──

function hotelDeduplicationKey(h: NormalizedHotel): string {
  // Deduplicate by normalized name + city
  return `${h.name.toLowerCase().replace(/[^a-z0-9]/g, "")}-${h.city.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

// ── Convert hotel prices ──

function convertHotelPrices(hotel: NormalizedHotel, targetCurrency: string, exchangeConfig: ExchangeConfig): NormalizedHotel {
  const fromCurrency = exchangeConfig.sourceCurrencies[hotel.source] || hotel.currency || "USD";

  if (fromCurrency === targetCurrency) {
    return { ...hotel, currency: targetCurrency };
  }

  const convert = (amount: number) => convertAmount(amount, fromCurrency, targetCurrency, exchangeConfig.rates, exchangeConfig.markup);

  return {
    ...hotel,
    price: convert(hotel.price),
    crossedOutRate: hotel.crossedOutRate ? convert(hotel.crossedOutRate) : 0,
    currency: targetCurrency,
    availableRooms: hotel.availableRooms.map((r: any) => ({
      ...r,
      price: r.price ? convert(r.price) : r.price,
      total_price: r.total_price ? convert(r.total_price) : r.total_price,
      rate: r.rate ? convert(r.rate) : r.rate,
      discount_price: r.discount_price ? convert(r.discount_price) : r.discount_price,
    })),
  };
}

// ── Build room info ──

function buildRoomInfo(adults: number, children: number, rooms: number): { adults: number; child: number }[] {
  const effectiveRooms = Math.max(1, Math.min(rooms, adults));
  const baseAdults = Math.floor(adults / effectiveRooms);
  let remAdults = adults % effectiveRooms;
  return Array.from({ length: effectiveRooms }).map((_, i) => {
    const a = baseAdults + (remAdults > 0 ? 1 : 0);
    if (remAdults > 0) remAdults -= 1;
    return { adults: Math.max(1, a), child: i === 0 ? Math.max(0, children) : 0 };
  });
}

// ── Search request ──

interface HotelSearchRequest {
  cityName: string;
  checkinDate: string;
  checkoutDate: string;
  adults?: number;
  children?: number;
  rooms?: number;
  currency?: string;
  limit?: number;
  tenant_id?: string;
}

// ── Main search ──

async function performSearch(
  body: HotelSearchRequest,
  config: HotelProviderConfig,
  sb: any
): Promise<NormalizedHotel[]> {
  const {
    cityName,
    checkinDate,
    checkoutDate,
    adults = 2,
    children = 0,
    rooms = 1,
    limit = 50,
  } = body;

  const roomInfo = buildRoomInfo(adults, children, rooms);
  const allHotels: NormalizedHotel[] = [];
  const apiCalls: Promise<void>[] = [];

  // 1. TravelVela (always enabled as primary)
  if (config.travelvelaEnabled) {
    apiCalls.push((async () => {
      try {
        // Step 1: Resolve location
        const locData = await callEdgeFunction("travelvela-hotel-search", {
          action: "search-locations",
          keyword: cityName,
        });
        const locations = locData?.locations || [];
        if (locations.length === 0) {
          console.log("[unified-hotel] TravelVela: no locations found for", cityName);
          return;
        }
        const preferred = locations.find((l: any) => l.type === "CITY") || locations[0];
        const locationId = String(preferred?.location_id || preferred?.id || "");
        if (!locationId) return;

        // Step 2: Search hotels
        const data = await callEdgeFunction("travelvela-hotel-search", {
          action: "search",
          checkinDate,
          checkoutDate,
          locationId,
          roomInfo,
          limit,
        });

        const markup = getMarkup(config, "travelvela");
        const hotels = normalizeTravelvelaHotels(data, markup);
        if (hotels.length > 0) {
          allHotels.push(...hotels);
          console.log(`[unified-hotel] TravelVela: ${hotels.length} hotels`);
        }
      } catch (err) {
        console.error("[unified-hotel] TravelVela error:", err);
      }
    })());
  }

  // 2. Tripjack
  if (config.tripjackEnabled) {
    apiCalls.push((async () => {
      try {
        const data = await callEdgeFunction("tripjack-hotel-search", {
          action: "search",
          checkinDate,
          checkoutDate,
          cityName,
          roomInfo: roomInfo.map(r => ({ adults: r.adults, child: r.child })),
        });

        const markup = getMarkup(config, "tripjack");
        const hotels = normalizeTripjackHotels(data, markup);
        if (hotels.length > 0) {
          allHotels.push(...hotels);
          console.log(`[unified-hotel] Tripjack: ${hotels.length} hotels`);
        } else if (data?.note) {
          console.log("[unified-hotel] Tripjack note:", data.note);
        }
      } catch (err) {
        console.error("[unified-hotel] Tripjack error:", err);
      }
    })());
  }

  // 3. Agoda
  if (config.agodaEnabled) {
    apiCalls.push((async () => {
      try {
        const data = await callEdgeFunction("agoda-hotel-search", {
          action: "search",
          cityName,
          checkinDate,
          checkoutDate,
          rooms,
          adults,
          children,
        });

        const markup = getMarkup(config, "agoda");
        const hotels = normalizeAgodaHotels(data, markup);
        if (hotels.length > 0) {
          allHotels.push(...hotels);
          console.log(`[unified-hotel] Agoda: ${hotels.length} hotels`);
        }
      } catch (err) {
        console.error("[unified-hotel] Agoda error:", err);
      }
    })());
  }

  await Promise.all(apiCalls);

  // Deduplicate: same hotel name + city → keep lowest price
  const dedupMap = new Map<string, NormalizedHotel>();
  for (const h of allHotels) {
    const key = hotelDeduplicationKey(h);
    const existing = dedupMap.get(key);
    if (!existing || h.price < existing.price) {
      dedupMap.set(key, h);
    }
  }

  return Array.from(dedupMap.values());
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return json({ success: false, error: "Rate limit exceeded" }, 429);
  }

  try {
    const body: HotelSearchRequest = await req.json();

    if (!body.cityName || !body.checkinDate || !body.checkoutDate) {
      return json({ success: false, error: "cityName, checkinDate, and checkoutDate are required" }, 400);
    }

    const sb = getSupabaseAdmin();

    console.log(`[unified-hotel] city=${body.cityName}, checkin=${body.checkinDate}, checkout=${body.checkoutDate}, adults=${body.adults || 2}, rooms=${body.rooms || 1}`);

    // Load config and exchange rates in parallel
    const [config, exchangeConfig] = await Promise.all([
      loadProviderConfig(sb),
      loadExchangeConfig(sb),
    ]);

    console.log(`[unified-hotel] providers: tv=${config.travelvelaEnabled}, tj=${config.tripjackEnabled}, agoda=${config.agodaEnabled}, markup=${config.markupPercentage}%`);

    // Perform search across all providers
    const hotels = await performSearch(body, config, sb);

    // Sort by rating (descending) by default
    hotels.sort((a, b) => b.rating - a.rating);

    console.log(`[unified-hotel] total results after dedup: ${hotels.length}`);

    // Convert to target currency
    const targetCurrency = body.currency || "BDT";
    const convertedHotels = hotels.map(h => convertHotelPrices(h, targetCurrency, exchangeConfig));

    // Build providers response
    const providers = {
      travelvela: config.travelvelaEnabled,
      tripjack: config.tripjackEnabled,
      agoda: config.agodaEnabled,
    };

    return json({
      success: true,
      hotels: convertedHotels,
      count: convertedHotels.length,
      providers,
      displayCurrency: targetCurrency,
    });
  } catch (e) {
    console.error("[unified-hotel] error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
