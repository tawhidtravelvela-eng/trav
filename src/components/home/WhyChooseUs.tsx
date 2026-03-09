import { motion } from "framer-motion";
import { ShieldCheck, Headphones, Wallet, Clock, Sparkles, Globe } from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";

const iconMap: Record<string, any> = { Wallet, ShieldCheck, Headphones, Clock, Sparkles, Globe };

const defaultFeatures = [
  { icon: "Wallet", title: "Best Price Guarantee", desc: "We match or beat any competitor's price — no questions asked.", accent: "from-primary to-[hsl(213,80%,55%)]" },
  { icon: "ShieldCheck", title: "Secure Booking", desc: "Industry-grade encryption keeps your data safe at every step.", accent: "from-[hsl(152,70%,42%)] to-[hsl(160,60%,35%)]" },
  { icon: "Headphones", title: "24/7 Support", desc: "Our global team is always ready to help, any time zone.", accent: "from-accent to-[hsl(30,90%,48%)]" },
  { icon: "Clock", title: "Instant Confirmation", desc: "Get instant e-tickets and booking confirmations in seconds.", accent: "from-[hsl(280,70%,50%)] to-[hsl(300,60%,55%)]" },
  { icon: "Sparkles", title: "Handpicked Deals", desc: "Curated offers from 500+ airlines and 100K+ hotels worldwide.", accent: "from-primary to-accent" },
  { icon: "Globe", title: "Global Coverage", desc: "Flights, hotels & tours across 190+ countries at your fingertips.", accent: "from-[hsl(180,60%,40%)] to-[hsl(200,70%,50%)]" },
];

const defaultAccents = [
  "from-primary to-[hsl(213,80%,55%)]",
  "from-[hsl(152,70%,42%)] to-[hsl(160,60%,35%)]",
  "from-accent to-[hsl(30,90%,48%)]",
  "from-[hsl(280,70%,50%)] to-[hsl(300,60%,55%)]",
  "from-primary to-accent",
  "from-[hsl(180,60%,40%)] to-[hsl(200,70%,50%)]",
];

const WhyChooseUs = () => {
  const { content } = useSiteContent();
  const cfg = content.features;
  const features = cfg.items?.length ? cfg.items : defaultFeatures;
  const heading = cfg.heading || "Trusted by <span class=\"text-gradient\">Millions</span> of Travelers";
  const subtitle = cfg.subtitle || "Here's why travelers choose us over the rest";
  const badge = cfg.badge || "Why Choose Us";

  if (cfg.enabled === false) return null;

  return (
    <section className="py-16 sm:py-24 bg-muted/30 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, hsl(213 90% 46% / 0.08) 0%, transparent 50%), radial-gradient(circle at 80% 50%, hsl(25 95% 55% / 0.06) 0%, transparent 50%)' }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10 sm:mb-14"
        >
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest mb-3">
            <ShieldCheck className="w-3 h-3" />
            {badge}
          </span>
          <h2
            className="text-2xl sm:text-4xl font-extrabold text-foreground"
            dangerouslySetInnerHTML={{ __html: heading }}
          />
          <p className="text-muted-foreground text-sm mt-2">{subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {features.map((f: any, i: number) => {
            const Icon = iconMap[f.icon] || ShieldCheck;
            const accent = f.accent || defaultAccents[i % defaultAccents.length];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group bg-card border border-border/50 rounded-2xl p-6 sm:p-7 hover:border-primary/20 transition-all duration-300 relative overflow-hidden"
                style={{ boxShadow: 'var(--card-shadow)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--card-shadow-hover)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--card-shadow)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
              >
                <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br ${accent} opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-2xl`} />
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
                  <Icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-foreground mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default WhyChooseUs;
