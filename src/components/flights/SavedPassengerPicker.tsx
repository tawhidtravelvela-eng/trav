import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserPlus, Users, Trash2, Check, Save } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface PassengerForm {
  title: string; firstName: string; lastName: string; dob: string;
  nationality: string; frequentFlyer: string; passportCountry: string;
  passportNumber: string; passportExpiry: string;
}

interface SavedPassenger {
  id: string;
  title: string;
  first_name: string;
  last_name: string;
  dob: string;
  nationality: string;
  passport_country: string;
  passport_number: string;
  passport_expiry: string;
  frequent_flyer: string;
}

interface Props {
  paxIndex: number;
  currentPax: PassengerForm;
  onSelect: (pax: PassengerForm) => void;
  userId?: string;
  showSaveButton?: boolean;
}

export default function SavedPassengerPicker({ paxIndex, currentPax, onSelect, userId, showSaveButton }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedPassenger[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSaved = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("saved_passengers")
      .select("*")
      .eq("user_id", userId)
      .order("first_name");
    setSaved((data as SavedPassenger[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open && userId) fetchSaved();
  }, [open, userId]);

  const handleSelect = (sp: SavedPassenger) => {
    onSelect({
      title: sp.title,
      firstName: sp.first_name,
      lastName: sp.last_name,
      dob: sp.dob || "",
      nationality: sp.nationality || "",
      frequentFlyer: sp.frequent_flyer || "",
      passportCountry: sp.passport_country || "",
      passportNumber: sp.passport_number || "",
      passportExpiry: sp.passport_expiry || "",
    });
    setOpen(false);
    toast.success(`Loaded ${sp.first_name} ${sp.last_name}`);
  };

  const handleSaveCurrent = async () => {
    if (!userId) { toast.error("Please log in to save passengers"); return; }
    if (!currentPax.firstName || !currentPax.lastName) { toast.error("Fill name fields first"); return; }

    // Check if already saved (by name match)
    const existing = saved.find(
      s => s.first_name.toLowerCase() === currentPax.firstName.toLowerCase() &&
           s.last_name.toLowerCase() === currentPax.lastName.toLowerCase()
    );

    if (existing) {
      // Update existing
      const { error } = await supabase.from("saved_passengers").update({
        title: currentPax.title,
        first_name: currentPax.firstName,
        last_name: currentPax.lastName,
        dob: currentPax.dob,
        nationality: currentPax.nationality,
        passport_country: currentPax.passportCountry,
        passport_number: currentPax.passportNumber,
        passport_expiry: currentPax.passportExpiry,
        frequent_flyer: currentPax.frequentFlyer,
      }).eq("id", existing.id);
      if (error) toast.error("Failed to update passenger");
      else { toast.success("Passenger updated"); fetchSaved(); }
    } else {
      const { error } = await supabase.from("saved_passengers").insert({
        user_id: userId,
        title: currentPax.title,
        first_name: currentPax.firstName,
        last_name: currentPax.lastName,
        dob: currentPax.dob,
        nationality: currentPax.nationality,
        passport_country: currentPax.passportCountry,
        passport_number: currentPax.passportNumber,
        passport_expiry: currentPax.passportExpiry,
        frequent_flyer: currentPax.frequentFlyer,
      });
      if (error) toast.error("Failed to save passenger");
      else { toast.success("Passenger saved"); fetchSaved(); }
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("saved_passengers").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else { setSaved(prev => prev.filter(s => s.id !== id)); toast.success("Deleted"); }
  };

  if (!userId) return null;

  return (
    <div className={cn("flex items-center gap-2", showSaveButton && "flex-wrap")}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
      >
        <Users className="w-3.5 h-3.5" />
        Saved Passengers
      </Button>

      {showSaveButton && currentPax.firstName && currentPax.lastName && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSaveCurrent}
          className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
        >
          <Save className="w-3.5 h-3.5" />
          Save This Passenger
        </Button>
      )}

      {!showSaveButton && currentPax.firstName && currentPax.lastName && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSaveCurrent}
          className="text-xs gap-1.5 text-muted-foreground hover:text-primary"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Saved Passengers
            </DialogTitle>
            <DialogDescription>
              Select a passenger to auto-fill the form
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[360px] overflow-y-auto space-y-2 py-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : saved.length === 0 ? (
              <div className="text-center py-8">
                <UserPlus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No saved passengers yet</p>
                <p className="text-xs text-muted-foreground mt-1">Fill in passenger details and click "Save" to add them here</p>
              </div>
            ) : (
              <AnimatePresence>
                {saved.map((sp, i) => (
                  <motion.div
                    key={sp.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleSelect(sp)}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {sp.first_name[0]}{sp.last_name[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{sp.title} {sp.first_name} {sp.last_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[sp.nationality, sp.passport_number ? `PP: ${sp.passport_number}` : ""].filter(Boolean).join(" • ") || "No additional info"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive transition-opacity"
                        onClick={(e) => handleDelete(sp.id, e)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
