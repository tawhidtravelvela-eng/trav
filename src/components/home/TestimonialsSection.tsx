import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

interface Testimonial {
  id: string;
  name: string;
  role: string | null;
  text: string;
  avatar: string | null;
  rating: number;
}

const fallbackTestimonials: Testimonial[] = [
  { id: "1", name: "Sarah Johnson", role: "Frequent Traveler", text: "Amazing service! Found the best deals on flights and the booking process was seamless.", avatar: null, rating: 5 },
  { id: "2", name: "Michael Chen", role: "Business Traveler", text: "Best travel platform I've used. The price comparison feature saved me hundreds on my business trips.", avatar: null, rating: 5 },
  { id: "3", name: "Emma Williams", role: "Adventure Seeker", text: "From budget flights to luxury hotels, they have everything. Their customer support is exceptional!", avatar: null, rating: 5 },
];

const TestimonialsSection = () => {
  const [active, setActive] = useState(0);
  const [testimonials, setTestimonials] = useState<Testimonial[]>(fallbackTestimonials);
  const { tenant } = useTenant();

  useEffect(() => {
    let query = supabase
      .from("testimonials")
      .select("id,name,role,text,avatar,rating")
      .eq("is_active", true)
      .order("created_at");

    if (tenant) {
      query = query.or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
    } else {
      query = query.is("tenant_id", null);
    }

    query.then(({ data }) => {
      if (data && data.length > 0) setTestimonials(data);
    });
  }, [tenant]);

  const prev = () => setActive((p) => (p === 0 ? testimonials.length - 1 : p - 1));
  const next = () => setActive((p) => (p === testimonials.length - 1 ? 0 : p + 1));

  const t = testimonials[active];
  if (!t) return null;

  const initials = t.avatar || t.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <section className="py-10 sm:py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-3xl font-extrabold text-foreground">What Travelers Say</h2>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Real experiences from our community</p>
        </div>

        {/* Mobile: single card carousel */}
        <div className="sm:hidden">
          <div className="bg-card rounded-2xl p-5 border border-border/50 shadow-sm relative">
            <Quote className="w-6 h-6 text-primary/15 mb-3" />
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: t.rating }).map((_, j) => (
                <Star key={j} className="w-3.5 h-3.5 fill-accent text-accent" />
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 min-h-[60px]">"{t.text}"</p>
            <div className="flex items-center gap-3 pt-3 border-t border-border/40">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                {initials}
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </div>
          </div>

          {/* Navigation dots + arrows */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <button onClick={prev} className="w-8 h-8 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-1.5">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-primary" : "w-1.5 bg-border"}`}
                />
              ))}
            </div>
            <button onClick={next} className="w-8 h-8 rounded-full border border-border/60 flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Desktop: grid */}
        <div className="hidden sm:grid sm:grid-cols-3 sm:gap-4 max-w-5xl mx-auto">
          {testimonials.map((item) => {
            const init = item.avatar || item.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div
                key={item.id}
                className="bg-card rounded-2xl p-6 border border-border/50 card-hover"
              >
                <Quote className="w-7 h-7 text-primary/20 mb-3" />
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: item.rating }).map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{item.text}"</p>
                <div className="flex items-center gap-3 pt-3 border-t border-border/40">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    {init}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
