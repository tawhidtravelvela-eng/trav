import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  sort_order: number;
}

const BannersSection = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const { tenant } = useTenant();

  useEffect(() => {
    let query = supabase
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    // Show items for current tenant OR global (null tenant_id)
    if (tenant) {
      query = query.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
    } else {
      query = query.is("tenant_id", null);
    }

    query.then(({ data }) => {
      if (data) setBanners(data);
    });
  }, [tenant]);

  if (banners.length === 0) return null;

  return (
    <section className="py-8 sm:py-12 bg-background">
      <div className="container mx-auto px-4">
        <Carousel
          opts={{ align: "center", loop: true }}
          className="w-full"
        >
          <CarouselContent>
            {banners.map((banner) => (
              <CarouselItem key={banner.id}>
                <a
                  href={banner.link_url || "#"}
                  target={banner.link_url ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="block"
                >
                  <div className="relative rounded-2xl overflow-hidden aspect-[21/9] sm:aspect-[3/1] bg-muted">
                    {banner.image_url ? (
                      <img
                        src={banner.image_url}
                        alt={banner.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-primary to-accent flex items-center justify-center">
                        <div className="text-center text-primary-foreground px-6">
                          <h3 className="text-lg sm:text-3xl font-extrabold mb-1">{banner.title}</h3>
                          {banner.subtitle && (
                            <p className="text-xs sm:text-base opacity-80">{banner.subtitle}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {banner.image_url && (
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent flex items-end p-4 sm:p-8">
                        <div className="text-primary-foreground">
                          <h3 className="text-sm sm:text-2xl font-bold">{banner.title}</h3>
                          {banner.subtitle && (
                            <p className="text-xs sm:text-sm opacity-90 mt-0.5">{banner.subtitle}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </a>
              </CarouselItem>
            ))}
          </CarouselContent>
          {banners.length > 1 && (
            <>
              <CarouselPrevious className="left-2 sm:left-4" />
              <CarouselNext className="right-2 sm:right-4" />
            </>
          )}
        </Carousel>
      </div>
    </section>
  );
};

export default BannersSection;
