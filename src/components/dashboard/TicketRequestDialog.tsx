import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, RotateCcw } from "lucide-react";

interface TicketRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: { id: string; booking_id: string; title: string; type: string } | null;
  userId: string;
  onSuccess: () => void;
}

export default function TicketRequestDialog({ open, onOpenChange, booking, userId, onSuccess }: TicketRequestDialogProps) {
  const [requestType, setRequestType] = useState<"reissue" | "refund">("refund");
  const [reason, setReason] = useState("");
  const [newTravelDate, setNewTravelDate] = useState("");
  const [refundMethod, setRefundMethod] = useState<"wallet" | "gateway">("wallet");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!booking || !reason.trim()) {
      toast.error("Please provide a reason for your request");
      return;
    }
    if (requestType === "reissue" && !newTravelDate) {
      toast.error("Please specify your preferred new travel date");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("ticket_requests" as any).insert({
      booking_id: booking.id,
      user_id: userId,
      type: requestType,
      reason: reason.trim(),
      new_travel_date: requestType === "reissue" ? newTravelDate : null,
      refund_method: requestType === "refund" ? refundMethod : null,
      status: "pending",
    });
    setSubmitting(false);

    if (error) {
      toast.error("Failed to submit request: " + error.message);
      return;
    }

    toast.success(`${requestType === "reissue" ? "Reissue" : "Refund"} request submitted successfully`);
    setReason("");
    setNewTravelDate("");
    onOpenChange(false);
    onSuccess();
  };

  const resetForm = () => {
    setRequestType("refund");
    setReason("");
    setNewTravelDate("");
    setRefundMethod("wallet");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {requestType === "reissue" ? <RefreshCw className="w-5 h-5 text-primary" /> : <RotateCcw className="w-5 h-5 text-primary" />}
            Request {requestType === "reissue" ? "Reissue" : "Refund"}
          </DialogTitle>
          <DialogDescription>
            {booking && <>For booking <span className="font-mono font-semibold">{booking.booking_id}</span> — {booking.title}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Request type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Request Type</Label>
            <RadioGroup value={requestType} onValueChange={(v) => setRequestType(v as "reissue" | "refund")} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="reissue" id="type-reissue" />
                <Label htmlFor="type-reissue" className="cursor-pointer font-normal">Reissue (Date Change)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="refund" id="type-refund" />
                <Label htmlFor="type-refund" className="cursor-pointer font-normal">Refund</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={requestType === "reissue" ? "Explain why you need to change your travel date…" : "Explain why you're requesting a refund…"}
              rows={3}
            />
          </div>

          {/* Reissue: New travel date */}
          {requestType === "reissue" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preferred New Travel Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={newTravelDate} onChange={(e) => setNewTravelDate(e.target.value)} />
            </div>
          )}

          {/* Refund: Preferred method */}
          {requestType === "refund" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preferred Refund Method</Label>
              <RadioGroup value={refundMethod} onValueChange={(v) => setRefundMethod(v as "wallet" | "gateway")} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="wallet" id="method-wallet" />
                  <Label htmlFor="method-wallet" className="cursor-pointer font-normal">Wallet Credit</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="gateway" id="method-gateway" />
                  <Label htmlFor="method-gateway" className="cursor-pointer font-normal">Original Payment Method</Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
