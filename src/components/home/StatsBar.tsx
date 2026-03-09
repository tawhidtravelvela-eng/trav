import { motion, useInView } from "framer-motion";
import { Users, Plane, MapPin, Award } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";

const iconMap: Record<string, any> = { Users, Plane, MapPin, Award };

const defaultStats = [
  { icon: "Users", value: 2000000, suffix: "+", label: "Happy Travelers" },
  { icon: "Plane", value: 15000, suffix: "+", label: "Flights Daily" },
  { icon: "MapPin", value: 500, suffix: "+", label: "Destinations" },
  { icon: "Award", value: 99, suffix: "%", label: "Satisfaction" },
];

function AnimatedNumber({ target, suffix }: { target: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [current, setCurrent] = useState("0");

  useEffect(() => {
    if (!isInView) return;
    const duration = 1200;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      if (target >= 1000000) setCurrent(Math.round(eased * (target / 1000000)) + "M");
      else if (target >= 1000) setCurrent(Math.round(eased * (target / 1000)) + "K");
      else setCurrent(String(Math.round(eased * target)));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, target]);

  return <span ref={ref}>{isInView ? current + suffix : "0"}</span>;
}

const StatsBar = () => {
  const { content } = useSiteContent();
  const statsData = content.stats;
  const stats = statsData.items?.length ? statsData.items : defaultStats;

  return (
    <section className="relative -mt-6 sm:-mt-8 z-20 pb-4">
      <div className="container mx-auto px-4">
        <div className="bg-card rounded-xl sm:rounded-2xl shadow-lg border border-border/50 grid grid-cols-2 lg:grid-cols-4 gap-0">
          {stats.map((s: any, i: number) => {
            const Icon = iconMap[s.icon] || Award;
            return (
              <div key={i} className="flex items-center gap-2.5 sm:gap-3 px-3 py-3.5 sm:px-6 sm:py-5 justify-center border-b lg:border-b-0 border-r border-border/20 last:border-r-0 [&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                </div>
                <div>
                  <p className="text-base sm:text-2xl font-extrabold text-foreground leading-none">
                    <AnimatedNumber target={Number(s.value)} suffix={s.suffix} />
                  </p>
                  <p className="text-[9px] sm:text-xs text-muted-foreground font-medium mt-0.5">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default StatsBar;
