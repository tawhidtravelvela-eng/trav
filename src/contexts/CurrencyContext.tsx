import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "BDT" | "CNY";

// Map country codes to supported currencies
const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
  US: "USD", BD: "BDT", GB: "GBP", DE: "EUR", FR: "EUR", IT: "EUR",
  ES: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", PT: "EUR", IE: "EUR",
  FI: "EUR", GR: "EUR", LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR",
  LV: "EUR", LT: "EUR", MT: "EUR", CY: "EUR", CN: "CNY",
};

interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  rate: number;
}

const DEFAULT_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  BDT: 110.5,
  CNY: 7.24,
};

const CURRENCY_META: Record<CurrencyCode, { symbol: string; name: string }> = {
  USD: { symbol: "$", name: "US Dollar" },
  EUR: { symbol: "€", name: "Euro" },
  GBP: { symbol: "£", name: "British Pound" },
  BDT: { symbol: "৳", name: "Bangladeshi Taka" },
  CNY: { symbol: "¥", name: "Chinese Yuan" },
};

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = Object.fromEntries(
  Object.entries(CURRENCY_META).map(([code, meta]) => [
    code,
    { code: code as CurrencyCode, ...meta, rate: DEFAULT_RATES[code as CurrencyCode] },
  ])
) as Record<CurrencyCode, CurrencyInfo>;

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  /** Convert a price in USD to the display currency (for internal/local prices) */
  convertPrice: (usdPrice: number, source?: string) => number;
  /** Format a price in USD to the display currency string (for internal/local prices) */
  formatPrice: (usdPrice: number, source?: string) => string;
  /** Format a price that is ALREADY in the display currency (no conversion) */
  formatDirectPrice: (amount: number) => string;
  rates: Record<CurrencyCode, number>;
  liveRates: Record<string, number>;
  conversionMarkup: number;
  apiSourceCurrencies: Record<string, string>;
  /** Whether the billing currency has been resolved from profile */
  billingResolved: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

/** Try multiple geolocation strategies with robust fallback */
const fetchGeoCountry = async (): Promise<string | null> => {
  const apis = [
    { url: "https://api.country.is", extract: (d: any) => d?.country },
    { url: "https://ipapi.co/json/", extract: (d: any) => d?.country_code },
    { url: "https://ipwho.is/", extract: (d: any) => d?.country_code },
  ];

  for (const api of apis) {
    try {
      const res = await fetch(api.url, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      const code = api.extract(data);
      if (code && typeof code === "string") return code.toUpperCase();
    } catch {
      // try next
    }
  }

  // Network-independent fallback by timezone
  const timezoneToCountry: Record<string, string> = {
    "Asia/Dhaka": "BD",
    "Europe/London": "GB",
    "Europe/Paris": "FR",
    "Europe/Berlin": "DE",
    "Asia/Shanghai": "CN",
    "America/New_York": "US",
  };

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && timezoneToCountry[tz]) return timezoneToCountry[tz];
  } catch {
    // ignore
  }

  // Final fallback from browser locale (e.g. en-BD)
  try {
    const locale = navigator.language || "";
    const region = locale.split("-")[1];
    if (region) return region.toUpperCase();
  } catch {
    // ignore
  }

  return null;
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [billingResolved, setBillingResolved] = useState(false);

  // On mount: detect billing currency from profile (if logged in) or geolocation
  useEffect(() => {
    const resolve = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("billing_currency")
          .eq("user_id", userId)
          .maybeSingle();

        const bc = (profile?.billing_currency || "USD") as CurrencyCode;
        const isDefault = bc === "USD";

        if (!isDefault && CURRENCY_META[bc]) {
          // Admin has explicitly set a currency — use it
          setCurrencyState(bc);
          setBillingResolved(true);
          return;
        }

        // Still default USD — try geolocation and save to profile
        try {
          const geo = await fetchGeoCountry();
          if (geo && COUNTRY_TO_CURRENCY[geo]) {
            const detected = COUNTRY_TO_CURRENCY[geo];
            setCurrencyState(detected);
            await supabase
              .from("profiles")
              .update({ billing_currency: detected } as any)
              .eq("user_id", userId);
            setBillingResolved(true);
            return;
          }
        } catch {
          // Keep USD default
        }

        // If geolocation didn't match, keep USD
        setCurrencyState(bc);
        setBillingResolved(true);
        return;
      }

      // Not logged in — try geolocation for display only
      try {
        const geo = await fetchGeoCountry();
        if (geo && COUNTRY_TO_CURRENCY[geo]) {
          setCurrencyState(COUNTRY_TO_CURRENCY[geo]);
        }
      } catch {
        // Keep USD default
      }

      setBillingResolved(true);
    };

    resolve();

    const syncCurrencyFromProfile = async (userId: string) => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("billing_currency")
          .eq("user_id", userId)
          .maybeSingle();

        if (profile?.billing_currency) {
          const bc = profile.billing_currency as CurrencyCode;
          if (CURRENCY_META[bc]) {
            setCurrencyState(bc);
          }
        }
      } catch (error) {
        console.warn("[Currency] Failed to sync billing currency:", error);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Keep callback synchronous to avoid auth-event deadlocks
      if (event === "SIGNED_IN" && session?.user?.id) {
        void syncCurrencyFromProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const [rates, setRates] = useState<Record<CurrencyCode, number>>(DEFAULT_RATES);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({ USD: 1 });
  const [conversionMarkup, setConversionMarkup] = useState(2);
  const [apiSourceCurrencies, setApiSourceCurrencies] = useState<Record<string, string>>({
    travelport: "BDT",
    travelvela: "BDT",
    tripjack: "INR",
    amadeus: "USD",
    local_inventory: "USD",
  });

  const fetchRates = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("api_settings")
        .select("settings")
        .eq("provider", "currency_rates")
        .maybeSingle();
      if (data?.settings) {
        const s = data.settings as any;
        if (s.live_rates && typeof s.live_rates === "object") {
          setLiveRates(s.live_rates);
          setRates((prev) => ({
            ...prev,
            USD: 1,
            EUR: s.live_rates.EUR ?? prev.EUR,
            GBP: s.live_rates.GBP ?? prev.GBP,
            BDT: s.live_rates.BDT ?? prev.BDT,
            CNY: s.live_rates.CNY ?? prev.CNY,
          }));
        }
        if (s.conversion_markup !== undefined) {
          setConversionMarkup(s.conversion_markup);
        }
        if (s.api_source_currencies) {
          setApiSourceCurrencies((prev) => ({ ...prev, ...s.api_source_currencies }));
        }
      }
    } catch {
      // Keep defaults
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const handler = () => fetchRates();
    window.addEventListener("currency-rates-updated", handler);
    return () => window.removeEventListener("currency-rates-updated", handler);
  }, [fetchRates]);

  const setCurrency = useCallback(async (c: CurrencyCode) => {
    setCurrencyState(c);
    // Persist to profile if logged in
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (userId) {
      await supabase
        .from("profiles")
        .update({ billing_currency: c } as any)
        .eq("user_id", userId);
    }
  }, []);

  const convertPrice = useCallback(
    (price: number, source?: string) => {
      if (source && source !== "database") {
        const sourceCurr = apiSourceCurrencies[source] || "USD";
        if (sourceCurr === currency) return Math.round(price);
        const srcRate = liveRates[sourceCurr] || DEFAULT_RATES[sourceCurr as CurrencyCode] || 1;
        const dstRate = liveRates[currency] || DEFAULT_RATES[currency] || 1;
        const markup = 1 + conversionMarkup / 100;
        return Math.round((price / srcRate) * dstRate * markup);
      }
      const displayRate = liveRates[currency] || rates[currency] || 1;
      return Math.round(price * displayRate);
    },
    [currency, rates, liveRates, apiSourceCurrencies, conversionMarkup]
  );

  const formatPrice = useCallback(
    (price: number, source?: string) => {
      const converted = convertPrice(price, source);
      return `${CURRENCY_META[currency].symbol}${converted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },
    [currency, convertPrice]
  );

  /** Format a price that is ALREADY in the display currency — no conversion applied */
  const formatDirectPrice = useCallback(
    (amount: number) => {
      return `${CURRENCY_META[currency].symbol}${Math.round(amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    },
    [currency]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        convertPrice,
        formatPrice,
        formatDirectPrice,
        rates,
        liveRates,
        conversionMarkup,
        apiSourceCurrencies,
        billingResolved,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
};
