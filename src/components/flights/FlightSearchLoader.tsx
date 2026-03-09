import { motion } from "framer-motion";
import { Plane, Globe, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

const messages = [
  "Searching airlines worldwide…",
  "Comparing fares across providers…",
  "Finding the best deals for you…",
  "Checking seat availability…",
  "Almost there…",
];

export default function FlightSearchLoader() {
  const [msgIndex, setMsgIndex] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 2800);
    const dotTimer = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 500);
    return () => {
      clearInterval(msgTimer);
      clearInterval(dotTimer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 px-4">
      {/* Animated globe + plane */}
      <div className="relative w-40 h-40 mb-8">
        {/* Orbit ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />

        {/* Pulsing globe */}
        <motion.div
          className="absolute inset-6 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Globe className="w-14 h-14 text-primary/30" />
        </motion.div>

        {/* Orbiting plane */}
        <motion.div
          className="absolute w-10 h-10"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{ top: "50%", left: "50%", transformOrigin: "-30px -30px" }}
        >
          <div className="w-10 h-10 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center">
            <Plane className="w-5 h-5 text-primary-foreground -rotate-45" />
          </div>
        </motion.div>

        {/* Sparkle accents */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: `${20 + i * 25}%`,
              left: `${i === 1 ? 85 : i === 0 ? 10 : 75}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.7,
              ease: "easeInOut",
            }}
          >
            <Sparkles className="w-4 h-4 text-accent" />
          </motion.div>
        ))}
      </div>

      {/* Search icon pulse */}
      <motion.div
        className="flex items-center gap-2 mb-4"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Search className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-primary tracking-wide uppercase">
          Searching
          {".".repeat(dots)}
        </span>
      </motion.div>

      {/* Rotating messages */}
      <div className="h-6 overflow-hidden">
        <motion.p
          key={msgIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
          className="text-sm text-muted-foreground text-center"
        >
          {messages[msgIndex]}
        </motion.p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 mt-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-primary/30"
            animate={{
              backgroundColor: [
                "hsl(var(--primary) / 0.2)",
                "hsl(var(--primary) / 1)",
                "hsl(var(--primary) / 0.2)",
              ],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
