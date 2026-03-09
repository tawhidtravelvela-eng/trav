import heroBg from "@/assets/hero-beach.jpg";
import destParis from "@/assets/dest-paris.jpg";
import destTokyo from "@/assets/dest-tokyo.jpg";
import destBali from "@/assets/dest-bali.jpg";
import destDubai from "@/assets/dest-dubai.jpg";
import destSantorini from "@/assets/dest-santorini.jpg";
import destNewYork from "@/assets/dest-newyork.jpg";

export const images: Record<string, string> = {
  "hero-beach": heroBg,
  "dest-paris": destParis,
  "dest-tokyo": destTokyo,
  "dest-bali": destBali,
  "dest-dubai": destDubai,
  "dest-santorini": destSantorini,
  "dest-newyork": destNewYork,
};

export const getImage = (key: string) => images[key] || "";
