import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Search, Loader2, TrendingUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { airports as staticAirports } from "@/data/airports";
import type { Airport } from "@/data/airports";

export type { Airport };
export { staticAirports as airports };

// ── Runtime cache: airports fetched from server get promoted here ──
const runtimeCache = new Map<string, Airport>();
const CACHE_KEY = "airport_runtime_cache";

try {
  const saved = localStorage.getItem(CACHE_KEY);
  if (saved) {
    const entries: Airport[] = JSON.parse(saved);
    for (const a of entries) runtimeCache.set(a.code, a);
  }
} catch { /* ignore */ }

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...runtimeCache.values()]));
  } catch { /* ignore */ }
}

function addToCache(airport: Airport) {
  if (!runtimeCache.has(airport.code) && !staticAirports.some((s) => s.code === airport.code)) {
    runtimeCache.set(airport.code, airport);
    saveCache();
  }
}

function getAllAirports(): Airport[] {
  if (runtimeCache.size === 0) return staticAirports;
  const merged = [...staticAirports];
  for (const a of runtimeCache.values()) {
    if (!staticAirports.some((s) => s.code === a.code)) merged.push(a);
  }
  return merged;
}

function sortResults(list: Airport[], q: string): Airport[] {
  const ql = q.toLowerCase();
  return [...list].sort((a, b) => {
    const aCode = a.code.toLowerCase();
    const bCode = b.code.toLowerCase();
    if (aCode === ql && bCode !== ql) return -1;
    if (bCode === ql && aCode !== ql) return 1;
    const aStarts = aCode.startsWith(ql);
    const bStarts = bCode.startsWith(ql);
    if (aStarts && !bStarts) return -1;
    if (bStarts && !aStarts) return 1;
    return a.city.localeCompare(b.city);
  });
}

function localSearch(q: string): { results: Airport[]; exactMatch: boolean } {
  const all = getAllAirports();
  if (!q) return { results: all.slice(0, 15), exactMatch: false };
  const ql = q.toLowerCase();
  const exact = all.find((a) => a.code.toLowerCase() === ql);
  if (exact) return { results: [exact], exactMatch: true };

  const matches = all.filter(
    (a) =>
      a.code.toLowerCase().includes(ql) ||
      a.city.toLowerCase().includes(ql) ||
      a.name.toLowerCase().includes(ql) ||
      a.country.toLowerCase().includes(ql)
  );
  return { results: sortResults(matches, q).slice(0, 20), exactMatch: false };
}

// ── Shared geo + popularity state (loaded once, shared across all pickers) ──
let popularityScores: Map<string, number> | null = null;
let userCountry: string | null = null;
let geoDataLoaded = false;
let geoDataPromise: Promise<void> | null = null;

// Recently selected airports (persisted)
const RECENT_KEY = "airport_recent";
function getRecentAirports(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch { return []; }
}
function addRecentAirport(code: string) {
  try {
    const recent = getRecentAirports().filter(c => c !== code);
    recent.unshift(code);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch { /* ignore */ }
}

async function loadGeoAndPopularity() {
  if (geoDataLoaded) return;
  if (geoDataPromise) return geoDataPromise;

  geoDataPromise = (async () => {
    try {
      // Load popular routes and geolocation in parallel
      const [routesResult, geoResult] = await Promise.allSettled([
        supabase.from("popular_routes").select("from_code,to_code,search_count").gt("search_count", 0).order("search_count", { ascending: false }).limit(50),
        fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) }).then(r => r.json()),
      ]);

      // Process popularity scores
      const scores = new Map<string, number>();
      if (routesResult.status === "fulfilled" && routesResult.value.data) {
        for (const route of routesResult.value.data) {
          scores.set(route.from_code, (scores.get(route.from_code) || 0) + route.search_count);
          scores.set(route.to_code, (scores.get(route.to_code) || 0) + route.search_count);
        }
      }
      popularityScores = scores;

      // Process geolocation
      if (geoResult.status === "fulfilled" && geoResult.value?.country_name) {
        userCountry = geoResult.value.country_name;
      }
    } catch { /* ignore */ }
    geoDataLoaded = true;
  })();

  return geoDataPromise;
}

function getSmartDefaults(): Airport[] {
  const all = getAllAirports();
  const recentCodes = getRecentAirports();
  const recentAirports = recentCodes
    .map(code => all.find(a => a.code === code))
    .filter(Boolean) as Airport[];

  // Score each airport
  const scored = all.map(airport => {
    let score = 0;

    // Recent selections get highest priority
    const recentIdx = recentCodes.indexOf(airport.code);
    if (recentIdx >= 0) score += 1000 - recentIdx * 100;

    // Popularity from search data
    if (popularityScores?.has(airport.code)) {
      score += popularityScores.get(airport.code)! * 2;
    }

    // Same country as user gets a boost
    if (userCountry && airport.country.toLowerCase().includes(userCountry.toLowerCase())) {
      score += 50;
    }

    return { airport, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate while preserving order
  const seen = new Set<string>();
  const result: Airport[] = [];
  for (const { airport } of scored) {
    if (!seen.has(airport.code)) {
      seen.add(airport.code);
      result.push(airport);
    }
    if (result.length >= 15) break;
  }

  return result;
}

// For Flights.tsx findAirport
export async function findAirportByCode(code: string): Promise<Airport | null> {
  if (!code) return null;
  const all = getAllAirports();
  const s = all.find((a) => a.code === code);
  if (s) return s;
  try {
    const { data } = await supabase.functions.invoke("search-airports", { body: { code } });
    if (data?.success && data.airports?.[0]) {
      const a = data.airports[0];
      const airport = { code: a.iata_code, name: a.name, city: a.city, country: a.country };
      addToCache(airport);
      return airport;
    }
  } catch { /* ignore */ }
  return null;
}

interface AirportPickerProps {
  label: string;
  placeholder: string;
  selected: Airport | null;
  onSelect: (airport: Airport) => void;
  excludeCode?: string;
}

const AirportPicker = ({ label, placeholder, selected, onSelect, excludeCode }: AirportPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Airport[]>(staticAirports.slice(0, 15));
  const [serverLoading, setServerLoading] = useState(false);
  const [showingSmart, setShowingSmart] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Pre-load geo data on mount
  useEffect(() => {
    loadGeoAndPopularity();
  }, []);

  const filterExcluded = useCallback((list: Airport[]) => {
    return excludeCode ? list.filter(a => a.code !== excludeCode) : list;
  }, [excludeCode]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setShowingSmart(!value);

    const { results: local, exactMatch } = localSearch(value);
    setResults(filterExcluded(local));

    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (exactMatch) return;

    if (value.length >= 2 && local.length < 5) {
      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setServerLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke("search-airports", {
            body: { query: value },
          });
          if (controller.signal.aborted) return;
          if (!error && data?.success && data.airports?.length > 0) {
            const serverAirports: Airport[] = data.airports.map((a: any) => ({
              code: a.iata_code, name: a.name, city: a.city, country: a.country,
            }));
            const merged = new Map<string, Airport>();
            for (const a of local) merged.set(a.code, a);
            for (const a of serverAirports) if (!merged.has(a.code)) merged.set(a.code, a);
            setResults(filterExcluded(sortResults([...merged.values()], value).slice(0, 20)));
          }
        } catch { /* ignore */ }
        finally { if (!controller.signal.aborted) setServerLoading(false); }
      }, 150);
    }
  }, [filterExcluded]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      // Show smart defaults (geo + popularity ranked)
      const smart = filterExcluded(getSmartDefaults());
      setResults(smart.length > 0 ? smart : filterExcluded(getAllAirports().slice(0, 15)));
      setShowingSmart(true);
    } else {
      setQuery("");
      setServerLoading(false);
      setShowingSmart(true);
    }
  }, [open]);

  const recentCodes = getRecentAirports();
  const hasRecents = recentCodes.length > 0 && showingSmart;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-3 w-full text-left min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          {selected ? (
            <div className="min-w-0">
              <span className="text-sm font-bold text-foreground block leading-tight">{selected.city}</span>
              <span className="text-[11px] text-muted-foreground truncate block">{selected.code} · {selected.name}</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground font-medium truncate">{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search city or airport..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          {serverLoading && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />}
        </div>

        <div className="max-h-60 overflow-y-auto py-1">
          {/* Section header for smart suggestions */}
          {showingSmart && results.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {hasRecents ? "Recent & Popular" : "Popular Airports"}
              </span>
            </div>
          )}

          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {serverLoading ? "Searching airports..." : "No airports found"}
            </p>
          ) : (
            results.map((airport) => {
              const isRecent = showingSmart && recentCodes.includes(airport.code);
              return (
                <button
                  key={airport.code}
                  onClick={() => {
                    addToCache(airport);
                    addRecentAirport(airport.code);
                    onSelect(airport);
                    setOpen(false);
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{airport.code}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{airport.city}, {airport.country}</p>
                    <p className="text-xs text-muted-foreground truncate">{airport.name}</p>
                  </div>
                  {isRecent && (
                    <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">Recent</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AirportPicker;