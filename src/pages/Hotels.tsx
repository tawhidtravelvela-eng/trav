import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Star, MapPin, SlidersHorizontal, Loader2, Search, CalendarDays, Users, Building2, ChevronDown, BedDouble, Globe, ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { trackHotelInteraction } from "@/utils/hotelTracking";
import HotelLocationPicker, { type HotelLocation } from "@/components/home/HotelLocationPicker";

interface Hotel {
  id: string;
  name: string;
  city: string;
  rating: number;
  reviews: number;
  price: number;
  image: string | null;
  amenities: string[];
  stars: number;
  source?: string;
  searchId?: string;
  images?: string[];
  country?: string;
  propertyType?: string;
  availableRooms?: any[];
  mealBasis?: string;
  description?: string;
}

const HOTELS_PER_PAGE = 15;

const PRICE_RANGES = [
  { label: "Under $50", min: 0, max: 50 },
  { label: "$50 - $100", min: 50, max: 100 },
  { label: "$100 - $200", min: 100, max: 200 },
  { label: "$200 - $500", min: 200, max: 500 },
  { label: "$500+", min: 500, max: Infinity },
];

const STAR_OPTIONS = [5, 4, 3, 2, 1];

const Hotels = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [apiHotels, setApiHotels] = useState<Hotel[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<"price" | "rating">("rating");
  const [hasSearched, setHasSearched] = useState(false);
  const { formatPrice, convertPrice } = useCurrency();
  const hasAutoSearched = useRef(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [nameFilter, setNameFilter] = useState("");
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<number[]>([]);
  const [selectedStars, setSelectedStars] = useState<number[]>([]);
  const [selectedPropertyTypes, setSelectedPropertyTypes] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

  // Search state from URL
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(searchParams.get("locationId") || null);
  const [hotelLocation, setHotelLocation] = useState<HotelLocation | null>(() => {
    const c = searchParams.get("city");
    const lid = searchParams.get("locationId");
    if (c && lid) return { location_id: lid, city_name: c, country_name: "", type: "", full_region_name: c };
    return null;
  });
  const [checkin, setCheckin] = useState(searchParams.get("checkin") || "");
  const [checkout, setCheckout] = useState(searchParams.get("checkout") || "");
  const [adults, setAdults] = useState(Math.max(1, Number(searchParams.get("adults") || "1") || 1));
  const [children, setChildren] = useState(Math.max(0, Number(searchParams.get("children") || "0") || 0));
  const [rooms, setRooms] = useState(Math.max(1, Number(searchParams.get("rooms") || "1") || 1));
  const [searchCollapsed, setSearchCollapsed] = useState(false);

  // Settings loaded immediately - unified backend handles provider config
  const [settingsLoaded] = useState(true);

  
  const mapUnifiedHotels = (items: any[] = []): Hotel[] =>
    items.map((h: any) => ({
      id: h.id,
      name: h.name,
      city: h.city || h.country || "",
      rating: h.rating || 0,
      reviews: h.reviews || 0,
      price: h.price || 0,
      image: h.image || null,
      amenities: Array.isArray(h.amenities) ? h.amenities : [],
      stars: h.stars || 0,
      source: h.source || "",
      images: h.images || [],
      country: h.country || "",
      propertyType: h.propertyType || "Hotel",
      availableRooms: h.availableRooms || [],
      searchId: h.searchId || undefined,
      mealBasis: h.mealBasis || "",
      description: h.description || "",
    }));

  const lastSearchRef = useRef<{ cityName: string; checkin: string; checkout: string } | null>(null);

  const runSearch = useCallback(async (searchCity: string, searchCheckin: string, searchCheckout: string, searchAdults: number, searchChildren: number, searchRooms: number, limit = 50) => {
    if (!searchCity.trim()) return;
    setSearching(true);
    setApiHotels([]);
    setTotalAvailable(0);
    setHasSearched(true);
    setCurrentPage(1);
    // Reset filters on new search
    setNameFilter("");
    setSelectedPriceRanges([]);
    setSelectedStars([]);
    setSelectedPropertyTypes([]);
    setSelectedLocations([]);

    try {
      lastSearchRef.current = { cityName: searchCity, checkin: searchCheckin, checkout: searchCheckout };

      const { data, error } = await supabase.functions.invoke("unified-hotel-search", {
        body: {
          cityName: searchCity,
          checkinDate: searchCheckin,
          checkoutDate: searchCheckout,
          adults: searchAdults,
          children: searchChildren,
          rooms: searchRooms,
          limit,
        },
      });

      if (!error && data?.success && data.hotels?.length) {
        const hotels = mapUnifiedHotels(data.hotels);
        setApiHotels(hotels);
        setTotalAvailable(hotels.length);
      }
    } catch (err) {
      console.error("Unified hotel search failed:", err);
    }

    setSearching(false);
    setSearchCollapsed(true);
  }, []);

  // Auto-search on page load when URL params exist
  useEffect(() => {
    if (hasAutoSearched.current) return;
    if (!settingsLoaded) return;
    if (!city || !checkin || !checkout) return;
    hasAutoSearched.current = true;
    runSearch(city, checkin, checkout, adults, children, rooms, 50);
  }, [city, checkin, checkout, adults, children, rooms, runSearch, settingsLoaded]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (selectedLocationId) params.set("locationId", selectedLocationId);
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    params.set("adults", String(adults));
    if (children > 0) params.set("children", String(children));
    params.set("rooms", String(rooms));
    navigate(`/hotels?${params.toString()}`, { replace: true });

    if ((city || selectedLocationId) && checkin && checkout) {
      runSearch(city, checkin, checkout, adults, children, rooms, 50);
    }
  };

  // Derive unique property types and locations from results
  const availablePropertyTypes = useMemo(() => {
    const types = new Set<string>();
    apiHotels.forEach(h => {
      if (h.propertyType) types.add(h.propertyType);
    });
    return Array.from(types).sort();
  }, [apiHotels]);

  const availableLocations = useMemo(() => {
    const locs = new Set<string>();
    apiHotels.forEach(h => {
      const loc = h.city?.split(",")[0]?.trim();
      if (loc) locs.add(loc);
    });
    return Array.from(locs).sort();
  }, [apiHotels]);

  // Apply filters + sort
  const filtered = useMemo(() => {
    let result = [...apiHotels];

    // Name filter
    if (nameFilter.trim()) {
      const q = nameFilter.toLowerCase();
      result = result.filter(h => h.name.toLowerCase().includes(q));
    }

    // Price range filter (convert hotel BDT price to display currency for comparison)
    if (selectedPriceRanges.length > 0) {
      result = result.filter(h => {
        const displayPrice = convertPrice(h.price, "travelvela");
        return selectedPriceRanges.some(idx => {
          const range = PRICE_RANGES[idx];
          return displayPrice >= range.min && displayPrice < (range.max === Infinity ? 999999999 : range.max);
        });
      });
    }

    // Star filter
    if (selectedStars.length > 0) {
      result = result.filter(h => selectedStars.includes(h.stars));
    }

    // Property type filter
    if (selectedPropertyTypes.length > 0) {
      result = result.filter(h => h.propertyType && selectedPropertyTypes.includes(h.propertyType));
    }

    // Location filter
    if (selectedLocations.length > 0) {
      result = result.filter(h => {
        const loc = h.city?.split(",")[0]?.trim();
        return loc && selectedLocations.includes(loc);
      });
    }

    // Sort
    result.sort((a, b) => sortBy === "price" ? a.price - b.price : b.rating - a.rating);

    return result;
  }, [apiHotels, nameFilter, selectedPriceRanges, selectedStars, selectedPropertyTypes, selectedLocations, sortBy, convertPrice]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / HOTELS_PER_PAGE));
  const paginatedHotels = filtered.slice((currentPage - 1) * HOTELS_PER_PAGE, currentPage * HOTELS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [nameFilter, selectedPriceRanges, selectedStars, selectedPropertyTypes, selectedLocations, sortBy]);

  const togglePriceRange = (idx: number) => setSelectedPriceRanges(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  const toggleStar = (s: number) => setSelectedStars(prev => prev.includes(s) ? prev.filter(i => i !== s) : [...prev, s]);
  const togglePropertyType = (t: string) => setSelectedPropertyTypes(prev => prev.includes(t) ? prev.filter(i => i !== t) : [...prev, t]);
  const toggleLocation = (l: string) => setSelectedLocations(prev => prev.includes(l) ? prev.filter(i => i !== l) : [...prev, l]);

  const activeFilterCount = (nameFilter ? 1 : 0) + selectedPriceRanges.length + selectedStars.length + selectedPropertyTypes.length + selectedLocations.length;
  const clearFilters = () => { setNameFilter(""); setSelectedPriceRanges([]); setSelectedStars([]); setSelectedPropertyTypes([]); setSelectedLocations([]); };

  const hasSearchParams = !!(city && checkin && checkout);

  return (
    <Layout>
      {/* Hero + Search */}
      <div className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/80 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-primary-foreground/5 rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-10 relative z-10">
          {!searchCollapsed && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-2">
                Find Your Perfect Stay
              </h1>
              <p className="text-primary-foreground/70 text-sm md:text-base mb-8 max-w-lg">
                Search thousands of hotels worldwide and find the best deals for your next trip
              </p>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {searchCollapsed && hasSearchParams ? (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-card/95 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap cursor-pointer shadow-lg border border-border/20"
                onClick={() => setSearchCollapsed(false)}
              >
                <div className="flex items-center gap-5 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Destination</p>
                      <p className="font-semibold text-foreground text-sm capitalize">{city}</p>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-border hidden md:block" />
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <CalendarDays className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Dates</p>
                      <p className="font-medium text-foreground text-sm">{checkin} → {checkout}</p>
                    </div>
                  </div>
                  <div className="w-px h-8 bg-border hidden md:block" />
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Guests</p>
                      <p className="font-medium text-foreground text-sm">{adults} Adult{adults > 1 ? "s" : ""}, {rooms} Room{rooms > 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                  Modify <ChevronDown className="w-3 h-3" />
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-card/95 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-border/20"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Destination
                    </label>
                    <div className="h-11 flex items-center border border-border rounded-xl px-1 bg-background/50 hover:border-primary/40 transition-colors">
                      <HotelLocationPicker
                        selected={hotelLocation}
                        onSelect={(loc) => {
                          setHotelLocation(loc);
                          setCity(loc.city_name);
                          setSelectedLocationId(String(loc.location_id));
                        }}
                        placeholder="City or destination..."
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" /> Check-in
                    </label>
                    <Input type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} className="h-11 rounded-xl bg-background/50 border-border hover:border-primary/40 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" /> Check-out
                    </label>
                    <Input type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} className="h-11 rounded-xl bg-background/50 border-border hover:border-primary/40 transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Guests & Rooms
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input type="number" min={1} max={9} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} className="h-11 text-center rounded-xl bg-background/50 border-border hover:border-primary/40 transition-colors" title="Adults" />
                        <span className="text-[10px] text-muted-foreground block text-center mt-1">Adults</span>
                      </div>
                      <div className="flex-1">
                        <Input type="number" min={0} max={6} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))} className="h-11 text-center rounded-xl bg-background/50 border-border hover:border-primary/40 transition-colors" title="Children" />
                        <span className="text-[10px] text-muted-foreground block text-center mt-1">Children</span>
                      </div>
                      <div className="flex-1">
                        <Input type="number" min={1} max={5} value={rooms} onChange={(e) => setRooms(Math.max(1, Number(e.target.value) || 1))} className="h-11 text-center rounded-xl bg-background/50 border-border hover:border-primary/40 transition-colors" title="Rooms" />
                        <span className="text-[10px] text-muted-foreground block text-center mt-1">Rooms</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <Button className="h-11 px-8 rounded-xl gap-2 text-sm font-semibold" onClick={handleSearch} disabled={searching || !city}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search Hotels
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Before any search — welcome state */}
        {!hasSearched && !searching && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center max-w-xl mx-auto">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Globe className="w-10 h-10 text-primary/60" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">Where would you like to stay?</h2>
            <p className="text-muted-foreground leading-relaxed">
              Enter a destination, select your dates, and we'll search across providers to find the best hotel deals for you.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {["Dhaka", "Dubai", "Bangkok", "Kolkata", "Singapore"].map((suggestion) => (
                <Button key={suggestion} variant="outline" size="sm" className="rounded-full text-xs gap-1.5" onClick={() => {
                  setCity(suggestion);
                  setHotelLocation({ location_id: "", city_name: suggestion, country_name: "", type: "CITY", full_region_name: suggestion });
                }}>
                  <MapPin className="w-3 h-3" /> {suggestion}
                </Button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Searching state */}
        {searching && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-16 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
            <p className="text-lg font-semibold text-foreground">Searching hotels in {city}...</p>
            <p className="text-sm text-muted-foreground mt-1">Checking availability across providers</p>
          </motion.div>
        )}

        {/* Results */}
        {hasSearched && !searching && (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Filters */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="bg-card rounded-2xl p-5 sticky top-24 space-y-5 border border-border/50 max-h-[calc(100vh-7rem)] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-foreground text-sm">Filters</h3>
                  </div>
                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
                      <X className="w-3 h-3" /> Clear all
                    </button>
                  )}
                </div>

                {/* Search by name */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search Hotel</p>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Hotel name..."
                      value={nameFilter}
                      onChange={(e) => setNameFilter(e.target.value)}
                      className="h-9 pl-9 text-xs rounded-lg bg-background/50"
                    />
                  </div>
                </div>

                {/* Sort */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sort By</p>
                  <div className="flex flex-col gap-1.5">
                    <Button variant={sortBy === "rating" ? "default" : "outline"} size="sm" className="justify-start h-8 text-xs rounded-lg" onClick={() => setSortBy("rating")}>
                      <Star className="w-3 h-3 mr-1.5" /> Top Rated
                    </Button>
                    <Button variant={sortBy === "price" ? "default" : "outline"} size="sm" className="justify-start h-8 text-xs rounded-lg" onClick={() => setSortBy("price")}>
                      <ArrowRight className="w-3 h-3 mr-1.5" /> Lowest Price
                    </Button>
                  </div>
                </div>

                {/* Star Category */}
                <div className="space-y-2.5 pt-2 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Star Category</p>
                  <div className="space-y-1.5">
                    {STAR_OPTIONS.map(s => (
                      <label key={s} className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={selectedStars.includes(s)}
                          onCheckedChange={() => toggleStar(s)}
                          className="w-4 h-4"
                        />
                        <span className="flex items-center gap-0.5">
                          {Array.from({ length: s }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-accent text-accent" />
                          ))}
                        </span>
                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{s}-star</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price Range */}
                <div className="space-y-2.5 pt-2 border-t border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price Range</p>
                  <div className="space-y-1.5">
                    {PRICE_RANGES.map((range, idx) => (
                      <label key={idx} className="flex items-center gap-2 cursor-pointer group">
                        <Checkbox
                          checked={selectedPriceRanges.includes(idx)}
                          onCheckedChange={() => togglePriceRange(idx)}
                          className="w-4 h-4"
                        />
                        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{range.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Property Type */}
                {availablePropertyTypes.length > 1 && (
                  <div className="space-y-2.5 pt-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Property Type</p>
                    <div className="space-y-1.5">
                      {availablePropertyTypes.map(t => (
                        <label key={t} className="flex items-center gap-2 cursor-pointer group">
                          <Checkbox
                            checked={selectedPropertyTypes.includes(t)}
                            onCheckedChange={() => togglePropertyType(t)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors capitalize">{t.toLowerCase()}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular Places / Locations */}
                {availableLocations.length > 1 && (
                  <div className="space-y-2.5 pt-2 border-t border-border/50">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Popular Places</p>
                    <div className="space-y-1.5">
                      {availableLocations.slice(0, 8).map(loc => (
                        <label key={loc} className="flex items-center gap-2 cursor-pointer group">
                          <Checkbox
                            checked={selectedLocations.includes(loc)}
                            onCheckedChange={() => toggleLocation(loc)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{loc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hotel list */}
            <div className="flex-1 space-y-4">
              {filtered.length === 0 && apiHotels.length > 0 && (
                <div className="bg-card rounded-2xl p-12 text-center border border-border/50">
                  <Search className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-foreground">No hotels match your filters</p>
                  <p className="text-sm text-muted-foreground mt-2">Try adjusting your filters to see more results</p>
                  <Button variant="outline" className="mt-4 rounded-xl" onClick={clearFilters}>Clear Filters</Button>
                </div>
              )}

              {filtered.length === 0 && apiHotels.length === 0 && (
                <div className="bg-card rounded-2xl p-16 text-center border border-border/50">
                  <BedDouble className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-lg font-semibold text-foreground">No hotels found</p>
                  <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                    Try different dates or search for another destination
                  </p>
                </div>
              )}

              {paginatedHotels.map((hotel, i) => (
                <motion.div
                  key={`${hotel.source}-${hotel.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.6) }}
                  className="bg-card rounded-2xl overflow-hidden border border-border/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col md:flex-row"
                >
                  {/* Image */}
                  <div className="md:w-72 h-52 md:h-auto flex-shrink-0 relative overflow-hidden">
                    <img
                      src={hotel.image || "/placeholder.svg"}
                      alt={hotel.name}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    {hotel.stars > 0 && (
                      <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg flex items-center gap-1">
                        <Star className="w-3 h-3 fill-accent text-accent" />
                        <span className="text-xs font-semibold">{hotel.stars}-star</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-foreground leading-tight line-clamp-1">{hotel.name}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{hotel.city}{hotel.country && `, ${hotel.country}`}</span>
                          </p>
                        </div>
                        {hotel.rating > 0 && (
                          <div className="flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-xl ml-3 flex-shrink-0">
                            <Star className="w-4 h-4 fill-accent text-accent" />
                            <span className="text-sm font-bold text-foreground">{hotel.rating}</span>
                          </div>
                        )}
                      </div>

                      {hotel.propertyType && hotel.propertyType !== "HOTEL" && hotel.propertyType !== "Hotel" && (
                        <Badge variant="outline" className="text-[10px] mb-3">{hotel.propertyType}</Badge>
                      )}

                      {hotel.amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {hotel.amenities.slice(0, 4).map((a) => (
                            <span key={a} className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-lg">{a}</span>
                          ))}
                          {hotel.amenities.length > 4 && (
                            <span className="text-xs text-muted-foreground px-2 py-1">+{hotel.amenities.length - 4} more</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-end justify-between pt-4 mt-4 border-t border-border/30">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Starting from</p>
                        <span className="text-2xl font-bold text-primary">
                          {formatPrice(hotel.price, hotel.source === "tripjack" ? "tripjack" : "travelvela")}
                        </span>
                        <span className="text-sm text-muted-foreground"> / night</span>
                      </div>
                      <Button
                        className="rounded-xl gap-1.5"
                        onClick={() => {
                          trackHotelInteraction({
                            hotelId: hotel.id,
                            hotelName: hotel.name,
                            hotelCity: hotel.city,
                            hotelStars: hotel.stars,
                            action: "click",
                          });
                          const prefix = hotel.source === "tripjack" ? "tj-" : "tv-";
                          navigate(`/hotels/${prefix}${hotel.id}`, { state: { hotel, checkin, checkout, adults, children, rooms } });
                        }}
                      >
                        View Rooms
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-8 pb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1"
                    disabled={currentPage === 1}
                    onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 300, behavior: "smooth" }); }}
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                      .map((page, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showEllipsis = prev && page - prev > 1;
                        return (
                          <span key={page} className="flex items-center gap-1">
                            {showEllipsis && <span className="px-1 text-muted-foreground text-sm">…</span>}
                            <Button
                              variant={page === currentPage ? "default" : "outline"}
                              size="sm"
                              className="w-9 h-9 rounded-lg text-xs"
                              onClick={() => { setCurrentPage(page); window.scrollTo({ top: 300, behavior: "smooth" }); }}
                            >
                              {page}
                            </Button>
                          </span>
                        );
                      })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1"
                    disabled={currentPage === totalPages}
                    onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 300, behavior: "smooth" }); }}
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Hotels;
