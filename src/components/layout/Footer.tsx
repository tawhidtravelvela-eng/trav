import { Link } from "react-router-dom";
import { Plane, Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube, Linkedin, ArrowRight } from "lucide-react";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { useFooterData } from "@/hooks/useFooterData";

const Footer = () => {
  const { branding } = useSiteBranding();
  const { footer, contact, social } = useFooterData();
  const siteName = branding.site_name || "Travel Vela";
  const nameParts = siteName.length > 5 ? [siteName.slice(0, -4), siteName.slice(-4)] : [siteName, ""];

  const description = footer.description || "Your trusted travel partner. Search, compare, and book flights at the best prices worldwide.";
  const quickLinks = (footer.quick_links || "Flights,Hotels,Tours,Blog").split(",").map((s: string) => s.trim()).filter(Boolean);
  const supportLinks = (footer.support_links || "Help Center,Cancellation Policy,Privacy Policy,Terms of Service").split(",").map((s: string) => s.trim()).filter(Boolean);
  const showSocial = footer.show_social_icons !== false;
  const showContact = footer.show_contact_info !== false;
  const copyrightText = footer.copyright_text || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;

  const email = contact.email || "support@travelvela.com";
  const phone = contact.phone || "+880 1234 567890";
  const address = contact.address || "Dhaka, Bangladesh";

  const socialLinks = [
    { icon: Facebook, url: social.facebook, label: "Facebook" },
    { icon: Twitter, url: social.twitter, label: "Twitter" },
    { icon: Instagram, url: social.instagram, label: "Instagram" },
    { icon: Youtube, url: social.youtube, label: "Youtube" },
    { icon: Linkedin, url: social.linkedin, label: "LinkedIn" },
  ].filter((s) => s.url);

  return (
    <footer className="relative bg-foreground text-background overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/8 rounded-full blur-3xl pointer-events-none" />

      {/* Top wave separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="container mx-auto px-4 pt-20 pb-8 relative z-10">
        {/* Main grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8">
          {/* Brand column */}
          <div className="lg:col-span-4">
            <Link to="/" className="flex items-center gap-2.5 mb-5 group">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={siteName} className="h-10 w-auto object-contain" />
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow">
                    <Plane className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <span className="text-2xl font-bold tracking-tight">
                    {nameParts[0]}<span className="text-primary">{nameParts[1]}</span>
                  </span>
                </>
              )}
              {/* Always show text name in footer for visibility */}
              {branding.logo_url && (
                <span className="text-2xl font-bold tracking-tight">
                  {nameParts[0]}<span className="text-primary">{nameParts[1]}</span>
                </span>
              )}
            </Link>
            <p className="text-background/50 text-sm leading-relaxed max-w-xs mb-6">
              {description}
            </p>
            {/* Social icons */}
            {showSocial && socialLinks.length > 0 && (
              <div className="flex items-center gap-3">
                {socialLinks.map(({ icon: Icon, url, label }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-lg bg-background/8 hover:bg-primary/20 hover:text-primary flex items-center justify-center transition-all duration-200"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            )}
            {/* Fallback social icons when no URLs configured */}
            {showSocial && socialLinks.length === 0 && (
              <div className="flex items-center gap-3">
                {[Facebook, Twitter, Instagram, Youtube].map((Icon, i) => (
                  <span
                    key={i}
                    className="w-9 h-9 rounded-lg bg-background/8 flex items-center justify-center opacity-50"
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="lg:col-span-2">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-background/70 mb-5">Explore</h4>
            <ul className="space-y-3">
              {quickLinks.map((item: string) => (
                <li key={item}>
                  <Link
                    to={`/${item.toLowerCase().replace(/\s+/g, "-")}`}
                    className="text-sm text-background/50 hover:text-primary flex items-center gap-1.5 group transition-colors"
                  >
                    <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                    <span>{item}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div className="lg:col-span-3">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-background/70 mb-5">Support</h4>
            <ul className="space-y-3">
              {supportLinks.map((item: string) => (
                <li key={item}>
                  <span className="text-sm text-background/50 hover:text-primary flex items-center gap-1.5 group cursor-pointer transition-colors">
                    <ArrowRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                    <span>{item}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          {showContact && (
            <div className="lg:col-span-3">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-background/70 mb-5">Get in Touch</h4>
              <ul className="space-y-4">
                <li>
                  <a href={`mailto:${email}`} className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm text-background/50 group-hover:text-background/80 transition-colors">{email}</span>
                  </a>
                </li>
                <li>
                  <a href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm text-background/50 group-hover:text-background/80 transition-colors">{phone}</span>
                  </a>
                </li>
                <li>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm text-background/50">{address}</span>
                  </div>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-6 border-t border-background/8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-background/30">
            {copyrightText}
          </p>
          <div className="flex items-center gap-6 text-xs text-background/30">
            <span className="hover:text-background/50 cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-background/50 cursor-pointer transition-colors">Terms</span>
            <span className="hover:text-background/50 cursor-pointer transition-colors">Cookies</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
