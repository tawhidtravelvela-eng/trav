import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, RefreshCw, TrendingUp, Plane } from "lucide-react";

interface PopularRoute {
  id: string;
  from_code: string;
  to_code: string;
  from_city: string;
  to_city: string;
  search_count: number;
  lowest_price: number;
  currency: string;
  airline: string;
  duration: string;
  stops: number;
  last_searched_at: string;
}

const AdminPopularRoutes = () => {
  const [routes, setRoutes] = useState<PopularRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("popular_routes")
      .select("*")
      .order("search_count", { ascending: false });
    if (!error && data) setRoutes(data as PopularRoute[]);
    setLoading(false);
  };

  useEffect(() => { fetchRoutes(); }, []);

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete route ${label}?`)) return;
    const { error } = await supabase.from("popular_routes").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete route");
    } else {
      toast.success("Route deleted");
      setRoutes((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Clear ALL popular routes data? This cannot be undone.")) return;
    const { error } = await supabase.from("popular_routes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast.error("Failed to clear routes");
    } else {
      toast.success("All routes cleared");
      setRoutes([]);
    }
  };

  const totalSearches = routes.reduce((s, r) => s + r.search_count, 0);
  const topRoute = routes[0];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Popular Routes</h1>
            <p className="text-sm text-muted-foreground">Track most-searched flight routes and lowest fares</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRoutes} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearAll} disabled={routes.length === 0}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear All
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{routes.length}</p>
                  <p className="text-xs text-muted-foreground">Unique Routes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Plane className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{totalSearches}</p>
                  <p className="text-xs text-muted-foreground">Total Searches</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground truncate max-w-[140px]">
                    {topRoute ? `${topRoute.from_code}→${topRoute.to_code}` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Top Route</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Routes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : routes.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No popular routes yet. Data populates as users search for flights.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Cities</TableHead>
                      <TableHead className="text-right">Searches</TableHead>
                      <TableHead className="text-right">Lowest Price</TableHead>
                      <TableHead>Airline</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Stops</TableHead>
                      <TableHead>Last Searched</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((r, i) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                        <TableCell className="font-bold whitespace-nowrap">
                          {r.from_code} → {r.to_code}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {r.from_city || "—"} → {r.to_city || "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{r.search_count}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {r.currency} {r.lowest_price.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{r.airline || "—"}</TableCell>
                        <TableCell className="text-sm">{r.duration || "—"}</TableCell>
                        <TableCell className="text-sm">{r.stops === 0 ? "Non-stop" : r.stops}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.last_searched_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(r.id, `${r.from_code}→${r.to_code}`)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminPopularRoutes;