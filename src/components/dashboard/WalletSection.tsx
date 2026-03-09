import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useCurrency } from "@/contexts/CurrencyContext";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { processBkashPayment } from "@/utils/bookingService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Wallet, Plus, ArrowDownLeft, ArrowUpRight, TrendingUp,
  Clock, CreditCard, CheckCircle2, XCircle, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  reference: string | null;
  created_at: string;
}

interface WalletSectionProps {
  userId: string;
  balance: number;
  onBalanceChange: () => void;
}

const WalletSection = ({ userId, balance, onBalanceChange }: WalletSectionProps) => {
  const { formatPrice, currency } = useCurrency();
  const { tenant } = useTenant();
  const { methods, loading: methodsLoading } = usePaymentMethods();
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedPayment, setSelectedPayment] = useState("");
  const [processing, setProcessing] = useState(false);

  const quickAmounts = [10, 25, 50, 100, 250, 500];

  useEffect(() => {
    fetchTransactions();
  }, [userId]);

  const fetchTransactions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setTransactions((data as WalletTransaction[]) || []);
    setLoading(false);
  };

  const totalCredits = transactions
    .filter((t) => t.type === "credit")
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalDebits = transactions
    .filter((t) => t.type === "debit")
    .reduce((s, t) => s + Number(t.amount), 0);

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!selectedPayment) {
      toast.error("Select a payment method");
      return;
    }

    setProcessing(true);

    try {
      if (selectedPayment === "bkash") {
        const ref = `WAL-${Date.now()}`;
        const res = await processBkashPayment(amt, ref);
        if (!res.success) {
          toast.error(res.error || "bKash payment failed");
          setProcessing(false);
          return;
        }
        // Store session data for callback
        sessionStorage.setItem("wallet_deposit_amount", String(amt));
        sessionStorage.setItem("wallet_deposit_paymentID", res.paymentID || "");
        sessionStorage.setItem("wallet_deposit_idToken", res.id_token || "");
        if (res.bkashURL) {
          window.location.href = res.bkashURL;
          return;
        }
      }

      if (selectedPayment === "bank") {
        // Bank transfer: server-side pending transaction via edge function
        const { data, error } = await supabase.functions.invoke("wallet-deposit", {
          body: {
            action: "bank_deposit",
            amount: amt,
            tenantId: tenant?.id || null,
          },
        });
        if (error || !data?.success) {
          toast.error(data?.error || error?.message || "Deposit request failed");
          setProcessing(false);
          return;
        }
        toast.success("Deposit request submitted. It will be credited after bank transfer verification.");
      } else if (selectedPayment !== "bkash") {
        // Card payment — also via server-side (bank_deposit with pending status)
        const { data, error } = await supabase.functions.invoke("wallet-deposit", {
          body: {
            action: "bank_deposit",
            amount: amt,
            paymentMethod: selectedPayment,
            tenantId: tenant?.id || null,
          },
        });
        if (error || !data?.success) {
          toast.error(data?.error || error?.message || "Deposit failed");
          setProcessing(false);
          return;
        }
        toast.success("Deposit request submitted for processing.");
      }

      setDepositOpen(false);
      setDepositAmount("");
      setSelectedPayment("");
      onBalanceChange();
      fetchTransactions();
    } catch (err: any) {
      toast.error(err.message || "Deposit failed");
    } finally {
      setProcessing(false);
    }
  };

  // Handle bKash callback on mount — execute via server-side edge function
  useEffect(() => {
    const storedAmount = sessionStorage.getItem("wallet_deposit_amount");
    const paymentID = sessionStorage.getItem("wallet_deposit_paymentID");
    const idToken = sessionStorage.getItem("wallet_deposit_idToken");

    if (storedAmount && paymentID && idToken) {
      sessionStorage.removeItem("wallet_deposit_amount");
      sessionStorage.removeItem("wallet_deposit_paymentID");
      sessionStorage.removeItem("wallet_deposit_idToken");

      const completeBkash = async () => {
        setProcessing(true);
        const { data, error } = await supabase.functions.invoke("wallet-deposit", {
          body: {
            action: "bkash_complete",
            amount: parseFloat(storedAmount),
            paymentID,
            id_token: idToken,
            tenantId: tenant?.id || null,
          },
        });
        if (data?.success && data?.transactionStatus === "Completed") {
          toast.success("Wallet topped up via bKash!");
          onBalanceChange();
          fetchTransactions();
        } else {
          toast.error(data?.error || error?.message || "bKash payment was not completed");
        }
        setProcessing(false);
      };
      completeBkash();
    }
  }, []);

  const openDeposit = () => {
    setDepositAmount("");
    setSelectedPayment(methods[0]?.id || "card");
    setDepositOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-bold text-foreground">My Wallet</h2>
          <p className="text-sm text-muted-foreground">Manage your wallet balance and transactions</p>
        </div>
        <Button onClick={openDeposit} className="gap-2">
          <Plus className="w-4 h-4" /> Add Funds
        </Button>
      </div>

      {/* Balance & Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <span className="text-sm font-medium text-primary-foreground/80">Available Balance</span>
              </div>
              <p className="text-3xl font-bold">{formatPrice(balance)}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="border-border/50 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[hsl(var(--success))]/10 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5 text-[hsl(var(--success))]" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Total Credits</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatPrice(totalCredits)}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <Card className="border-border/50 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-destructive" />
                </div>
                <span className="text-xs font-medium text-muted-foreground">Total Debits</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatPrice(totalDebits)}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">No Transactions</h3>
              <p className="text-sm text-muted-foreground mb-4">Add funds to your wallet to get started.</p>
              <Button size="sm" onClick={openDeposit}>
                <Plus className="w-4 h-4 mr-1" /> Add Funds
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((t) => {
                const isCredit = t.type === "credit";
                return (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isCredit ? "bg-[hsl(var(--success))]/10" : "bg-destructive/10"
                    }`}>
                      {isCredit ? (
                        <ArrowDownLeft className="w-5 h-5 text-[hsl(var(--success))]" />
                      ) : (
                        <ArrowUpRight className="w-5 h-5 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.description || (isCredit ? "Credit" : "Debit")}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${isCredit ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                        {isCredit ? "+" : "-"}{formatPrice(Number(t.amount))}
                      </p>
                      <Badge variant="outline" className={`text-[10px] mt-1 ${
                        isCredit
                          ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20"
                          : "bg-destructive/10 text-destructive border-destructive/20"
                      }`}>
                        {isCredit ? "Credit" : "Debit"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" /> Add Funds to Wallet
            </DialogTitle>
            <DialogDescription>Choose an amount and payment method to top up your wallet.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Amount input */}
            <div>
              <Label className="text-sm font-medium">Amount</Label>
              <Input
                type="number"
                min="1"
                step="any"
                placeholder="Enter amount"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="mt-1.5 text-lg font-semibold"
              />
              {/* Quick amount buttons */}
              <div className="flex flex-wrap gap-2 mt-3">
                {quickAmounts.map((amt) => (
                  <Button
                    key={amt}
                    type="button"
                    variant={depositAmount === String(amt) ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setDepositAmount(String(amt))}
                  >
                    {formatPrice(amt)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Payment methods */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Payment Method</Label>
              {methodsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading methods…
                </div>
              ) : (
                <RadioGroup value={selectedPayment} onValueChange={setSelectedPayment} className="space-y-2">
                  {methods.map((m) => {
                    const Icon = m.icon;
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedPayment === m.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-primary/30 hover:bg-muted/30"
                        }`}
                      >
                        <RadioGroupItem value={m.id} className="sr-only" />
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          selectedPayment === m.id ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <Icon className={`w-4 h-4 ${selectedPayment === m.id ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{m.label}</p>
                          <p className="text-xs text-muted-foreground">{m.description}</p>
                        </div>
                        {selectedPayment === m.id && (
                          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </RadioGroup>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDepositOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleDeposit} disabled={processing || !depositAmount}>
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" /> Deposit {depositAmount ? formatPrice(parseFloat(depositAmount) || 0) : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default WalletSection;
