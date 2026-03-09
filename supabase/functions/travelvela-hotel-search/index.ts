// TravelVela Hotel search edge function
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function getCredentials() {
  const authToken = Deno.env.get("TRAVELVELA_AUTH_TOKEN");
  const username = Deno.env.get("TRAVELVELA_USERNAME");
  const password = Deno.env.get("TRAVELVELA_PASSWORD");
  if (!authToken || !username || !password) throw new Error("TravelVela API credentials not configured");
  return { authToken, username, password };
}

function tvHeaders(creds: ReturnType<typeof getCredentials>) {
  return {
    Authorization: creds.authToken,
    username: creds.username,
    password: creds.password,
    Accept: "application/json",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const creds = getCredentials();
    const body = await req.json();
    const { action } = body;

    // ── Test connectivity ──
    if (action === "test" || body.test) {
      const formData = new FormData();
      formData.append("keyword", "Dubai");
      const res = await fetch("https://admin.travelvela.com/api/search/hotel/locations", {
        method: "POST",
        headers: { Authorization: creds.authToken, username: creds.username, password: creds.password },
        body: formData,
      });
      if (!res.ok) throw new Error(`TravelVela hotel test failed: ${res.status}`);
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, message: "TravelVela Hotel API credentials valid", data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Search hotel locations ──
    if (action === "search-locations") {
      const { keyword } = body;
      if (!keyword) {
        return new Response(JSON.stringify({ success: false, error: "Missing keyword" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const formData = new FormData();
      formData.append("keyword", keyword);
      const res = await fetch("https://admin.travelvela.com/api/search/hotel/locations", {
        method: "POST",
        headers: { Authorization: creds.authToken, username: creds.username, password: creds.password },
        body: formData,
      });
      if (!res.ok) throw new Error(`Location search failed: ${res.status}`);
      const data = await res.json();
      const locations = data?.data || data?.locations || (Array.isArray(data) ? data : []);
      return new Response(JSON.stringify({ success: true, locations }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Featured hotels ──
    if (action === "featured") {
      const res = await fetch("https://admin.travelvela.com/api/featured/hotels", {
        method: "GET",
        headers: tvHeaders(creds),
      });
      if (!res.ok) throw new Error(`Featured hotels failed: ${res.status}`);
      const data = await res.json();
      const hotels = data?.data || [];
      return new Response(JSON.stringify({ success: true, hotels }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Track hotel interaction ──
    if (action === "track") {
      const { hotelId, hotelName, hotelCity, hotelStars, trackAction, sessionId, userId } = body;
      if (!hotelId || !trackAction) {
        return new Response(JSON.stringify({ success: false, error: "Missing hotelId or trackAction" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const sb = getSupabaseAdmin();
        await sb.from('hotel_interactions').insert({
          hotel_id: hotelId,
          hotel_name: hotelName || '',
          city: hotelCity || '',
          stars: hotelStars || 0,
          action: trackAction,
          session_id: sessionId || null,
          user_id: userId || null,
        });
      } catch (e) {
        console.error("Track insert failed:", e);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Search hotels ──
    if (action === "search") {
      const { checkinDate, checkoutDate, locationId, ratings, roomInfo, limit } = body;
      const maxResults = typeof limit === "number" && limit > 0 ? limit : 50;
      if (!checkinDate || !checkoutDate || !locationId) {
        return new Response(JSON.stringify({ success: false, error: "Missing required search parameters (checkinDate, checkoutDate, locationId)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build as FormData — TravelVela expects form-encoded fields with nested array notation
      const formData = new FormData();
      formData.append("checkin_date", checkinDate);
      formData.append("checkout_date", checkoutDate);
      formData.append("location_id", String(locationId));
      
      const ratingsArr = ratings || [0, 1, 2, 3, 4, 5];
      ratingsArr.forEach((r: number, i: number) => {
        formData.append(`ratings[${i}]`, String(r));
      });

      // room_info as indexed array: room_info[0][adults]=1, room_info[0][child]=0
      const rooms = Array.isArray(roomInfo) ? roomInfo : [roomInfo || { adults: 1, child: 0 }];
      rooms.forEach((room: any, i: number) => {
        formData.append(`room_info[${i}][adults]`, String(room.adults || 1));
        formData.append(`room_info[${i}][child]`, String(room.child || 0));
      });

      console.log("TravelVela hotel search: location_id=", locationId, "checkin=", checkinDate, "checkout=", checkoutDate, "rooms=", rooms.length);

      const res = await fetch("https://admin.travelvela.com/api/search/hotels", {
        method: "POST",
        headers: {
          Authorization: creds.authToken,
          username: creds.username,
          password: creds.password,
        },
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("TravelVela hotel search error:", res.status, errText.substring(0, 500));
        return new Response(JSON.stringify({ success: true, hotels: [], count: 0, note: `Upstream returned ${res.status}`, debug: errText.substring(0, 300) }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const searchData = await res.json();
      console.log("TravelVela hotel search response keys:", Object.keys(searchData));

      // Normalize response
      let rawHotels: any[] = [];
      if (Array.isArray(searchData?.data)) {
        rawHotels = searchData.data;
      } else if (searchData?.data?.data && Array.isArray(searchData.data.data)) {
        rawHotels = searchData.data.data;
      } else if (Array.isArray(searchData)) {
        rawHotels = searchData;
      }

      // Log room count and sample for debugging
      if (rawHotels.length > 0) {
        const sample = rawHotels[0];
        console.log("Sample raw hotel keys:", Object.keys(sample));
        if (sample.available_rooms) {
          const isArray = Array.isArray(sample.available_rooms);
          const roomCount = isArray ? sample.available_rooms.length : Object.keys(sample.available_rooms).length;
          console.log(`available_rooms type=${isArray ? 'array' : 'object'}, count=${roomCount}`);
          const firstRoom = isArray ? sample.available_rooms[0] : Object.values(sample.available_rooms)[0];
          console.log("Sample room:", JSON.stringify(firstRoom).substring(0, 500));
        }
      }

      // Map all raw hotels first, then score & sort
      const allMapped = rawHotels.map((h: any, idx: number) => {
        let lowestPrice = 0;
        let currency = "BDT";
        if (h.available_rooms) {
          const roomsArr = Array.isArray(h.available_rooms) ? h.available_rooms : Object.values(h.available_rooms || {});
          for (const room of roomsArr) {
            const r = room as any;
            const roomPrice = r.price || r.total_price || r.rate || r.total || r.discount_price || 0;
            const p = typeof roomPrice === "number" ? roomPrice : parseFloat(String(roomPrice)) || 0;
            if (p > 0 && (lowestPrice === 0 || p < lowestPrice)) {
              lowestPrice = p;
              currency = r.currency || h.currency || "BDT";
            }
          }
        }

        const stars = Number(h.rating || h.stars || h.star_rating || 0);
        const imageCount = (h.images || []).length;
        const roomCount = Array.isArray(h.available_rooms) ? h.available_rooms.length : Object.keys(h.available_rooms || {}).length;
        const propType = (h.type || h.property_type || "hotel").toLowerCase();

        // Base score from heuristics
        let score = stars * 10;
        score += Math.min(imageCount, 15);
        score += Math.min(roomCount * 5, 10);
        if (propType === "hotel") score += 5;
        if (propType === "resort") score += 8;
        const nameLower = (h.hotel_name || h.name || "").toLowerCase();
        const chainKeywords = ["marriott", "hilton", "hyatt", "radisson", "sheraton", "taj", "oberoi", "itc", "novotel", "ibis", "holiday inn", "crowne plaza", "westin", "le meridien", "jw ", "ritz", "four seasons", "intercontinental", "accor", "best western", "ramada", "wyndham", "sofitel"];
        if (chainKeywords.some(kw => nameLower.includes(kw))) score += 15;
        if (lowestPrice > 0 && lowestPrice < 500) score -= 5;

        const hotelId = h.hotel_id || h.id || `tv-hotel-${idx}`;

        return {
          id: hotelId,
          name: h.hotel_name || h.name || "Unknown Hotel",
          city: h.city || h.location || "",
          country: h.country || "",
          address: h.address || "",
          stars,
          rating: h.user_rating || h.review_rating || h.rating || 0,
          price: lowestPrice,
          currency,
          image: h.images?.[0] || h.image || h.thumbnail || null,
          images: h.images || (h.image ? [h.image] : []),
          amenities: h.amenities || h.facilities || [],
          propertyType: h.type || h.property_type || "Hotel",
          latitude: h.latitude || h.lat || null,
          longitude: h.longitude || h.lng || h.lon || null,
          source: "travelvela",
          availableRooms: Array.isArray(h.available_rooms) ? h.available_rooms : Object.values(h.available_rooms || {}),
          _score: score,
        };
      });

      // Boost scores with real user interaction data from hotel_popularity
      try {
        const sb = getSupabaseAdmin();
        const { data: popData } = await sb.rpc('get_hotel_popularity_scores', {});
        // Fallback: direct query if rpc doesn't exist
        let popularityMap: Record<string, number> = {};
        if (popData && Array.isArray(popData)) {
          for (const p of popData) {
            popularityMap[p.hotel_id] = p.popularity_score || 0;
          }
        } else {
          // Query directly
          const { data: intData } = await sb.from('hotel_interactions')
            .select('hotel_id')
            .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
          if (intData) {
            const counts: Record<string, { view: number; click: number; book: number }> = {};
            for (const row of intData) {
              if (!counts[row.hotel_id]) counts[row.hotel_id] = { view: 0, click: 0, book: 0 };
              counts[row.hotel_id].view++;
            }
            for (const [hid, c] of Object.entries(counts)) {
              popularityMap[hid] = c.view + c.click * 5 + c.book * 20;
            }
          }
        }
        // Apply popularity boost (up to 30 points for most interacted hotels)
        const maxPop = Math.max(...Object.values(popularityMap), 1);
        for (const hotel of allMapped) {
          const pop = popularityMap[hotel.id] || 0;
          hotel._score += Math.round((pop / maxPop) * 30);
        }
        console.log(`Applied popularity boost from ${Object.keys(popularityMap).length} tracked hotels`);
      } catch (popErr) {
        console.log("Popularity data not available yet, using heuristics only:", popErr);
      }

      // AI re-ranking for top candidates using Gemini
      try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (LOVABLE_API_KEY && allMapped.length > 5) {
          // Send top 30 hotels for AI re-scoring
          const candidates = allMapped
            .sort((a, b) => b._score - a._score)
            .slice(0, 30)
            .map((h, i) => ({ idx: i, name: h.name, stars: h.stars, price: h.price, type: h.propertyType, city: h.city }));

          const aiPrompt = `You are a hotel recommendation engine. Given these ${candidates.length} hotels for a search in "${rawHotels[0]?.city || ''}", rank the top 10 by purchase likelihood. Consider: brand recognition, star rating, value for money, and typical traveler preferences. Return ONLY a JSON array of indices (0-based) in order of recommendation, e.g. [3,0,7,1,...]. No explanation.

Hotels: ${JSON.stringify(candidates)}`;

          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [{ role: "user", content: aiPrompt }],
              temperature: 0.1,
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            // Extract JSON array from response
            const match = content.match(/\[[\d,\s]+\]/);
            if (match) {
              const aiRanking: number[] = JSON.parse(match[0]);
              // Apply AI boost: first gets +25, second +22, etc.
              const topCandidateIds = candidates.map(c => allMapped.sort((a, b) => b._score - a._score)[c.idx]?.id);
              for (let r = 0; r < Math.min(aiRanking.length, 15); r++) {
                const candidateIdx = aiRanking[r];
                if (candidateIdx >= 0 && candidateIdx < candidates.length) {
                  const hotelId = topCandidateIds[candidateIdx];
                  const hotel = allMapped.find(h => h.id === hotelId);
                  if (hotel) {
                    hotel._score += Math.max(25 - r * 2, 5);
                  }
                }
              }
              console.log(`AI re-ranked top ${aiRanking.length} hotels`);
            }
          }
        }
      } catch (aiErr) {
        console.log("AI re-ranking skipped:", aiErr);
      }

      // Final sort by combined score
      allMapped.sort((a, b) => b._score - a._score);
      const hotels = allMapped.slice(0, maxResults).map(({ _score, ...rest }) => rest);

      console.log(`Sorted ${allMapped.length} hotels. Top 5: ${allMapped.slice(0, 5).map(h => `${h.name}(${h._score})`).join(", ")}`);

      return new Response(JSON.stringify({ success: true, hotels, count: hotels.length, totalAvailable: rawHotels.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("TravelVela hotel function error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
