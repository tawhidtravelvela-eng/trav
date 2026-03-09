import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Search, Loader2, TrendingUp, Building2, Map, Landmark, Clock, Hotel } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface HotelLocation {
  location_id: string;
  city_name: string;
  country_name: string;
  type: string;
  full_region_name: string;
}

// ── Recent hotel locations (persisted) ──
const RECENT_KEY = "hotel_location_recent";

function getRecentLocations(): HotelLocation[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch {
    return [];
  }
}

function addRecentLocation(loc: HotelLocation) {
  try {
    const recent = getRecentLocations().filter(
      (r) => r.location_id !== loc.location_id
    );
    recent.unshift(loc);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)));
  } catch {
    /* ignore */
  }
}

// ── Nominatim type mapping ──
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

function mapNominatimType(cls: string, type: string): string {
  if (cls === "tourism" || type === "hotel" || type === "hostel" || type === "motel" || type === "guest_house") return "HOTEL";
  if (cls === "tourism" && (type === "attraction" || type === "museum" || type === "viewpoint")) return "POINT_OF_INTEREST";
  if (type === "city" || type === "town" || type === "village" || type === "administrative") return "CITY";
  if (type === "suburb" || type === "neighbourhood" || type === "quarter" || type === "residential") return "NEIGHBORHOOD";
  if (cls === "amenity" || cls === "historic" || cls === "leisure") return "POINT_OF_INTEREST";
  return "CITY";
}

function extractCityName(result: NominatimResult): string {
  if (result.name) return result.name;
  const addr = result.address;
  if (addr) return addr.city || addr.town || addr.village || "";
  return result.display_name.split(",")[0];
}

function extractCountry(result: NominatimResult): string {
  return result.address?.country || result.display_name.split(",").pop()?.trim() || "";
}

function nominatimToLocation(result: NominatimResult): HotelLocation {
  const mappedType = mapNominatimType(result.class, result.type);
  return {
    location_id: String(result.place_id),
    city_name: extractCityName(result),
    country_name: extractCountry(result),
    type: mappedType,
    full_region_name: result.display_name,
  };
}

const typeConfig: Record<string, { icon: typeof MapPin; label: string; color: string }> = {
  CITY: { icon: Map, label: "City", color: "text-primary" },
  NEIGHBORHOOD: { icon: MapPin, label: "Area", color: "text-accent" },
  POINT_OF_INTEREST: { icon: Landmark, label: "Landmark", color: "text-amber-500" },
  HOTEL: { icon: Hotel, label: "Hotel", color: "text-emerald-500" },
};

function getTypeConfig(type: string) {
  return typeConfig[type] || { icon: MapPin, label: type?.replace(/_/g, " ") || "Location", color: "text-muted-foreground" };
}

interface HotelLocationPickerProps {
  selected: HotelLocation | null;
  onSelect: (location: HotelLocation) => void;
  placeholder?: string;
}

const HotelLocationPicker = ({
  selected,
  onSelect,
  placeholder = "Where are you going?",
}: HotelLocationPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HotelLocation[]>([]);
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
        // Deduplicate by city_name + country
        const seen = new Set<string>();
        const locations: HotelLocation[] = [];
        for (const item of data) {
          const loc = nominatimToLocation(item);
          const key = `${loc.city_name.toLowerCase()}-${loc.country_name.toLowerCase()}-${loc.type}`;
          if (!seen.has(key) && loc.city_name) {
            seen.add(key);
            locations.push(loc);
          }
        }
        setResults(locations);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      setShowingRecent(true);
      return;
    }

    debounceRef.current = setTimeout(() => searchLocations(value), 350);
  };

  const handleSelect = (loc: HotelLocation) => {
    addRecentLocation(loc);
    onSelect(loc);
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
        <button className="flex items-center gap-2 bg-muted/40 rounded-xl border border-border/70 px-3 py-2.5 hover:border-primary/40 hover:bg-muted/60 transition-all duration-200 w-full text-left">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          {selected ? (
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-semibold text-foreground block leading-tight truncate">
                {selected.city_name}
              </span>
              <span className="text-[10px] text-muted-foreground truncate block leading-tight">
                {selected.country_name}
              </span>
            </div>
          ) : (
            <span className="text-xs sm:text-sm font-semibold text-muted-foreground truncate">
              {placeholder}
            </span>
          )}
        </button>
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
            placeholder="Search city, area, or landmark..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
          />
          {loading && (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />
          )}
        </div>

        {/* Results list */}
        <div className="min-h-[120px] max-h-64 overflow-y-auto py-1">
          {showingRecent && recentLocations.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <Clock className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Searches
              </span>
            </div>
          )}

          {!showingRecent && results.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Locations
              </span>
            </div>
          )}

          {displayList.length === 0 ? (
            <div className="text-center py-6 px-4">
              {loading ? (
                <p className="text-sm text-muted-foreground">Searching locations...</p>
              ) : showingRecent ? (
                <div>
                  <Building2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Search for a city, area, or landmark
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    e.g. "Dhaka", "Cox's Bazar", "Taj Mahal"
                  </p>
                </div>
              ) : query.length >= 2 ? (
                <p className="text-sm text-muted-foreground">No locations found</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Type at least 2 characters...
                </p>
              )}
            </div>
          ) : (
            displayList.map((loc, i) => {
              const config = getTypeConfig(loc.type);
              const Icon = config.icon;
              const isRecent =
                showingRecent &&
                recentLocations.some((r) => r.location_id === loc.location_id);

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
                    <p className="text-sm font-medium text-foreground truncate">
                      {loc.city_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {loc.full_region_name}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span
                      className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-muted ${config.color}`}
                    >
                      {config.label}
                    </span>
                    {isRecent && (
                      <span className="text-[9px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                        Recent
                      </span>
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

export default HotelLocationPicker;
