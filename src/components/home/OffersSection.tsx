import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Percent, Hotel, Map, Plane, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenant } from "@/hooks/useTenant";

const iconMap: Record<number, React.ElementType> = {
  0: Percent,
  1: Hotel,
  2: Map,
  3: Plane,
};

const OffersSection = () => {
  const [offers, setOffers] = useState<{ id: string; title: string; discount: string; description: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const { tenant } = useTenant();

  useEffect(() => {
    let query = supabase
      .from("offers")
      .select("*")
      .eq("is_active", true)
      .order("created_at");

    if (tenant) {
      query = query.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
    } else {
      query = query.is("tenant_id", null);
    }

    query.then(({ data }) => {
        if (data && data.length > 0) {
          setOffers(data.map(o => ({
            id: o.id,
            title: o.title,
            discount: o.discount || "",
            description: o.description || "",
            color: o.color,
          })));
        }
        setLoading(false);
      });
  }, []);

  if (loading) return null;
  if (offers.length === 0) return null;

  return (
    <section className="py-10 sm:py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-3xl font-extrabold text-foreground">Special Offers</h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Exclusive deals you don't want to miss</p>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 sm:pb-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 snap-x snap-mandatory scrollbar-hide">
          {offers.map((offer, i) => {
            const Icon = iconMap[i % Object.keys(iconMap).length] || Percent;
            return (
              <Link
                key={offer.id}
                to="/flights"
                className="group relative rounded-xl sm:rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/40 bg-card p-4 sm:p-6 flex flex-col justify-between min-h-[140px] sm:min-h-[160px] min-w-[220px] sm:min-w-0 snap-start flex-shrink-0 sm:flex-shrink transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base sm:text-xl font-extrabold text-foreground">
                      {offer.discount || offer.title}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      {offer.description}
                    </p>
                  </div>
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  </div>
                </div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-primary border border-primary/30 rounded-lg px-3 sm:px-4 py-1 sm:py-1.5 w-fit group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  Claim All
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default OffersSection;
