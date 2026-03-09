import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { CheckCircle2, TrendingUp, TrendingDown, ArrowRight, XCircle, ShieldCheck, Plane, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export type FareVerificationState =
  | { status: "verifying" }
  | { status: "verified"; onProceed: () => void }
  | { status: "price_changed"; type: "increased" | "decreased"; oldPrice: string; newPrice: string; diff: string; onProceed: () => void; onSearchAgain?: () => void }
  | { status: "unavailable"; message?: string; onSearchAgain?: () => void }
  | null;

interface FareVerificationDialogProps {
  state: FareVerificationState;
  onClose: () => void;
}

const verifyingSteps = [
  "Connecting to airline…",
  "Checking seat availability…",
  "Verifying latest pricing…",
  "Almost done…",
];

const FareVerificationDialog = ({ state, onClose }: FareVerificationDialogProps) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (state?.status !== "verifying") {
      setStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setStepIndex(prev => (prev < verifyingSteps.length - 1 ? prev + 1 : prev));
    }, 1800);
    return () => clearInterval(interval);
  }, [state?.status]);

  if (!state) return null;

  // Verifying overlay
  if (state.status === "verifying") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-card rounded-2xl shadow-2xl border border-border/80 max-w-sm w-full mx-4 overflow-hidden"
        >
          <div className="h-1 bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: "0%" }}
              animate={{ width: "90%" }}
              transition={{ duration: 8, ease: "easeOut" }}
            />
          </div>

          <div className="p-8 text-center">
            <div className="relative w-20 h-20 mx-auto mb-5">
              <div className="absolute inset-0 rounded-full bg-primary/5" />
              <motion.div
                className="absolute inset-1 rounded-full border-[3px] border-primary/30 border-t-primary"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                  <motion.div
                    className="absolute -top-1 -right-1"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Plane className="w-3.5 h-3.5 text-primary rotate-[-30deg]" />
                  </motion.div>
                </div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-foreground mb-2">Verifying Your Fare</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Please wait while we confirm the latest price and availability with the airline.
            </p>

            <div className="space-y-2">
              {verifyingSteps.map((step, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: i <= stepIndex ? 1 : 0.3, x: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.3 }}
                  className="flex items-center gap-2.5 text-left"
                >
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-300",
                    i < stepIndex ? "bg-emerald-500/15" : i === stepIndex ? "bg-primary/15" : "bg-muted"
                  )}>
                    {i < stepIndex ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : i === stepIndex ? (
                      <motion.div
                        className="w-2 h-2 rounded-full bg-primary"
                        animate={{ scale: [1, 1.4, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs transition-colors duration-300",
                    i < stepIndex ? "text-emerald-600 font-medium" : i === stepIndex ? "text-foreground font-medium" : "text-muted-foreground/50"
                  )}>
                    {step}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Verified successfully — auto-proceed
  if (state.status === "verified") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          onAnimationComplete={() => {
            setTimeout(() => { state.onProceed(); }, 1200);
          }}
          className="bg-card rounded-2xl shadow-2xl border border-emerald-500/20 max-w-sm w-full mx-4 overflow-hidden"
        >
          <div className="h-1 bg-emerald-500" />
          <div className="p-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
              className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4"
            >
              <CheckCircle2 className="w-9 h-9 text-emerald-500" />
            </motion.div>
            <h3 className="text-lg font-bold text-foreground mb-1">Fare Verified ✓</h3>
            <p className="text-sm text-muted-foreground">Price confirmed. Redirecting to booking…</p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Fare unavailable
  if (state.status === "unavailable") {
    const handleSearchAgain = () => {
      if (state.onSearchAgain) state.onSearchAgain();
      onClose();
    };
    const handleDismiss = () => onClose();

    return (
      <AlertDialog open onOpenChange={() => handleDismiss()}>
        <AlertDialogContent className="max-w-md border-destructive/20">
          <AlertDialogHeader className="text-center sm:text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-3"
            >
              <XCircle className="w-9 h-9 text-destructive" />
            </motion.div>
            <AlertDialogTitle className="text-xl">Fare No Longer Available</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {state.message || "This fare is no longer available. The airline may have sold out or updated pricing."}
                </p>
                <div className="bg-muted/50 rounded-xl p-4 border border-border/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Search className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground text-left">
                    Click "Search Again" to refresh and find the latest fares, or close to continue browsing.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <AlertDialogCancel onClick={handleDismiss} className="flex-1 h-11 rounded-xl">
              Close
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSearchAgain}
              className="flex-1 px-10 h-11 text-sm font-semibold rounded-xl"
            >
              <Search className="w-4 h-4 mr-2" />
              Search Again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // Price changed — redesigned premium popup
  if (state.status === "price_changed") {
    const isIncrease = state.type === "increased";

    return (
      <AlertDialog open onOpenChange={() => onClose()}>
        <AlertDialogContent className="max-w-[420px] p-0 gap-0 border-0 overflow-hidden rounded-2xl shadow-2xl">
          {/* Top accent gradient bar */}
          <div className={cn(
            "h-1.5",
            isIncrease
              ? "bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500"
              : "bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500"
          )} />

          <div className="p-6 pb-0">
            <AlertDialogHeader className="text-center sm:text-center space-y-4">
              {/* Animated icon with double ring */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 180, damping: 14 }}
                className="mx-auto relative"
              >
                <div className={cn(
                  "w-[72px] h-[72px] rounded-full flex items-center justify-center relative",
                  isIncrease ? "bg-amber-500/8" : "bg-emerald-500/8"
                )}>
                  <div className={cn(
                    "absolute inset-1 rounded-full border-2 border-dashed",
                    isIncrease ? "border-amber-400/30" : "border-emerald-400/30"
                  )} />
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    isIncrease
                      ? "bg-gradient-to-br from-amber-400/20 to-orange-500/20"
                      : "bg-gradient-to-br from-emerald-400/20 to-teal-500/20"
                  )}>
                    {isIncrease ? (
                      <AlertTriangle className="w-6 h-6 text-amber-500" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-emerald-500" />
                    )}
                  </div>
                </div>

                {/* Floating badge */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className={cn(
                    "absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase whitespace-nowrap",
                    isIncrease
                      ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25"
                      : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                  )}
                >
                  {isIncrease ? "Price Updated" : "Lower Price!"}
                </motion.div>
              </motion.div>

              <div className="pt-2">
                <AlertDialogTitle className="text-xl font-extrabold tracking-tight text-foreground">
                  {isIncrease ? "Fare Has Changed" : "Great News — Price Dropped!"}
                </AlertDialogTitle>
              </div>

              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {isIncrease
                      ? "The airline updated this fare since your search. Review the new price below."
                      : "The fare decreased since your search. You'll save more on this booking!"}
                  </p>

                  {/* Price comparison — glass card */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.4 }}
                    className={cn(
                      "rounded-2xl border overflow-hidden",
                      isIncrease ? "border-amber-200/50 dark:border-amber-500/20" : "border-emerald-200/50 dark:border-emerald-500/20"
                    )}
                  >
                    <div className="flex items-stretch">
                      {/* Old price */}
                      <div className="flex-1 p-4 text-center bg-muted/40 relative">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 font-semibold mb-2">
                          Previous
                        </p>
                        <p className="text-lg font-bold text-muted-foreground/60 line-through decoration-2 decoration-muted-foreground/20">
                          {state.oldPrice}
                        </p>
                      </div>

                      {/* Arrow divider */}
                      <div className="flex items-center justify-center w-12 relative">
                        <div className="absolute inset-y-4 w-px bg-border" />
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center z-10 shadow-sm",
                            isIncrease
                              ? "bg-amber-500 shadow-amber-500/20"
                              : "bg-emerald-500 shadow-emerald-500/20"
                          )}
                        >
                          <ArrowRight className="w-4 h-4 text-white" />
                        </motion.div>
                      </div>

                      {/* New price */}
                      <div className={cn(
                        "flex-1 p-4 text-center relative",
                        isIncrease ? "bg-amber-50/50 dark:bg-amber-500/5" : "bg-emerald-50/50 dark:bg-emerald-500/5"
                      )}>
                        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70 font-semibold mb-2">
                          Updated
                        </p>
                        <p className={cn(
                          "text-lg font-extrabold",
                          isIncrease ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                        )}>
                          {state.newPrice}
                        </p>
                      </div>
                    </div>

                    {/* Diff strip */}
                    <div className={cn(
                      "px-4 py-2.5 text-center text-xs font-bold tracking-wide flex items-center justify-center gap-1.5",
                      isIncrease
                        ? "bg-amber-100/80 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                        : "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    )}>
                      {isIncrease ? (
                        <>
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>{state.diff} increase</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>{state.diff} savings</span>
                        </>
                      )}
                    </div>
                  </motion.div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          {/* Footer actions */}
          <div className="p-6 pt-5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <AlertDialogCancel
                onClick={() => {
                  if (state.onSearchAgain) {
                    state.onSearchAgain();
                  } else {
                    onClose();
                  }
                }}
                className="flex-1 h-12 rounded-xl border-border/60 font-semibold text-sm hover:bg-muted/80 transition-colors"
              >
                Search Again
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={state.onProceed}
                className={cn(
                  "flex-1 h-12 rounded-xl font-bold text-sm text-white transition-all shadow-lg",
                  isIncrease
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/20"
                    : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-emerald-500/20"
                )}
              >
                {isIncrease ? `Continue • ${state.newPrice}` : `Book Now • ${state.newPrice}`}
              </AlertDialogAction>
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center mt-3">
              {isIncrease
                ? "Fares may change again — book soon to lock in this price."
                : "This lower fare is subject to availability."}
            </p>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return null;
};

export default FareVerificationDialog;
