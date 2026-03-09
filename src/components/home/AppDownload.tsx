import { motion } from "framer-motion";
import { Smartphone, Star, Download, CheckCircle2, Sparkles } from "lucide-react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { useSiteBranding } from "@/hooks/useSiteBranding";

const defaultPerks = [
  "Exclusive app-only deals & flash sales",
  "Real-time flight tracking & gate alerts",
  "Offline access to all your bookings",
  "Instant price drop notifications",
];

const AppDownload = () => {
  const { content } = useSiteContent();
  const { branding } = useSiteBranding();
  const cfg = content.app_download;

  if (cfg.enabled === false) return null;

  const appName = cfg.app_name || branding.site_name || "TravelVela";
  const tagline = cfg.tagline || "Your travel companion";
  const heading = cfg.heading || "Travel Smarter";
  const headingAccent = cfg.heading_accent || "With Our App";
  const description = cfg.description || "Get exclusive app-only deals, manage bookings on the go, and receive real-time alerts — all from your pocket.";
  const perks = cfg.perks?.length ? cfg.perks : defaultPerks;
  const appStoreUrl = cfg.app_store_url || "#";
  const playStoreUrl = cfg.play_store_url || "#";
  const rating = cfg.rating || "4.9";
  const reviewCount = cfg.review_count || "50K+";

  return (
    <section className="py-16 sm:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(213,90%,25%)] via-[hsl(213,85%,35%)] to-[hsl(220,80%,22%)]" />
      <div className="absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, hsl(25 95% 55% / 0.08) 0%, transparent 50%), radial-gradient(circle at 70% 70%, hsl(213 90% 55% / 0.1) 0%, transparent 50%)' }}
      />
      <div className="absolute top-10 right-10 w-72 h-72 border border-primary-foreground/5 rounded-full" />
      <div className="absolute top-10 right-10 w-96 h-96 border border-primary-foreground/3 rounded-full" />
      <div className="absolute -bottom-20 -left-20 w-96 h-96 border border-primary-foreground/5 rounded-full" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          <motion.div
            initial={{ opacity: 0, x: -50, rotate: -5 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, type: "spring" }}
            className="relative flex-shrink-0"
          >
            <div className="w-60 h-[440px] sm:w-68 sm:h-[500px] rounded-[2.5rem] border-2 border-primary-foreground/15 flex flex-col items-center justify-center p-6 relative overflow-hidden"
              style={{ background: 'linear-gradient(160deg, hsl(0 0% 100% / 0.12), hsl(0 0% 100% / 0.04))', backdropFilter: 'blur(10px)' }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-[hsl(213,85%,30%)] rounded-b-2xl" />
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-5 shadow-xl shadow-primary/30">
                <Sparkles className="w-10 h-10 text-primary-foreground" />
              </div>
              <p className="text-primary-foreground font-extrabold text-xl text-center">{appName}</p>
              <p className="text-primary-foreground/50 text-xs text-center mt-1 font-medium">{tagline}</p>
              <div className="flex items-center gap-1 mt-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-accent text-accent" />
                ))}
                <span className="text-primary-foreground/60 text-xs ml-1.5 font-bold">{rating}</span>
              </div>
              <p className="text-primary-foreground/40 text-[10px] mt-2">{reviewCount} Reviews</p>
            </div>
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -right-6 top-20 glass rounded-xl px-3 py-2.5 max-w-[160px]"
            >
              <p className="text-primary-foreground text-[10px] font-bold">🔥 Price Drop!</p>
              <p className="text-primary-foreground/60 text-[9px]">JFK → LHR now $289</p>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-center lg:text-left"
          >
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent/20 text-accent text-xs font-bold uppercase tracking-widest mb-5">
              <Download className="w-3 h-3" />
              Download Our App
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-primary-foreground leading-[1.1] mb-4">
              {heading}<br />
              <span className="text-accent">{headingAccent}</span>
            </h2>
            <p className="text-primary-foreground/60 text-sm sm:text-base max-w-md mb-8 mx-auto lg:mx-0 leading-relaxed">
              {description}
            </p>

            <ul className="space-y-3 mb-10 text-left inline-block">
              {perks.map((p: string, i: number) => (
                <li key={i} className="flex items-center gap-3 text-sm text-primary-foreground/85 font-medium">
                  <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  </div>
                  {p}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-primary-foreground/10 hover:bg-primary-foreground/15 border border-primary-foreground/15 rounded-2xl px-6 py-3.5 transition-all duration-200 hover:scale-[1.02] group">
                <Download className="w-6 h-6 text-primary-foreground group-hover:text-accent transition-colors" />
                <div className="text-left">
                  <p className="text-[10px] text-primary-foreground/50 leading-none uppercase tracking-wider font-semibold">Download on</p>
                  <p className="text-base font-bold text-primary-foreground leading-tight">App Store</p>
                </div>
              </a>
              <a href={playStoreUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-primary-foreground/10 hover:bg-primary-foreground/15 border border-primary-foreground/15 rounded-2xl px-6 py-3.5 transition-all duration-200 hover:scale-[1.02] group">
                <Download className="w-6 h-6 text-primary-foreground group-hover:text-accent transition-colors" />
                <div className="text-left">
                  <p className="text-[10px] text-primary-foreground/50 leading-none uppercase tracking-wider font-semibold">Get it on</p>
                  <p className="text-base font-bold text-primary-foreground leading-tight">Google Play</p>
                </div>
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default AppDownload;
