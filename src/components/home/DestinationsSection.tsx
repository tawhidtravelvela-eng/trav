import { useState, useEffect } from "react";
import { Star, ArrowRight, MapPin, Plane } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { destinations as fallbackDestinations } from "@/data/mockData";
import { getImage } from "@/utils/images";
import { cn } from "@/lib/utils";

interface Destination {
  id: string | number;
  name: string;
  country: string;
  image: string | null;
  price: number;
  rating: number;
  flights: number;
}

const DestinationsSection = () => {
  const [hoveredId, setHoveredId] = useState<string | number | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>(fallbackDestinations as any);
  const { tenant } = useTenant();

  useEffect(() => {
    const fetchDestinations = async () => {
      let query = (supabase as any)
        .from("destinations")
        .select("id,name,country,image_url,price,rating,flights")
        .eq("is_active", true)
        .order("sort_order")
        .limit(6);

      if (tenant) {
        query = query.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
      } else {
        query = query.is("tenant_id", null);
      }

      const { data } = await query;
      if (data && data.length > 0) {
        setDestinations(data.map((d: any) => ({
          id: d.id,
          name: d.name,
          country: d.country,
          image: d.image_url,
          price: d.price,
          rating: d.rating,
          flights: d.flights,
        })));
      }
    };
    fetchDestinations();
  }, [tenant]);

  if (destinations.length === 0) return null;

  return (
    <section className="py-10 sm:py-20 bg-background overflow-hidden">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-end justify-between mb-6 sm:mb-10">
          <div>
            <div className="inline-flex items-center gap-2 text-primary text-[10px] sm:text-xs font-bold uppercase tracking-widest mb-1.5 sm:mb-2">
              <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Explore the World
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-foreground">Popular Destinations</h2>
          </div>
          <Link to="/tours" className="hidden md:flex items-center gap-1 text-primary font-semibold text-sm hover:gap-2 transition-all">
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Grid — 2 col on mobile, masonry on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-4">
          {destinations[0] && (
            <DestCard
              dest={destinations[0]}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              className="col-span-2 lg:col-span-7 aspect-[16/9] sm:aspect-[16/10] lg:aspect-auto lg:row-span-2"
              featured
            />
          )}
          {destinations[1] && (
            <DestCard
              dest={destinations[1]}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              className="col-span-1 lg:col-span-5 aspect-[3/4] lg:aspect-auto lg:row-span-2"
            />
          )}
          {destinations.slice(2, 5).map((dest) => (
            <DestCard
              key={dest.id}
              dest={dest}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              className="col-span-1 lg:col-span-4 aspect-[3/4] sm:aspect-[4/3]"
            />
          ))}
        </div>

        {/* Mobile "View All" */}
        <div className="mt-5 sm:mt-8 text-center md:hidden">
          <Link to="/tours" className="inline-flex items-center gap-1 text-primary font-semibold text-xs sm:text-sm">
            View All Destinations <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
};

interface DestCardProps {
  dest: Destination;
  hoveredId: string | number | null;
  setHoveredId: (id: string | number | null) => void;
  className?: string;
  featured?: boolean;
}

const DestCard = ({ dest, hoveredId, setHoveredId, className, featured }: DestCardProps) => {
  const isHovered = hoveredId === dest.id;
  const imgSrc = dest.image?.startsWith("http") ? dest.image : getImage(dest.image || "");

  return (
    <Link
      to="/tours"
      className={cn("group relative block rounded-xl sm:rounded-2xl lg:rounded-3xl overflow-hidden cursor-pointer", className)}
      onMouseEnter={() => setHoveredId(dest.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <img
        src={imgSrc}
        alt={dest.name}
        className={cn(
          "w-full h-full object-cover transition-all duration-[800ms] ease-out",
          isHovered ? "scale-110 brightness-110" : "scale-100 brightness-100"
        )}
        loading="lazy"
      />

      <div className={cn(
        "absolute inset-0 transition-all duration-500",
        isHovered
          ? "bg-gradient-to-t from-black/80 via-black/30 to-black/10"
          : "bg-gradient-to-t from-black/70 via-black/5 to-transparent"
      )} />

      {/* Top pills */}
      <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 text-[9px] sm:text-[11px] font-bold text-foreground shadow-lg">
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-accent text-accent" />
          {dest.rating}
        </div>
        {featured && (
          <div className="hidden sm:flex items-center gap-1 bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-[10px] font-bold shadow-lg uppercase tracking-wider">
            <Plane className="w-3 h-3" />
            {dest.flights} flights
          </div>
        )}
      </div>

      {/* Bottom content */}
      <div className={cn("absolute bottom-0 inset-x-0", featured ? "p-3 sm:p-5 lg:p-7" : "p-2.5 sm:p-4")}>
        <span className={cn(
          "inline-block text-accent font-bold uppercase tracking-widest mb-0.5 sm:mb-1",
          featured ? "text-[9px] sm:text-[11px]" : "text-[8px] sm:text-[9px]"
        )}>
          {dest.country}
        </span>

        <h3 className={cn(
          "font-extrabold text-white leading-tight",
          featured ? "text-lg sm:text-2xl lg:text-4xl" : "text-sm sm:text-base lg:text-xl"
        )}>
          {dest.name}
        </h3>

        <div className={cn(
          "flex items-center gap-2 sm:gap-3",
          featured ? "mt-1.5 sm:mt-3" : "mt-1"
        )}>
          <div className="flex items-baseline gap-0.5 sm:gap-1">
            <span className="text-white/50 text-[9px] sm:text-xs">from</span>
            <span className={cn("text-white font-extrabold", featured ? "text-lg sm:text-2xl" : "text-sm sm:text-lg")}>${dest.price}</span>
          </div>

          <div className={cn(
            "hidden sm:flex items-center gap-1 text-accent text-xs font-bold transition-all duration-500",
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3"
          )}>
            Explore <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <div className={cn(
        "absolute bottom-0 left-0 right-0 h-[2px] sm:h-[3px] bg-gradient-to-r from-primary via-accent to-primary transition-transform duration-500 origin-left",
        isHovered ? "scale-x-100" : "scale-x-0"
      )} />
    </Link>
  );
};

export default DestinationsSection;
