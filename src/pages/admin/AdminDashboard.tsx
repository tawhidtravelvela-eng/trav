import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarCheck, DollarSign, Loader2, TrendingUp, TrendingDown, Plane, Hotel, MapPin, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Badge } from "@/components/ui/badge";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";

interface Stats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  paidBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  flightBookings: number;
  hotelBookings: number;
  tourBookings: number;
}

interface MonthlyRow {
  month: string;
  revenue: number;
  bookings: number;
}

interface RecentBooking {
  id: string;
  title: string;
  type: string;
  total: number;
  status: string;
  created_at: string;
}

const BOOKING_TYPE_COLORS = [
  "hsl(205, 100%, 50%)",
  "hsl(18, 100%, 59%)",
  "hsl(152, 70%, 42%)",
];

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0, totalBookings: 0, totalRevenue: 0,
    paidBookings: 0, pendingBookings: 0, cancelledBookings: 0,
    flightBookings: 0, hotelBookings: 0, tourBookings: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyRow[]>([]);
  const [recentBookings, setRecentBookings] = useState<RecentBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency();
  const { adminTenantId, applyTenantFilter } = useAdminTenantFilter();

  useEffect(() => {
    const fetchData = async () => {
      let profilesQuery = supabase.from("profiles").select("id", { count: "exact", head: true });
      let bookingsQuery = supabase.from("bookings").select("id, title, total, created_at, status, type").order("created_at", { ascending: false });
      
      if (adminTenantId) {
        profilesQuery = profilesQuery.eq("tenant_id", adminTenantId);
        bookingsQuery = bookingsQuery.eq("tenant_id", adminTenantId);
      }

      const [profilesRes, bookingsRes] = await Promise.all([profilesQuery, bookingsQuery]);

      const totalUsers = profilesRes.count || 0;
      const allBookings = bookingsRes.data || [];
      const totalBookings = allBookings.length;
      const totalRevenue = allBookings.reduce((sum, b) => sum + Number(b.total), 0);
      const paidBookings = allBookings.filter(b => b.status === "Paid" || b.status === "Confirmed").length;
      const pendingBookings = allBookings.filter(b => b.status === "Pending").length;
      const cancelledBookings = allBookings.filter(b => b.status === "Cancelled").length;
      const flightBookings = allBookings.filter(b => b.type === "Flight").length;
      const hotelBookings = allBookings.filter(b => b.type === "Hotel").length;
      const tourBookings = allBookings.filter(b => b.type === "Tour").length;

      setStats({ totalUsers, totalBookings, totalRevenue, paidBookings, pendingBookings, cancelledBookings, flightBookings, hotelBookings, tourBookings });
      setRecentBookings(allBookings.slice(0, 5));

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const grouped: Record<string, { revenue: number; bookings: number }> = {};
      months.forEach(m => { grouped[m] = { revenue: 0, bookings: 0 }; });

      allBookings.forEach((b) => {
        const d = new Date(b.created_at);
        const m = months[d.getMonth()];
        grouped[m].revenue += Number(b.total);
        grouped[m].bookings += 1;
      });

      setMonthlyData(months.map(m => ({ month: m, ...grouped[m] })));
      setLoading(false);
    };
    fetchData();
  }, []);

  const currentMonth = new Date().getMonth();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const currentRevenue = monthlyData[currentMonth]?.revenue || 0;
  const prevRevenue = monthlyData[prevMonth]?.revenue || 0;
  const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : "0";
  const isRevenueUp = Number(revenueChange) >= 0;

  const bookingTypeData = [
    { name: "Flights", value: stats.flightBookings },
    { name: "Hotels", value: stats.hotelBookings },
    { name: "Tours", value: stats.tourBookings },
  ].filter(d => d.value > 0);

  const statCards = [
    { label: "Total Users", value: stats.totalUsers.toLocaleString(), icon: Users, gradient: "from-[hsl(205,100%,50%)] to-[hsl(205,100%,35%)]", iconBg: "bg-[hsl(205,100%,50%/0.15)]", iconColor: "text-primary" },
    { label: "Total Bookings", value: stats.totalBookings.toLocaleString(), icon: CalendarCheck, gradient: "from-[hsl(18,100%,59%)] to-[hsl(18,100%,45%)]", iconBg: "bg-[hsl(18,100%,59%/0.15)]", iconColor: "text-accent" },
    { label: "Total Revenue", value: formatPrice(stats.totalRevenue), icon: DollarSign, gradient: "from-[hsl(152,70%,42%)] to-[hsl(152,70%,30%)]", iconBg: "bg-[hsl(152,70%,42%/0.15)]", iconColor: "text-[hsl(152,70%,42%)]" },
    { label: "Pending", value: stats.pendingBookings.toLocaleString(), icon: TrendingUp, gradient: "from-[hsl(38,92%,50%)] to-[hsl(38,92%,38%)]", iconBg: "bg-[hsl(38,92%,50%/0.15)]", iconColor: "text-[hsl(38,92%,50%)]" },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      Confirmed: "bg-[hsl(152,70%,42%/0.12)] text-[hsl(152,70%,42%)] border-[hsl(152,70%,42%/0.2)]",
      Paid: "bg-primary/10 text-primary border-primary/20",
      Pending: "bg-[hsl(38,92%,50%/0.12)] text-[hsl(38,92%,50%)] border-[hsl(38,92%,50%/0.2)]",
      Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return map[status] || "bg-muted text-muted-foreground";
  };

  const typeIcon = (type: string) => {
    if (type === "Flight") return <Plane className="h-3.5 w-3.5" />;
    if (type === "Hotel") return <Hotel className="h-3.5 w-3.5" />;
    return <MapPin className="h-3.5 w-3.5" />;
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Overview of your business performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-medium px-3 py-1.5 border-border">
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Badge>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.label} className="relative overflow-hidden border-border/50 hover:shadow-lg transition-all duration-300 group">
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-[0.03] group-hover:opacity-[0.06] transition-opacity`} />
              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${stat.iconBg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart - takes 2 cols */}
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Revenue Overview</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Monthly revenue trend</p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${isRevenueUp ? "bg-[hsl(152,70%,42%/0.1)] text-[hsl(152,70%,42%)]" : "bg-destructive/10 text-destructive"}`}>
                  {isRevenueUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {revenueChange}%
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(205, 100%, 50%)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(205, 100%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 45%, 88%)" strokeOpacity={0.5} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPrice(v).replace(/\.00$/, "")} />
                  <Tooltip
                    contentStyle={{ borderRadius: "12px", border: "1px solid hsl(207, 45%, 88%)", boxShadow: "0 8px 24px -4px hsl(205, 100%, 50%, 0.1)", fontSize: "12px" }}
                    formatter={(v: number) => [formatPrice(v), "Revenue"]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(205, 100%, 50%)" strokeWidth={2.5} fill="url(#revenueGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: "hsl(0, 0%, 100%)", stroke: "hsl(205, 100%, 50%)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Booking Type Pie */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Booking Types</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Distribution by category</p>
            </CardHeader>
            <CardContent className="pt-0 flex flex-col items-center">
              {bookingTypeData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={bookingTypeData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value" strokeWidth={0}>
                        {bookingTypeData.map((_, i) => (
                          <Cell key={i} fill={BOOKING_TYPE_COLORS[i % BOOKING_TYPE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid hsl(207, 45%, 88%)", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    {bookingTypeData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: BOOKING_TYPE_COLORS[i] }} />
                        {d.name} ({d.value})
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data yet</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bookings Trend */}
          <Card className="lg:col-span-2 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Bookings Trend</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Monthly booking volume</p>
            </CardHeader>
            <CardContent className="pt-2">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyData} barCategoryGap="20%">
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(18, 100%, 59%)" />
                      <stop offset="100%" stopColor="hsl(18, 100%, 45%)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 45%, 88%)" strokeOpacity={0.5} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(207, 45%, 88%)", boxShadow: "0 8px 24px -4px hsl(18, 100%, 59%, 0.1)", fontSize: "12px" }} formatter={(v: number) => [v, "Bookings"]} />
                  <Bar dataKey="bookings" fill="url(#barGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Recent Bookings */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Recent Bookings</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Latest activity</p>
                </div>
                <a href="/admin/bookings" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                  View all <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {recentBookings.length > 0 ? (
                <div className="space-y-3">
                  {recentBookings.map((b) => (
                    <div key={b.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg bg-muted/60 text-muted-foreground shrink-0">
                          {typeIcon(b.type)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate max-w-[140px]">{b.title}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(b.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">{formatPrice(b.total)}</p>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadge(b.status)}`}>
                          {b.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No bookings yet</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
