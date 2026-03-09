import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Search, Loader2, TrendingUp, Clock, Compass } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface TourLocation {
  location_id: string;
  name: string;
  country: string;
  full_name: string;
  type: string;
}

const RECENT_KEY = "tour_location_recent";

function getRecentLocations(): TourLocation[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch {
    return [];
  }
}

function addRecentLocation(loc: TourLocation) {
  try {
    const recent = getRecentLocations().filter(r => r.location_id !== loc.location_id);
    recent.unshift(loc);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {}
}

type NominatimResult = {
  place_id: number;
  display_name: string;
  type: string;
  class: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    tourism?: string;
  };
  name?: string;
};

function extractName(result: NominatimResult): string {
  if (result.name) return result.name;
  const addr = result.address;
  if (addr) return addr.city || addr.town || addr.village || "";
  return result.display_name.split(",")[0];
}

function extractCountry(result: NominatimResult): string {
  return result.address?.country || result.display_name.split(",").pop()?.trim() || "";
}

function mapType(cls: string, type: string): string {
  if (type === "city" || type === "town" || type === "village" || type === "administrative") return "CITY";
  if (cls === "tourism") return "ATTRACTION";
  if (type === "country") return "COUNTRY";
  return "CITY";
}

function nominatimToLocation(result: NominatimResult): TourLocation {
  return {
    location_id: String(result.place_id),
    name: extractName(result),
    country: extractCountry(result),
    full_name: result.display_name,
    type: mapType(result.class, result.type),
  };
}

const typeConfig: Record<string, { icon: typeof MapPin; label: string; color: string }> = {
  CITY: { icon: MapPin, label: "City", color: "text-primary" },
  COUNTRY: { icon: Compass, label: "Country", color: "text-accent" },
  ATTRACTION: { icon: Compass, label: "Attraction", color: "text-amber-500" },
};

function getTypeConfig(type: string) {
  return typeConfig[type] || { icon: MapPin, label: "Location", color: "text-muted-foreground" };
}

interface TourLocationPickerProps {
  value: string;
  onSelect: (name: string) => void;
  placeholder?: string;
  /** Render as inline input style (for search forms) vs button style */
  variant?: "button" | "inline";
}

const TourLocationPicker = ({
  value,
  onSelect,
  placeholder = "Where do you want to go?",
  variant = "button",
}: TourLocationPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TourLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showingRecent, setShowingRecent] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchLocations = useCallback(async (keyword: string) => {
    if (keyword.length < 2) {
      setResults([]);
      setShowingRecent(true);
      return;
    }
    setLoading(true);
    setShowingRecent(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: keyword,
        format: "json",
        addressdetails: "1",
        limit: "12",
        "accept-language": "en",
      });
      const res = await fetch(url, {
        headers: { "User-Agent": "LovableTravelApp/1.0" },
      });
      if (res.ok) {
        const data: NominatimResult[] = await res.json();
        const seen = new Set<string>();
        const locations: TourLocation[] = [];
        for (const item of data) {
          const loc = nominatimToLocation(item);
          const key = `${loc.name.toLowerCase()}-${loc.country.toLowerCase()}-${loc.type}`;
          if (!seen.has(key) && loc.name) {
            seen.add(key);
            locations.push(loc);
          }
        }
        setResults(locations);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setShowingRecent(true);
      return;
    }
    debounceRef.current = setTimeout(() => searchLocations(val), 350);
  };

  const handleSelect = (loc: TourLocation) => {
    addRecentLocation(loc);
    onSelect(loc.name);
    setOpen(false);
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setShowingRecent(true);
    }
  }, [open]);

  const recentLocations = getRecentLocations();
  const displayList = showingRecent ? recentLocations : results;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "button" ? (
          <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
            </div>
            {value ? (
              <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{value}</span>
            ) : (
              <span className="text-xs sm:text-sm font-semibold text-muted-foreground truncate">{placeholder}</span>
            )}
          </button>
        ) : (
          <button className="w-full text-left border border-border rounded-md px-3 py-2 h-10 flex items-center gap-2 hover:border-primary/40 transition-colors">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            {value ? (
              <span className="text-sm text-foreground truncate">{value}</span>
            ) : (
              <span className="text-sm text-muted-foreground truncate">{placeholder}</span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom" sideOffset={8} avoidCollisions={false}>
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search city, country or attraction..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          {loading && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />}
        </div>

        {/* Results */}
        <div className="min-h-[120px] max-h-64 overflow-y-auto py-1">
          {showingRecent && recentLocations.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <Clock className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Searches</span>
            </div>
          )}

          {!showingRecent && results.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Locations</span>
            </div>
          )}

          {displayList.length === 0 ? (
            <div className="text-center py-6 px-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Searching locations...</p>
              ) : showingRecent ? (
                <div>
                  <Compass className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Search for a city, country or attraction</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">e.g. "Paris", "Bali", "Taj Mahal"</p>
                </div>
              ) : query.length >= 2 ? (
                <p className="text-sm text-muted-foreground">No locations found</p>
              ) : (
                <p className="text-sm text-muted-foreground">Type at least 2 characters...</p>
              )}
            </div>
          ) : (
            displayList.map((loc, i) => {
              const config = getTypeConfig(loc.type);
              const Icon = config.icon;
              const isRecent = showingRecent && recentLocations.some(r => r.location_id === loc.location_id);

              return (
                <button
                  key={`${loc.location_id}-${i}`}
                  onClick={() => handleSelect(loc)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{loc.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{loc.full_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-muted ${config.color}`}>
                      {config.label}
                    </span>
                    {isRecent && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Recent</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TourLocationPicker;
