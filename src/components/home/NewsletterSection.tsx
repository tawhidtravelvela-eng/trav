import { useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSiteContent } from "@/hooks/useSiteContent";

const NewsletterSection = () => {
  const [email, setEmail] = useState("");
  const { content } = useSiteContent();
  const cfg = content.newsletter;

  const heading = cfg.heading || "Get Exclusive Deals";
  const subtitle = cfg.subtitle || "Subscribe for curated offers and travel tips.";
  const buttonText = cfg.button_text || "Subscribe";
  const placeholder = cfg.placeholder || "Your email address";

  if (cfg.enabled === false) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      toast.success(cfg.success_message || "Thanks for subscribing!");
      setEmail("");
    }
  };

  return (
    <section className="py-10 sm:py-20 bg-hero-gradient">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-xl sm:text-3xl font-extrabold text-primary-foreground mb-2">
            {heading}
          </h2>
          <p className="text-primary-foreground/70 text-xs sm:text-sm mb-5 sm:mb-6">
            {subtitle}
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 max-w-md mx-auto">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-9 pr-4 py-2.5 sm:py-3 rounded-xl bg-primary-foreground/10 border border-primary-foreground/15 text-primary-foreground placeholder:text-primary-foreground/40 outline-none focus:border-primary-foreground/30 transition-colors text-xs sm:text-sm"
                required
              />
            </div>
            <Button type="submit" variant="secondary" className="rounded-xl font-bold h-10 sm:h-12 px-5 sm:px-6 text-xs sm:text-sm">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              {buttonText}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
