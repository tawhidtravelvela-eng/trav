import { supabase } from "@/integrations/supabase/client";

// Simple session ID for anonymous tracking
let sessionId: string | null = null;
function getSessionId() {
  if (!sessionId) {
    sessionId = sessionStorage.getItem("hotel_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("hotel_session_id", sessionId);
    }
  }
  return sessionId;
}

interface TrackParams {
  hotelId: string;
  hotelName: string;
  hotelCity: string;
  hotelStars: number;
  action: "view" | "click" | "book";
}

// Fire-and-forget tracking — never blocks UI
export function trackHotelInteraction(params: TrackParams) {
  supabase.functions.invoke("travelvela-hotel-search", {
    body: {
      action: "track",
      hotelId: params.hotelId,
      hotelName: params.hotelName,
      hotelCity: params.hotelCity,
      hotelStars: params.hotelStars,
      trackAction: params.action,
      sessionId: getSessionId(),
    },
  }).catch(() => {}); // silently fail
}
