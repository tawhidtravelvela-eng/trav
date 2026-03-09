import { motion, AnimatePresence } from "framer-motion";
import { Plane, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type BookingModalStatus = "booking" | "success" | "failed" | null;

interface BookingProgressModalProps {
  status: BookingModalStatus;
  pnr?: string | null;
  errorMessage?: string;
  onClose?: () => void;
}

const BookingProgressModal = ({ status, pnr, errorMessage, onClose }: BookingProgressModalProps) => {
  if (!status) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={status !== "booking" ? onClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-[90vw] max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Decorative top accent */}
          <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-primary via-primary/60 to-primary" />

          <div className="flex flex-col items-center text-center gap-5">
            {/* Icon area */}
            <div className="relative">
              {status === "booking" && (
                <motion.div
                  className="relative flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15 }}
                >
                  {/* Pulsing ring */}
                  <motion.div
                    className="absolute h-20 w-20 rounded-full border-2 border-primary/30"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="absolute h-20 w-20 rounded-full border-2 border-primary/20"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                  />
                  {/* Center icon */}
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    >
                      <Loader2 className="h-8 w-8 text-primary" />
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {status === "success" && (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10"
                >
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </motion.div>
              )}

              {status === "failed" && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
                >
                  <XCircle className="h-10 w-10 text-destructive" />
                </motion.div>
              )}
            </div>

            {/* Animated plane for booking state */}
            {status === "booking" && (
              <div className="w-full overflow-hidden py-2">
                <motion.div
                  animate={{ x: ["-10%", "110%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="flex items-center"
                >
                  <Plane className="h-5 w-5 text-primary -rotate-12" />
                </motion.div>
                <div className="mt-1 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
              </div>
            )}

            {/* Text content */}
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">
                {status === "booking" && "Creating Your Booking"}
                {status === "success" && "Booking Confirmed!"}
                {status === "failed" && "Booking Failed"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {status === "booking" && "Please wait while we confirm your reservation with the airline. This may take a moment..."}
                {status === "success" && (
                  <>
                    Your PNR has been created successfully.
                    {pnr && (
                      <span className="mt-2 block">
                        <span className="text-xs text-muted-foreground">PNR Reference</span>
                        <br />
                        <span className="font-mono text-base font-bold tracking-wider text-primary">{pnr}</span>
                      </span>
                    )}
                  </>
                )}
                {status === "failed" && (errorMessage || "We couldn't confirm your booking with the airline. Please try again or contact support.")}
              </p>
            </div>

            {/* Action buttons for terminal states */}
            {status === "success" && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-xs text-muted-foreground"
              >
                Proceeding to payment...
              </motion.p>
            )}

            {status === "failed" && onClose && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={onClose}
                className="mt-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg"
              >
                Try Again
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BookingProgressModal;
export type { BookingModalStatus };
