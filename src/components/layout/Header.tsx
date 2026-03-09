import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Plane, Hotel, Map, Menu, X, User, LogOut, Shield, PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";
import { useSiteBranding } from "@/hooks/useSiteBranding";

const navItems = [
  { label: "Flights", icon: Plane, href: "/flights" },
  { label: "Hotels", icon: Hotel, href: "/hotels" },
  { label: "Tours", icon: Map, href: "/tours" },
  { label: "Blog", icon: PenSquare, href: "/blog" },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const { branding, loading: brandingLoading } = useSiteBranding();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const siteName = branding.site_name || "Travel Vela";
  const nameParts = siteName.length > 5 ? [siteName.slice(0, -4), siteName.slice(-4)] : [siteName, ""];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-all duration-300 ${scrolled ? "bg-card shadow-lg shadow-foreground/5 border-border" : "bg-card/95 border-border/40 shadow-sm"}`}>
      <div className="container mx-auto px-4">
        <div className={`flex items-center justify-between transition-all duration-300 ${scrolled ? "h-14" : "h-16"}`}>
          <Link to="/" className="flex items-center gap-2 min-w-[120px]">
            {brandingLoading ? (
              <div className="w-9 h-9" />
            ) : (
              <>
                {branding.logo_url && (
                  <img src={branding.logo_url} alt={siteName} className="h-9 w-auto object-contain dark:block hidden" />
                )}
                <div className={`flex items-center gap-2 ${branding.logo_url ? 'dark:hidden' : ''}`}>
                  <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                    <Plane className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <span className="text-xl font-bold text-foreground">
                    {nameParts[0]}<span className="text-primary">{nameParts[1]}</span>
                  </span>
                </div>
              </>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-xs font-medium text-muted-foreground">
              {CURRENCIES[currency]?.symbol} {currency}
            </div>
            {user ? (
              <>
                {isAdmin && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/admin"><Shield className="w-4 h-4 mr-1" /> Admin</Link>
                  </Button>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/dashboard"><User className="w-4 h-4 mr-1" /> Dashboard</Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-1" /> Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/auth"><User className="w-4 h-4 mr-1" /> Sign In</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/auth">Register</Link>
                </Button>
              </>
            )}
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-foreground">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden bg-card border-t border-border"
          >
            <div className="px-4 py-4 space-y-2">
              {navItems.map((item) => (
                <Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted transition-colors">
                  <item.icon className="w-5 h-5 text-primary" /> {item.label}
                </Link>
              ))}
              <div className="pt-3 border-t border-border space-y-3">
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground">
                  {CURRENCIES[currency]?.symbol} {currency} — {CURRENCIES[currency]?.name}
                </div>
                {user ? (
                  <>
                    {isAdmin && (
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <Link to="/admin" onClick={() => setMobileOpen(false)}>Admin</Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => { handleSignOut(); setMobileOpen(false); }}>
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="flex-1" asChild>
                    <Link to="/auth" onClick={() => setMobileOpen(false)}>Sign In / Register</Link>
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
