import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard, CalendarCheck, User, XCircle, Download, Plane, Building2, Map,
  Heart, Headphones, UserCircle, Edit, Menu, TrendingUp, CreditCard, Clock,
  ChevronRight, MapPin, Star, ArrowRight, Wallet, RefreshCw, RotateCcw, Globe
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";
import { useCurrency, CURRENCIES } from "@/contexts/CurrencyContext";
import TicketRequestDialog from "@/components/dashboard/TicketRequestDialog";
import TicketRequestsList from "@/components/dashboard/TicketRequestsList";
import WalletSection from "@/components/dashboard/WalletSection";
import B2BAccessRequests from "@/components/dashboard/B2BAccessRequests";

type Booking = Tables<"bookings">;

const statusColors: Record<string, string> = {
  Paid: "bg-primary/10 text-primary border border-primary/20",
  Pending: "bg-warning/10 text-warning border border-warning/20",
  Confirmed: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border border-[hsl(var(--success))]/20",
  Cancelled: "bg-destructive/10 text-destructive border border-destructive/20",
  "Needs Payment": "bg-orange-500/10 text-orange-600 border border-orange-200",
  "Awaiting Payment": "bg-amber-500/10 text-amber-600 border border-amber-200",
};

const statusLabels: Record<string, string> = {
  Pending: "Payment Pending",
  Paid: "Awaiting Confirmation",
  Confirmed: "Confirmed",
  Cancelled: "Cancelled",
  "Needs Payment": "Needs Payment",
  "Awaiting Payment": "Awaiting Payment",
};

const typeIcons: Record<string, typeof Plane> = {
  Flight: Plane,
  Hotel: Building2,
  Tour: Map,
};

type ActivePage = "dashboard" | "all-bookings" | "flight-bookings" | "hotel-bookings" | "tour-bookings" | "favourites" | "profile" | "support" | "requests" | "wallet" | "b2b-access";

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ticketRequestBooking, setTicketRequestBooking] = useState<{ id: string; booking_id: string; title: string; type: string } | null>(null);
  const [requestRefreshKey, setRequestRefreshKey] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);

  const [profile, setProfile] = useState({ full_name: "", email: "", created_at: "", user_type: "b2c", billing_currency: "USD" });
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    // If auth context is still bootstrapping and we don't yet have a user, wait.
    if (authLoading && !user) return;

    if (!user) {
      setLoading(false);
      navigate("/auth");
      return;
    }

    refreshData();
  }, [authLoading, user, navigate]);

  const fetchData = async (userId: string) => {
    setLoading(true);
    try {
      const [bookingsRes, profileRes, walletRes] = await Promise.all([
        supabase.from("bookings").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("wallet_transactions" as any).select("amount, type").eq("user_id", userId),
      ]);
      setBookings(bookingsRes.data || []);
      if (profileRes.data) {
        setProfile({
          full_name: profileRes.data.full_name || "",
          email: profileRes.data.email || "",
          created_at: profileRes.data.created_at || "",
          user_type: (profileRes.data as any).user_type || "b2c",
          billing_currency: (profileRes.data as any).billing_currency || "USD",
        });
      }
      const txns = (walletRes.data || []) as any[];
      const balance = txns.reduce((sum: number, t: any) => sum + (t.type === "credit" ? Number(t.amount) : -Number(t.amount)), 0);
      setWalletBalance(balance);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      toast.error("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const refreshData = () => {
    if (!user) return;
    void fetchData(user.id);
  };

  const cancelBooking = async () => {
    if (!cancelId) return;
    const { error } = await supabase.from("bookings").update({ status: "Cancelled" }).eq("id", cancelId);
    if (error) { toast.error(error.message); return; }
    toast.success("Booking cancelled");
    setCancelId(null);
    refreshData();
  };

  const updateProfile = async () => {
    setProfileLoading(true);
    const { error } = await supabase.from("profiles").update({ full_name: profile.full_name } as any).eq("user_id", user!.id);
    setProfileLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
  };

  const downloadInvoice = (booking: Booking) => {
    window.open(`/booking/ticket/${booking.id}`, "_blank");
  };

  if ((authLoading && !user) || loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your dashboard…</p>
        </div>
      </Layout>
    );
  }

  const totalTrips = bookings.filter(b => b.status === "Paid" || b.status === "Confirmed").length;
  const totalSpent = bookings.filter(b => b.status !== "Cancelled").reduce((sum, b) => sum + Number(b.total), 0);
  const pendingCount = bookings.filter(b => b.status === "Pending").length;
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "N/A";

  const getFilteredBookings = () => {
    switch (activePage) {
      case "flight-bookings": return bookings.filter(b => b.type === "Flight");
      case "hotel-bookings": return bookings.filter(b => b.type === "Hotel");
      case "tour-bookings": return bookings.filter(b => b.type === "Tour");
      default: return bookings;
    }
  };

  const handleNavClick = (page: ActivePage) => {
    setActivePage(page);
    setMobileOpen(false);
  };

  const initials = profile.full_name
    ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : (profile.email?.[0] || "U").toUpperCase();

  // --- Sidebar nav items ---
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, page: "dashboard" as ActivePage },
    { id: "all-bookings", label: "All Bookings", icon: CalendarCheck, page: "all-bookings" as ActivePage },
    { id: "flight-bookings", label: "Flights", icon: Plane, page: "flight-bookings" as ActivePage },
    { id: "hotel-bookings", label: "Hotels", icon: Building2, page: "hotel-bookings" as ActivePage },
    { id: "tour-bookings", label: "Tours", icon: Map, page: "tour-bookings" as ActivePage },
    { id: "requests", label: "Reissue / Refund", icon: RefreshCw, page: "requests" as ActivePage },
    { id: "wallet", label: "Wallet", icon: Wallet, page: "wallet" as ActivePage },
    ...(profile.user_type === "b2b_agent" ? [{ id: "b2b-access", label: "Access Requests", icon: Globe, page: "b2b-access" as ActivePage }] : []),
    { id: "favourites", label: "Favourites", icon: Heart, page: "favourites" as ActivePage },
    { id: "profile", label: "Profile", icon: UserCircle, page: "profile" as ActivePage },
    { id: "support", label: "Support", icon: Headphones, page: "support" as ActivePage },
  ];

  // --- Stats cards data ---
  const statsCards = [
    {
      label: "Total Bookings",
      value: bookings.length.toString(),
      icon: CalendarCheck,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Spent",
      value: formatPrice(totalSpent),
      icon: CreditCard,
      color: "text-[hsl(var(--success))]",
      bg: "bg-[hsl(var(--success))]/10",
    },
    {
      label: "Active Trips",
      value: totalTrips.toString(),
      icon: TrendingUp,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Pending",
      value: pendingCount.toString(),
      icon: Clock,
      color: "text-[hsl(var(--warning))]",
      bg: "bg-[hsl(var(--warning))]/10",
    },
  ];

  // --- Sidebar rendering ---
  const renderSidebar = () => (
    <div className="flex flex-col h-full">
      {/* User profile card */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold text-lg shadow-md">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground truncate">{profile.full_name || "Traveler"}</p>
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Star className="w-3.5 h-3.5 text-accent" />
          <span>Member since {memberSince}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activePage === item.page;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
            </button>
          );
        })}
      </nav>

      {/* Wallet card */}
      <div className="p-3 border-t border-border">
        <div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Wallet Balance</span>
          </div>
          <p className="text-xl font-bold text-foreground">{formatPrice(walletBalance)}</p>
        </div>
      </div>
    </div>
  );

  // --- Dashboard home view ---
  const renderDashboardHome = () => {
    const recentBookings = bookings.slice(0, 5);
    return (
      <>
        {/* Welcome banner */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-6 md:p-8 text-primary-foreground mb-6 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary-foreground/5 rounded-full -translate-y-1/2 translate-x-1/4" />
          <div className="absolute bottom-0 left-1/2 w-32 h-32 bg-primary-foreground/5 rounded-full translate-y-1/2" />
          <div className="relative z-10">
            <h1 className="text-2xl md:text-3xl font-bold mb-1">
              Welcome back, {profile.full_name?.split(" ")[0] || "Traveler"}! 👋
            </h1>
            <p className="text-primary-foreground/80 text-sm md:text-base">
              Here's an overview of your travel activity and upcoming trips.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              <Button
                size="sm"
                variant="secondary"
                className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0 backdrop-blur-sm"
                onClick={() => navigate("/flights")}
              >
                <Plane className="w-4 h-4 mr-1" /> Book a Flight
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-0 backdrop-blur-sm"
                onClick={() => navigate("/hotels")}
              >
                <Building2 className="w-4 h-4 mr-1" /> Find Hotels
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          {statsCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card className="hover:shadow-md transition-shadow border-border/50">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Recent bookings */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Recent Bookings</CardTitle>
                {bookings.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary text-xs gap-1"
                    onClick={() => setActivePage("all-bookings")}
                  >
                    View All <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentBookings.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <MapPin className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1">No trips yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Start exploring and book your first trip!</p>
                  <Button size="sm" onClick={() => navigate("/flights")}>
                    <Plane className="w-4 h-4 mr-1" /> Search Flights
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentBookings.map((b) => {
                    const Icon = typeIcons[b.type] || CalendarCheck;
                    return (
                      <div key={b.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{b.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.booking_id} · {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-foreground">{formatPrice(b.total)}</p>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-1 ${statusColors[b.status] || ""}`}>
                            {statusLabels[b.status] || b.status}
                          </Badge>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="View Ticket" onClick={() => downloadInvoice(b)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          {b.status === "Needs Payment" && (
                            <Button size="sm" variant="default" className="h-8 text-xs bg-orange-500 hover:bg-orange-600" title="Pay Now" onClick={() => navigate(`/booking/pay/${b.id}`)}>
                              <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay Now
                            </Button>
                          )}
                          {b.type === "Flight" && (b.status === "Confirmed" || b.status === "Paid") && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary" title="Reissue / Refund" onClick={() => setTicketRequestBooking({ id: b.id, booking_id: b.booking_id, title: b.title, type: b.type })}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          {b.status !== "Cancelled" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Cancel" onClick={() => setCancelId(b.id)}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </>
    );
  };

  // --- Bookings list view ---
  const renderBookingsList = () => {
    const filtered = getFilteredBookings();
    const pageTitle = activePage === "all-bookings" ? "All Bookings" : activePage === "flight-bookings" ? "Flight Bookings" : activePage === "hotel-bookings" ? "Hotel Bookings" : "Tour Bookings";

    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={activePage}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-bold text-foreground">{pageTitle}</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} booking{filtered.length !== 1 ? "s" : ""} found</p>
          </div>
          <Tabs
            value={activePage}
            onValueChange={(v) => setActivePage(v as ActivePage)}
            className="w-auto"
          >
            <TabsList className="h-9">
              <TabsTrigger value="all-bookings" className="text-xs px-3">All</TabsTrigger>
              <TabsTrigger value="flight-bookings" className="text-xs px-3">Flights</TabsTrigger>
              <TabsTrigger value="hotel-bookings" className="text-xs px-3">Hotels</TabsTrigger>
              <TabsTrigger value="tour-bookings" className="text-xs px-3">Tours</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <CalendarCheck className="w-8 h-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">No bookings found</h3>
                <p className="text-sm text-muted-foreground">No records match this filter.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">Booking</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">Type</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">Status</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">Amount</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider">Date</TableHead>
                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((b) => {
                        const Icon = typeIcons[b.type] || CalendarCheck;
                        return (
                          <TableRow key={b.id} className="hover:bg-muted/20">
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm text-foreground truncate max-w-[200px]">{b.title}</p>
                                <p className="font-mono text-xs text-muted-foreground">{b.booking_id}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                                  <Icon className="w-3.5 h-3.5 text-primary" />
                                </div>
                                <span className="text-sm">{b.type}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${statusColors[b.status] || ""}`}>
                                {statusLabels[b.status] || b.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold text-sm">{formatPrice(b.total)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button size="icon" variant="ghost" className="h-8 w-8" title="Download" onClick={() => downloadInvoice(b)}>
                                  <Download className="h-4 w-4" />
                                </Button>
                                {b.status === "Needs Payment" && (
                                  <Button size="sm" variant="default" className="h-8 text-xs bg-orange-500 hover:bg-orange-600" onClick={() => navigate(`/booking/pay/${b.id}`)}>
                                    <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay
                                  </Button>
                                )}
                                {b.status !== "Cancelled" && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Cancel" onClick={() => setCancelId(b.id)}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-border">
                  {filtered.map((b) => {
                    const Icon = typeIcons[b.type] || CalendarCheck;
                    return (
                      <div key={b.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{b.title}</p>
                            <p className="text-xs text-muted-foreground font-mono">{b.booking_id}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className={`text-[10px] ${statusColors[b.status] || ""}`}>
                                {statusLabels[b.status] || b.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-foreground">{formatPrice(b.total)}</p>
                            <div className="flex gap-1 mt-1 justify-end">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadInvoice(b)}>
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {b.status === "Needs Payment" && (
                                <Button size="sm" variant="default" className="h-7 text-[10px] bg-orange-500 hover:bg-orange-600 px-2" onClick={() => navigate(`/booking/pay/${b.id}`)}>
                                  Pay
                                </Button>
                              )}
                              {b.status !== "Cancelled" && (
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setCancelId(b.id)}>
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // --- Profile view ---
  const renderProfile = () => (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-bold text-foreground mb-1">Profile Settings</h2>
      <p className="text-sm text-muted-foreground mb-6">Manage your personal information</p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Personal Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Email Address</Label>
              <Input value={profile.email} disabled className="bg-muted/50 mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input
                value={profile.full_name}
                onChange={(e) => setProfile(p => ({ ...p, full_name: e.target.value }))}
                className="mt-1"
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Billing Currency</Label>
              <div className="mt-1 px-3 py-2 rounded-md bg-muted text-sm text-muted-foreground">
                {CURRENCIES[profile.billing_currency as keyof typeof CURRENCIES]?.symbol} {profile.billing_currency} — {CURRENCIES[profile.billing_currency as keyof typeof CURRENCIES]?.name || profile.billing_currency}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Contact admin to change your billing currency</p>
            </div>
            <Button onClick={updateProfile} disabled={profileLoading} className="w-full">
              <Edit className="w-4 h-4 mr-1" />
              {profileLoading ? "Saving…" : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Star className="w-4 h-4 text-accent" /> Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Member Since</span>
              <span className="text-sm font-medium text-foreground">{memberSince}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Bookings</span>
              <span className="text-sm font-medium text-foreground">{bookings.length}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Spent</span>
              <span className="text-sm font-semibold text-foreground">{formatPrice(totalSpent)}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Loyalty Points</span>
              <span className="text-sm font-semibold text-primary">0</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );

  // --- Favourites / Support views ---
  const renderFavourites = () => (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-bold text-foreground mb-1">Favourites</h2>
      <p className="text-sm text-muted-foreground mb-6">Your saved items</p>
      <Card>
        <CardContent className="py-16 text-center">
          <Heart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Favourites Yet</h3>
          <p className="text-sm text-muted-foreground">Items you save will appear here.</p>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderSupport = () => (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-bold text-foreground mb-1">Help & Support</h2>
      <p className="text-sm text-muted-foreground mb-6">Need assistance? We're here to help.</p>
      <Card>
        <CardContent className="py-16 text-center">
          <Headphones className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-1">Support Center</h3>
          <p className="text-sm text-muted-foreground mb-4">For any questions, reach out to our support team.</p>
          <Button variant="outline" size="sm">Contact Support</Button>
        </CardContent>
      </Card>
    </motion.div>
  );

  // --- Requests view ---
  const renderRequests = () => {
    const flightBookings = bookings.filter(b => b.type === "Flight" && (b.status === "Confirmed" || b.status === "Paid"));
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-xl font-bold text-foreground">Reissue & Refund Requests</h2>
            <p className="text-sm text-muted-foreground">Request date changes or refunds for your flight bookings</p>
          </div>
        </div>

        {/* New request section */}
        {flightBookings.length > 0 && (
          <Card className="mb-5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submit New Request</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">Select a flight booking to request reissue or refund:</p>
              <div className="space-y-2">
                {flightBookings.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Plane className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{b.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{b.booking_id}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setTicketRequestBooking({ id: b.id, booking_id: b.booking_id, title: b.title, type: b.type })}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reissue / Refund
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Existing requests list */}
        <TicketRequestsList userId={user!.id} refreshKey={requestRefreshKey} />
      </motion.div>
    );
  };

  // --- Main content router ---
  const renderMainContent = () => {
    switch (activePage) {
      case "dashboard": return renderDashboardHome();
      case "profile": return renderProfile();
      case "favourites": return renderFavourites();
      case "support": return renderSupport();
      case "requests": return renderRequests();
      case "wallet": return <WalletSection userId={user!.id} balance={walletBalance} onBalanceChange={refreshData} />;
      case "b2b-access": return <B2BAccessRequests />;
      default: return renderBookingsList();
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-6 lg:py-8">
        {/* Mobile menu */}
        <div className="lg:hidden mb-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Menu className="w-4 h-4" /> Menu
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0 overflow-y-auto">
              {renderSidebar()}
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <div className="hidden lg:block w-[260px] flex-shrink-0">
            <Card className="sticky top-20 overflow-hidden">
              {renderSidebar()}
            </Card>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {renderMainContent()}
          </div>
        </div>
      </div>

      {/* Cancel dialog */}
      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
            <DialogDescription>Are you sure you want to cancel this booking? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelId(null)}>Keep Booking</Button>
            <Button variant="destructive" onClick={cancelBooking}>Cancel Booking</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ticket request dialog */}
      <TicketRequestDialog
        open={!!ticketRequestBooking}
        onOpenChange={(v) => { if (!v) setTicketRequestBooking(null); }}
        booking={ticketRequestBooking}
        userId={user?.id || ""}
        onSuccess={() => setRequestRefreshKey(k => k + 1)}
      />
    </Layout>
  );
};

export default Dashboard;
