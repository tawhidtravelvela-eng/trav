import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Plus, Trash2, ListOrdered, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QueueCount {
  queue: string;
  count: number;
}

interface QueueEntry {
  pnr: string;
}

const AdminQueueDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [queueCounts, setQueueCounts] = useState<QueueCount[]>([]);
  const [selectedQueue, setSelectedQueue] = useState("");
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [placePnr, setPlacePnr] = useState("");
  const [placeQueue, setPlaceQueue] = useState("");
  const [placing, setPlacing] = useState(false);
  const [pcc, setPcc] = useState("");

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelport-queue", {
        body: { action: "count", pcc: pcc || undefined },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to fetch queue counts");
      } else {
        setQueueCounts(data.queues || []);
      }
    } catch {
      toast.error("Failed to connect to queue service");
    }
    setLoading(false);
  };

  const fetchQueueEntries = async (queueNum: string) => {
    setSelectedQueue(queueNum);
    setEntriesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelport-queue", {
        body: { action: "list", queueNumber: queueNum, pcc: pcc || undefined },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to list queue");
      } else {
        setEntries(data.entries || []);
      }
    } catch {
      toast.error("Failed to connect to queue service");
    }
    setEntriesLoading(false);
  };

  const handlePlace = async () => {
    if (!placePnr || !placeQueue) {
      toast.error("Enter both PNR and queue number");
      return;
    }
    setPlacing(true);
    try {
      const { data, error } = await supabase.functions.invoke("travelport-queue", {
        body: { action: "place", pnr: placePnr, queueNumber: placeQueue, pcc: pcc || undefined },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to place on queue");
      } else {
        toast.success(data.message);
        setPlacePnr("");
        if (selectedQueue === placeQueue) fetchQueueEntries(placeQueue);
      }
    } catch {
      toast.error("Failed to connect");
    }
    setPlacing(false);
  };

  const handleRemove = async (pnr: string) => {
    if (!selectedQueue) return;
    try {
      const { data, error } = await supabase.functions.invoke("travelport-queue", {
        body: { action: "remove", pnr, queueNumber: selectedQueue, pcc: pcc || undefined },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "Failed to remove from queue");
      } else {
        toast.success(data.message);
        setEntries((prev) => prev.filter((e) => e.pnr !== pnr));
      }
    } catch {
      toast.error("Failed to connect");
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Queue Management</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage Travelport GDS queues — view, place, and remove PNRs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground whitespace-nowrap">PCC Override</Label>
              <Input
                value={pcc}
                onChange={(e) => setPcc(e.target.value.toUpperCase())}
                placeholder="Auto"
                className="w-24"
              />
            </div>
            <Button onClick={fetchCounts} disabled={loading} variant="outline" size="sm">
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Queue Counts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hash className="w-5 h-5" />
              Queue Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : queueCounts.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">
                No queues found. Click Refresh to load queue counts.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {queueCounts.map((q) => (
                  <button
                    key={q.queue}
                    onClick={() => fetchQueueEntries(q.queue)}
                    className={`p-4 rounded-lg border text-center transition-colors hover:border-primary/50 ${
                      selectedQueue === q.queue
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <div className="text-2xl font-bold text-foreground">{q.count}</div>
                    <div className="text-sm text-muted-foreground">Queue {q.queue}</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Place on Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="w-5 h-5" />
                Place on Queue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>PNR / Locator Code</Label>
                <Input
                  value={placePnr}
                  onChange={(e) => setPlacePnr(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Queue Number</Label>
                <Input
                  value={placeQueue}
                  onChange={(e) => setPlaceQueue(e.target.value)}
                  placeholder="e.g. 50"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={handlePlace}
                disabled={placing || !placePnr || !placeQueue}
                className="w-full"
              >
                {placing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Place on Queue
              </Button>
            </CardContent>
          </Card>

          {/* Queue Entries */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListOrdered className="w-5 h-5" />
                {selectedQueue ? `Queue ${selectedQueue} Entries` : "Select a Queue"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedQueue ? (
                <p className="text-muted-foreground text-center py-6">
                  Click on a queue above to view its entries
                </p>
              ) : entriesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : entries.length === 0 ? (
                <p className="text-muted-foreground text-center py-6">
                  Queue {selectedQueue} is empty
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>PNR</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry, i) => (
                      <TableRow key={entry.pnr}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {entry.pnr}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemove(entry.pnr)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminQueueDashboard;
