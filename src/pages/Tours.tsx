import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Star, Clock, MapPin, Check, Loader2, Search, Users, CalendarDays, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { getImage } from "@/utils/images";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import TourLocationPicker from "@/components/home/TourLocationPicker";

interface Tour {
  id: string;
  productCode?: string;
  name: string;
  destination: string;
  duration: string;
  price: number;
  category: string;
  rating: number;
  image: string | null;
  highlights: string[];
  reviewCount?: number;
  source?: "local" | "viator";
  shortDescription?: string;
}

type SortOption = "recommended" | "price-low" | "price-high" | "rating" | "duration";

const Tours = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localTours, setLocalTours] = useState<Tour[]>([]);
  const [viatorTours, setViatorTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [viatorLoading, setViatorLoading] = useState(false);
  const [category, setCategory] = useState<"All" | "Domestic" | "International">("All");
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [travelDate, setTravelDate] = useState<Date | undefined>(() => {
    const d = searchParams.get("date");
    return d ? new Date(d + "T00:00:00") : undefined;
  });
  const [travelers, setTravelers] = useState(searchParams.get("travelers") || "2");
  const { formatPrice } = useCurrency();

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [selectedDurations, setSelectedDurations] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | "local" | "viator">("all");

  // Fetch local tours from DB
  useEffect(() => {
    const fetchTours = async () => {
      const { data } = await supabase.from("tours").select("*");
      setLocalTours(
        (data as any[])
          ?.filter((t) => t.is_active !== false)
          .map((t) => ({
            ...t,
            highlights: Array.isArray(t.highlights) ? t.highlights : [],
            source: "local" as const,
          })) || []
      );
      setLoading(false);
    };
    fetchTours();
  }, []);

  const searchViator = async (query: string) => {
    if (!query.trim()) {
      setViatorTours([]);
      return;
    }
    setViatorLoading(true);
    try {
      const { data: destData, error: destError } = await supabase.functions.invoke("viator-search", {
        body: { action: "destinations" },
      });

      if (destError) throw destError;

      const matchingDests = (destData?.destinations || [])
        .filter((d: any) => d.name?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 3);

      if (matchingDests.length === 0) {
        const { data, error } = await supabase.functions.invoke("viator-search", {
          body: { action: "freetext", searchText: query, limit: 20 },
        });

        if (error) throw error;

        if (data?.success) {
          setViatorTours(
            (data.products || []).map((t: any) => ({
              ...t,
              source: "viator" as const,
              highlights: (t.highlights || []).filter((h: any) => typeof h === "string" && isNaN(Number(h))),
            }))
          );
        } else {
          setViatorTours([]);
        }
        return;
      }

      const { data, error } = await supabase.functions.invoke("viator-search", {
        body: { action: "search", destinationId: matchingDests[0].destinationId, limit: 20 },
      });
      if (error) throw error;
      if (data?.success) {
        setViatorTours(
          (data.tours || []).map((t: any) => ({
            ...t,
            source: "viator" as const,
            highlights: (t.highlights || []).filter((h: any) => typeof h === "string" && isNaN(Number(h))),
          }))
        );
      }
    } catch (err) {
      console.error("Tour search error:", err);
    } finally {
      setViatorLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(searchQuery ? { q: searchQuery } : {});
    searchViator(searchQuery);
  };

  // Also search on initial load if query param exists
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setSearchQuery(q);
      searchViator(q);
    }
  }, []);

  const allTours = [...localTours, ...viatorTours];

  // Compute max price for slider
  const maxPrice = useMemo(() => {
    const prices = allTours.map((t) => t.price).filter((p) => p > 0);
    return prices.length > 0 ? Math.max(...prices) + 100 : 50000;
  }, [allTours]);

  // Extract unique duration buckets
  const durationBuckets = useMemo(() => {
    const durations = new Set<string>();
    allTours.forEach((t) => {
      if (t.duration) {
        const d = t.duration.toLowerCase();
        if (d.includes("1") && (d.includes("hour") || d.includes("hr"))) durations.add("1-3 hours");
        else if (d.includes("half") || d.includes("4") || d.includes("5") || d.includes("6")) durations.add("Half day");
        else if (d.includes("full") || d.includes("8") || d.includes("10") || d.includes("day") && !d.includes("2") && !d.includes("3")) durations.add("Full day");
        else if (d.includes("2") || d.includes("3") || d.includes("multi")) durations.add("Multi-day");
        else durations.add("Other");
      }
    });
    return Array.from(durations);
  }, [allTours]);

  const getDurationMinutes = (dur: string): number => {
    if (!dur) return 0;
    const d = dur.toLowerCase();
    const hourMatch = d.match(/(\d+)\s*(?:hour|hr)/);
    const dayMatch = d.match(/(\d+)\s*day/);
    const minMatch = d.match(/(\d+)\s*min/);
    if (dayMatch) return parseInt(dayMatch[1]) * 1440;
    if (hourMatch) return parseInt(hourMatch[1]) * 60;
    if (minMatch) return parseInt(minMatch[1]);
    return 0;
  };

  const matchesDurationFilter = (dur: string) => {
    if (selectedDurations.length === 0) return true;
    const d = dur?.toLowerCase() || "";
    return selectedDurations.some((bucket) => {
      switch (bucket) {
        case "1-3 hours": return d.includes("hour") || d.includes("hr");
        case "Half day": return d.includes("half") || (getDurationMinutes(dur) >= 180 && getDurationMinutes(dur) <= 420);
        case "Full day": return d.includes("full") || (getDurationMinutes(dur) >= 420 && getDurationMinutes(dur) <= 1440);
        case "Multi-day": return getDurationMinutes(dur) > 1440 || d.includes("multi") || (d.includes("day") && parseInt(d) > 1);
        default: return true;
      }
    });
  };

  const filtered = useMemo(() => {
    let result = allTours;

    // Category
    if (category !== "All") result = result.filter((t) => t.category === category);

    // Source
    if (sourceFilter !== "all") result = result.filter((t) => t.source === sourceFilter);

    // Price
    result = result.filter((t) => t.price >= priceRange[0] && (t.price <= priceRange[1] || t.price === 0));

    // Rating
    if (minRating > 0) result = result.filter((t) => t.rating >= minRating);

    // Duration
    if (selectedDurations.length > 0) result = result.filter((t) => matchesDurationFilter(t.duration));

    // Sort
    switch (sortBy) {
      case "price-low": result = [...result].sort((a, b) => a.price - b.price); break;
      case "price-high": result = [...result].sort((a, b) => b.price - a.price); break;
      case "rating": result = [...result].sort((a, b) => b.rating - a.rating); break;
      case "duration": result = [...result].sort((a, b) => getDurationMinutes(a.duration) - getDurationMinutes(b.duration)); break;
    }

    return result;
  }, [allTours, category, sourceFilter, priceRange, minRating, sortBy, selectedDurations]);

  const activeFilterCount = [
    priceRange[0] > 0 || priceRange[1] < maxPrice,
    minRating > 0,
    selectedDurations.length > 0,
    sourceFilter !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setPriceRange([0, maxPrice]);
    setMinRating(0);
    setSelectedDurations([]);
    setSourceFilter("all");
    setSortBy("recommended");
  };

  return (
    <Layout>
      <div className="bg-hero-gradient py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-primary-foreground mb-2">Tour Packages</h1>
          <p className="text-primary-foreground/80 mb-6">Curated travel experiences for every adventurer</p>

          <form onSubmit={handleSearch} className="bg-card/95 backdrop-blur rounded-2xl p-4 md:p-6 shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Destination */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Destination
                </label>
                <TourLocationPicker
                  value={searchQuery}
                  onSelect={setSearchQuery}
                  placeholder="Where do you want to go?"
                  variant="inline"
                />
              </div>

              {/* Travel Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> Travel Date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !travelDate && "text-muted-foreground"
                      )}
                    >
                      {travelDate ? format(travelDate, "PPP") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={travelDate}
                      onSelect={setTravelDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Travelers */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" /> Travelers
                </label>
                <Select value={travelers} onValueChange={setTravelers}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} {n === 1 ? "Traveler" : "Travelers"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search Button */}
              <div className="flex items-end">
                <Button type="submit" className="w-full gap-2" size="lg">
                  <Search className="w-4 h-4" /> Search Tours
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {/* Filter bar */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex gap-2 flex-wrap items-center">
            {(["All", "Domestic", "International"] as const).map((cat) => (
              <Button
                key={cat}
                variant={category === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setCategory(cat)}
              >
                {cat}
              </Button>
            ))}
            {filtered.length > 0 && (
              <Badge variant="secondary" className="self-center">
                {filtered.length} tour{filtered.length !== 1 ? "s" : ""} found
              </Badge>
            )}
          </div>

          <div className="flex gap-2 items-center">
            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter toggle */}
            <Button
              variant={showFilters ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-primary-foreground text-primary text-xs flex items-center justify-center font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs text-muted-foreground">
                <X className="w-3 h-3" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* Expandable filter panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-card border border-border rounded-xl p-5 mb-6"
          >
            <div className="grid grid-cols-3 gap-6">
              {/* Price Range - Left */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Price Range</h4>
                <div className="px-1">
                  <Slider
                    min={0}
                    max={maxPrice}
                    step={100}
                    value={priceRange}
                    onValueChange={(v) => setPriceRange(v as [number, number])}
                    className="mt-2"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{formatPrice(priceRange[0])}</span>
                  <span>{formatPrice(priceRange[1])}</span>
                </div>
              </div>

              {/* Rating - Center */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Minimum Rating</h4>
                <div className="flex gap-1.5 flex-nowrap">
                  {[0, 3, 3.5, 4, 4.5].map((r) => (
                    <Button
                      key={r}
                      variant={minRating === r ? "default" : "outline"}
                      size="sm"
                      className="text-xs px-2 h-8 whitespace-nowrap"
                      onClick={() => setMinRating(r)}
                    >
                      {r === 0 ? "Any" : (
                        <span className="flex items-center gap-0.5">
                          {r}+ <Star className="w-3 h-3 fill-current" />
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Duration - Right */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Duration</h4>
                <div className="flex flex-wrap gap-2">
                  {["1-3 hours", "Half day", "Full day", "Multi-day"].map((d) => (
                    <label key={d} className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={selectedDurations.includes(d)}
                        onCheckedChange={(checked) => {
                          setSelectedDurations((prev) =>
                            checked ? [...prev, d] : prev.filter((x) => x !== d)
                          );
                        }}
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {loading || viatorLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((tour, i) => (
              <motion.div
                key={tour.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-card rounded-xl overflow-hidden card-hover group"
              >
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={tour.image || getImage("")}
                    alt={tour.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => { (e.target as HTMLImageElement).src = getImage(""); }}
                  />
                  <div className="absolute top-3 left-3">
                    <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                      {tour.category}
                    </span>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold text-foreground line-clamp-2 mb-2">{tour.name}</h3>
                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-accent text-accent" />
                      <span className="font-medium text-foreground">{tour.rating}</span>
                      {tour.reviewCount ? (
                        <span className="text-xs text-muted-foreground">({tour.reviewCount})</span>
                      ) : null}
                    </div>
                    {tour.destination && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {tour.destination}
                      </span>
                    )}
                    {tour.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {tour.duration}
                      </span>
                    )}
                  </div>
                  {tour.shortDescription && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{tour.shortDescription}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {tour.highlights.slice(0, 3).map((h) => (
                      <span key={h} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="w-3 h-3 text-primary" /> {h}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-end justify-between pt-3 border-t border-border">
                    <div>
                      <span className="text-xs text-muted-foreground">From </span>
                      <span className="text-2xl font-bold text-primary">{formatPrice(tour.price)}</span>
                      <span className="text-sm text-muted-foreground"> / person</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        tour.source === "viator"
                          ? navigate(`/tours/viator/${tour.productCode}`)
                          : navigate(`/tours/${tour.id}`)
                      }
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {!loading && !viatorLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No tours found. Try adjusting your filters or search for a destination.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Tours;
