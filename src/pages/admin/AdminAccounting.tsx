import { useState, useEffect, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DollarSign, TrendingUp, TrendingDown, Loader2, Plane, Hotel, MapPin,
  Download, Search, ArrowUpRight, ArrowDownRight, Receipt, PiggyBank,
  BarChart3, CalendarCheck, Percent, CreditCard, Filter,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAdminTenantFilter } from "@/hooks/useAdminTenantFilter";

interface Booking {
  id: string;
  booking_id: string;
  title: string;
  type: string;
  total: number;
  status: string;
  created_at: string;
  details: any;
  confirmation_data: any;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TYPE_COLORS = {
  Flight: "hsl(205, 100%, 50%)",
  Hotel: "hsl(18, 100%, 59%)",
  Tour: "hsl(152, 70%, 42%)",
};
const STATUS_COLORS = {
  Confirmed: "hsl(152, 70%, 42%)",
  Paid: "hsl(205, 100%, 50%)",
  Pending: "hsl(38, 92%, 50%)",
  Cancelled: "hsl(0, 72%, 51%)",
};

// Estimated commission rates by type
const COMMISSION_RATES: Record<string, number> = {
  Flight: 0.05,
  Hotel: 0.12,
  Tour: 0.15,
};

const AdminAccounting = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const { formatPrice } = useCurrency();
  const { adminTenantId } = useAdminTenantFilter();

  useEffect(() => {
    const fetchBookings = async () => {
      let query = supabase.from("bookings").select("*").order("created_at", { ascending: false });
      if (adminTenantId) query = query.eq("tenant_id", adminTenantId);
      const { data } = await query;
      setBookings(data || []);
      setLoading(false);
    };
    fetchBookings();
  }, [adminTenantId]);

  // Filter bookings by period
  const filteredByPeriod = useMemo(() => {
    if (periodFilter === "all") return bookings;
    const now = new Date();
    const cutoff = new Date();
    if (periodFilter === "this-month") cutoff.setDate(1);
    else if (periodFilter === "last-month") { cutoff.setMonth(cutoff.getMonth() - 1); cutoff.setDate(1); }
    else if (periodFilter === "this-quarter") { cutoff.setMonth(Math.floor(now.getMonth() / 3) * 3); cutoff.setDate(1); }
    else if (periodFilter === "this-year") { cutoff.setMonth(0); cutoff.setDate(1); }
    else if (periodFilter === "last-30") cutoff.setDate(cutoff.getDate() - 30);
    else if (periodFilter === "last-90") cutoff.setDate(cutoff.getDate() - 90);

    return bookings.filter(b => {
      const d = new Date(b.created_at);
      if (periodFilter === "last-month") {
        const endOfLast = new Date(now.getFullYear(), now.getMonth(), 1);
        return d >= cutoff && d < endOfLast;
      }
      return d >= cutoff;
    });
  }, [bookings, periodFilter]);

  // Apply search and type/status filters
  const filteredBookings = useMemo(() => {
    return filteredByPeriod.filter(b => {
      if (typeFilter !== "all" && b.type !== typeFilter) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return b.title.toLowerCase().includes(s) || b.booking_id.toLowerCase().includes(s);
      }
      return true;
    });
  }, [filteredByPeriod, typeFilter, statusFilter, searchTerm]);

  // Summary stats
  const stats = useMemo(() => {
    const confirmed = filteredByPeriod.filter(b => b.status === "Confirmed" || b.status === "Paid");
    const totalSales = filteredByPeriod.reduce((s, b) => s + Number(b.total), 0);
    const confirmedRevenue = confirmed.reduce((s, b) => s + Number(b.total), 0);
    const totalCommission = filteredByPeriod.reduce((s, b) => s + Number(b.total) * (COMMISSION_RATES[b.type] || 0.05), 0);
    const avgBookingValue = filteredByPeriod.length > 0 ? totalSales / filteredByPeriod.length : 0;
    const pendingRevenue = filteredByPeriod.filter(b => b.status === "Pending").reduce((s, b) => s + Number(b.total), 0);
    const cancelledAmount = filteredByPeriod.filter(b => b.status === "Cancelled").reduce((s, b) => s + Number(b.total), 0);

    // By type
    const byType = { Flight: 0, Hotel: 0, Tour: 0 };
    const countByType = { Flight: 0, Hotel: 0, Tour: 0 };
    filteredByPeriod.forEach(b => {
      const t = b.type as keyof typeof byType;
      if (byType[t] !== undefined) { byType[t] += Number(b.total); countByType[t]++; }
    });

    // By status
    const byStatus: Record<string, number> = {};
    filteredByPeriod.forEach(b => { byStatus[b.status] = (byStatus[b.status] || 0) + Number(b.total); });

    return { totalSales, confirmedRevenue, totalCommission, avgBookingValue, pendingRevenue, cancelledAmount, byType, countByType, byStatus, totalBookings: filteredByPeriod.length, confirmedCount: confirmed.length };
  }, [filteredByPeriod]);

  // Monthly data for charts
  const monthlyData = useMemo(() => {
    const grouped: Record<string, { revenue: number; bookings: number; commission: number; flights: number; hotels: number; tours: number }> = {};
    MONTHS.forEach(m => { grouped[m] = { revenue: 0, bookings: 0, commission: 0, flights: 0, hotels: 0, tours: 0 }; });

    filteredByPeriod.forEach(b => {
      const m = MONTHS[new Date(b.created_at).getMonth()];
      const total = Number(b.total);
      grouped[m].revenue += total;
      grouped[m].bookings += 1;
      grouped[m].commission += total * (COMMISSION_RATES[b.type] || 0.05);
      if (b.type === "Flight") grouped[m].flights += total;
      else if (b.type === "Hotel") grouped[m].hotels += total;
      else grouped[m].tours += total;
    });

    return MONTHS.map(m => ({ month: m, ...grouped[m] }));
  }, [filteredByPeriod]);

  // P&L data
  const plData = useMemo(() => {
    return MONTHS.map((m, i) => {
      const d = monthlyData[i];
      const costs = d.revenue * 0.82; // estimated cost (supplier costs)
      const grossProfit = d.revenue - costs;
      const opExpenses = d.revenue * 0.08; // operational overhead
      const netProfit = grossProfit - opExpenses;
      return { month: m, revenue: d.revenue, costs, grossProfit, netProfit };
    });
  }, [monthlyData]);

  // MoM comparison
  const currentMonth = new Date().getMonth();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const currentRevenue = monthlyData[currentMonth]?.revenue || 0;
  const prevRevenue = monthlyData[prevMonth]?.revenue || 0;
  const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100) : 0;

  // Export CSV
  const exportCSV = () => {
    const headers = ["Date", "Booking ID", "Title", "Type", "Status", "Amount", "Commission"];
    const rows = filteredBookings.map(b => [
      new Date(b.created_at).toLocaleDateString(),
      b.booking_id,
      `"${b.title}"`,
      b.type,
      b.status,
      Number(b.total).toFixed(2),
      (Number(b.total) * (COMMISSION_RATES[b.type] || 0.05)).toFixed(2),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accounting-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadgeClass = (status: string) => {
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

  const pieData = Object.entries(stats.byType)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const statusPieData = Object.entries(stats.byStatus)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Accounting</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Financial overview, commissions & transaction ledger</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="last-30">Last 30 Days</SelectItem>
                <SelectItem value="last-90">Last 90 Days</SelectItem>
                <SelectItem value="this-quarter">This Quarter</SelectItem>
                <SelectItem value="this-year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {[
            { label: "Total Sales", value: formatPrice(stats.totalSales), icon: DollarSign, color: "hsl(205, 100%, 50%)", sub: `${stats.totalBookings} bookings` },
            { label: "Confirmed Revenue", value: formatPrice(stats.confirmedRevenue), icon: CreditCard, color: "hsl(152, 70%, 42%)", sub: `${stats.confirmedCount} confirmed` },
            { label: "Est. Commission", value: formatPrice(stats.totalCommission), icon: Percent, color: "hsl(280, 70%, 55%)", sub: "markup earned" },
            { label: "Avg. Booking Value", value: formatPrice(stats.avgBookingValue), icon: BarChart3, color: "hsl(18, 100%, 59%)", sub: "per booking" },
            { label: "Pending Revenue", value: formatPrice(stats.pendingRevenue), icon: Receipt, color: "hsl(38, 92%, 50%)", sub: "awaiting payment" },
            { label: "Cancelled", value: formatPrice(stats.cancelledAmount), icon: TrendingDown, color: "hsl(0, 72%, 51%)", sub: "lost revenue" },
          ].map((kpi) => (
            <Card key={kpi.label} className="border-border/50 hover:shadow-md transition-shadow group">
              <CardContent className="p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 rounded-bl-[40px] opacity-[0.06] group-hover:opacity-[0.1] transition-opacity" style={{ background: kpi.color }} />
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 rounded-lg" style={{ background: `${kpi.color}15` }}>
                    <kpi.icon className="h-4 w-4" style={{ color: kpi.color }} />
                  </div>
                </div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground mt-0.5 tracking-tight">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sales" className="space-y-4">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="sales" className="text-xs">Sales Dashboard</TabsTrigger>
            <TabsTrigger value="commission" className="text-xs">Commission Tracking</TabsTrigger>
            <TabsTrigger value="ledger" className="text-xs">Transaction Ledger</TabsTrigger>
            <TabsTrigger value="pnl" className="text-xs">Profit & Loss</TabsTrigger>
          </TabsList>

          {/* Sales Dashboard Tab */}
          <TabsContent value="sales" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Revenue Trend */}
              <Card className="lg:col-span-2 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Monthly breakdown by booking type</p>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${revenueChange >= 0 ? "bg-[hsl(152,70%,42%/0.1)] text-[hsl(152,70%,42%)]" : "bg-destructive/10 text-destructive"}`}>
                      {revenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {revenueChange.toFixed(1)}% MoM
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={monthlyData} barCategoryGap="15%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 45%, 88%)" strokeOpacity={0.5} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPrice(v).replace(/\.00$/, "")} />
                      <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(207, 45%, 88%)", fontSize: "12px" }} formatter={(v: number, name: string) => [formatPrice(v), name]} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="flights" name="Flights" fill={TYPE_COLORS.Flight} radius={[4, 4, 0, 0]} stackId="a" />
                      <Bar dataKey="hotels" name="Hotels" fill={TYPE_COLORS.Hotel} radius={[0, 0, 0, 0]} stackId="a" />
                      <Bar dataKey="tours" name="Tours" fill={TYPE_COLORS.Tour} radius={[4, 4, 0, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Revenue by Type Pie */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Revenue by Type</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Sales distribution</p>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col items-center">
                  {pieData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" strokeWidth={0}>
                            {pieData.map((d) => (
                              <Cell key={d.name} fill={TYPE_COLORS[d.name as keyof typeof TYPE_COLORS] || "hsl(207, 30%, 70%)"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: "10px", border: "1px solid hsl(207, 45%, 88%)", fontSize: "12px" }} formatter={(v: number) => [formatPrice(v), "Revenue"]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-3 mt-2 justify-center">
                        {pieData.map((d) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[d.name as keyof typeof TYPE_COLORS] }} />
                            {d.name}: {formatPrice(d.value)}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Revenue by Status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Revenue by Status</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col items-center">
                  {statusPieData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={statusPieData} cx="50%" cy="50%" outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                            {statusPieData.map((d) => (
                              <Cell key={d.name} fill={STATUS_COLORS[d.name as keyof typeof STATUS_COLORS] || "hsl(207, 30%, 70%)"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: "10px", fontSize: "12px" }} formatter={(v: number) => [formatPrice(v)]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-3 mt-1 justify-center">
                        {statusPieData.map((d) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[d.name as keyof typeof STATUS_COLORS] || "hsl(207, 30%, 70%)" }} />
                            {d.name}: {formatPrice(d.value)}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">No data</div>
                  )}
                </CardContent>
              </Card>

              {/* Type Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(["Flight", "Hotel", "Tour"] as const).map((type) => (
                  <Card key={type} className="border-border/50">
                    <CardContent className="p-4 text-center space-y-2">
                      <div className="mx-auto p-3 rounded-xl w-fit" style={{ background: `${TYPE_COLORS[type]}15` }}>
                        {typeIcon(type)}
                      </div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{type}s</p>
                      <p className="text-lg font-bold text-foreground">{formatPrice(stats.byType[type])}</p>
                      <p className="text-[10px] text-muted-foreground">{stats.countByType[type]} bookings</p>
                      <p className="text-[10px] font-medium" style={{ color: TYPE_COLORS[type] }}>
                        {(COMMISSION_RATES[type] * 100).toFixed(0)}% commission
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Commission Tracking Tab */}
          <TabsContent value="commission" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Commission Trend</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Monthly estimated commission earned</p>
                </CardHeader>
                <CardContent className="pt-2">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(280, 70%, 55%)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="hsl(280, 70%, 55%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 45%, 88%)" strokeOpacity={0.5} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPrice(v).replace(/\.00$/, "")} />
                      <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "12px" }} formatter={(v: number) => [formatPrice(v), "Commission"]} />
                      <Area type="monotone" dataKey="commission" stroke="hsl(280, 70%, 55%)" strokeWidth={2.5} fill="url(#commGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: "white", stroke: "hsl(280, 70%, 55%)" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">Commission by Type</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Estimated rates applied</p>
                </CardHeader>
                <CardContent className="pt-2 space-y-4">
                  {(["Flight", "Hotel", "Tour"] as const).map((type) => {
                    const rev = stats.byType[type];
                    const comm = rev * COMMISSION_RATES[type];
                    const pct = stats.totalCommission > 0 ? (comm / stats.totalCommission * 100) : 0;
                    return (
                      <div key={type} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-muted-foreground">{typeIcon(type)} {type}s <Badge variant="outline" className="text-[9px] px-1 py-0">{(COMMISSION_RATES[type] * 100)}%</Badge></span>
                          <span className="font-semibold text-foreground">{formatPrice(comm)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: TYPE_COLORS[type] }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-border/50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-muted-foreground">Total Commission</span>
                      <span className="font-bold text-foreground">{formatPrice(stats.totalCommission)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Transaction Ledger Tab */}
          <TabsContent value="ledger" className="space-y-4">
            {/* Filters */}
            <Card className="border-border/50">
              <CardContent className="p-3">
                <div className="flex flex-wrap gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search by title or booking ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 h-9 text-xs"
                    />
                  </div>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[120px] h-9 text-xs">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Flight">Flight</SelectItem>
                      <SelectItem value="Hotel">Hotel</SelectItem>
                      <SelectItem value="Tour">Tour</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[130px] h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="Confirmed">Confirmed</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Booking ID</TableHead>
                        <TableHead className="text-xs font-semibold">Title</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Amount</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBookings.length > 0 ? filteredBookings.slice(0, 100).map((b) => (
                        <TableRow key={b.id} className="hover:bg-muted/20">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(b.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{b.booking_id.slice(0, 12)}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground max-w-[200px] truncate">{b.title}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {typeIcon(b.type)} {b.type}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusBadgeClass(b.status)}`}>
                              {b.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-foreground text-right">
                            {formatPrice(b.total)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground text-right">
                            {formatPrice(Number(b.total) * (COMMISSION_RATES[b.type] || 0.05))}
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredBookings.length > 100 && (
                  <div className="p-3 text-center text-xs text-muted-foreground border-t border-border/40">
                    Showing 100 of {filteredBookings.length} transactions. Export CSV for full data.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* P&L Tab */}
          <TabsContent value="pnl" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Gross Revenue", value: formatPrice(stats.totalSales), icon: DollarSign, color: "hsl(205, 100%, 50%)" },
                { label: "Est. Gross Profit", value: formatPrice(stats.totalSales * 0.18), icon: PiggyBank, color: "hsl(152, 70%, 42%)" },
                { label: "Est. Net Profit", value: formatPrice(stats.totalSales * 0.10), icon: TrendingUp, color: "hsl(280, 70%, 55%)" },
              ].map((item) => (
                <Card key={item.label} className="border-border/50">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3 rounded-xl" style={{ background: `${item.color}15` }}>
                      <item.icon className="h-5 w-5" style={{ color: item.color }} />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{item.label}</p>
                      <p className="text-xl font-bold text-foreground">{item.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Monthly P&L Overview</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Revenue vs estimated costs and profit</p>
              </CardHeader>
              <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={plData} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(207, 45%, 88%)" strokeOpacity={0.5} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(207, 30%, 47%)" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatPrice(v).replace(/\.00$/, "")} />
                    <Tooltip contentStyle={{ borderRadius: "12px", fontSize: "12px" }} formatter={(v: number, name: string) => [formatPrice(v), name]} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(205, 100%, 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="grossProfit" name="Gross Profit" fill="hsl(152, 70%, 42%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="netProfit" name="Net Profit" fill="hsl(280, 70%, 55%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Breakdown Table */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Monthly Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs font-semibold">Month</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Est. Costs</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Gross Profit</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Op. Expenses</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Net Profit</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Margin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plData.filter(d => d.revenue > 0).map((d) => (
                        <TableRow key={d.month}>
                          <TableCell className="text-xs font-medium">{d.month}</TableCell>
                          <TableCell className="text-xs text-right">{formatPrice(d.revenue)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">{formatPrice(d.costs)}</TableCell>
                          <TableCell className="text-xs text-right text-[hsl(152,70%,42%)]">{formatPrice(d.grossProfit)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground">{formatPrice(d.revenue * 0.08)}</TableCell>
                          <TableCell className="text-xs text-right font-semibold text-[hsl(280,70%,55%)]">{formatPrice(d.netProfit)}</TableCell>
                          <TableCell className="text-xs text-right">
                            <Badge variant="outline" className={`text-[10px] ${d.netProfit > 0 ? "text-[hsl(152,70%,42%)]" : "text-destructive"}`}>
                              {d.revenue > 0 ? (d.netProfit / d.revenue * 100).toFixed(1) : 0}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {plData.filter(d => d.revenue > 0).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No revenue data</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminAccounting;
