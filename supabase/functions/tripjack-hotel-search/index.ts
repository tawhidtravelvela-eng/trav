// Tripjack Hotel API v3 edge function (pre-production)
// Routes through proxy: http://65.20.67.77/tj-pre/ → apitest.tripjack.com
// Proxy injects the apikey header automatically
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

const PROXY_BASE = "http://65.20.67.77/tj-pre";

async function getConfig() {
  const proxySecret = Deno.env.get("PROXY_SECRET_KEY");
  if (!proxySecret) throw new Error("PROXY_SECRET_KEY not configured");
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("api_settings").select("is_active").eq("provider", "tripjack_hotel").maybeSingle();
  return { isActive: data?.is_active ?? false, proxySecret };
}

async function tjFetch(path: string, options: { method: string; body?: string }, proxySecret: string): Promise<Response> {
  const url = `${PROXY_BASE}${path}`;
  console.log(`tjFetch: ${options.method} ${url}`);
  const headers: Record<string, string> = { "x-vela-key": proxySecret };
  if (options.body) headers["Content-Type"] = "application/json";
  return fetch(url, { method: options.method, headers, body: options.body });
}

function generateCorrelationId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 22);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { action } = body;
    const config = await getConfig();

    if (!config.isActive && action !== "test" && action !== "sync-hotels") {
      return new Response(JSON.stringify({ success: false, error: "Tripjack Hotel API is not active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Test connectivity ──
    if (action === "test") {
      try {
        const res = await tjFetch("/hms/v3/fetch-static-hotels", {
          method: "POST",
          body: JSON.stringify({}),
        }, config.proxySecret);
        const status = res.status;
        const text = await res.text();
        return new Response(JSON.stringify({ success: status === 200, status, preview: text.substring(0, 500), proxy: PROXY_BASE }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ══════════════════════════════════════════════════════════
    // STEP 1: LISTING — Search hotels by city using hids from catalogue
    // v3 removed cityCode search; we must pass hids (hotel IDs)
    // ══════════════════════════════════════════════════════════
    if (action === "search") {
      const { checkinDate, checkoutDate, checkIn, checkOut, roomInfo, cityId, cityName, nationality, ratings, hids: providedHids } = body;

      const ciDate = checkinDate || checkIn;
      const coDate = checkoutDate || checkOut;

      if (!ciDate || !coDate) {
        return new Response(JSON.stringify({ success: false, error: "Missing check-in/check-out dates" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build v3 rooms format
      const rooms = Array.isArray(roomInfo) ? roomInfo : [{ adults: 2 }];
      const v3Rooms = rooms.map((r: any) => {
        const obj: any = { adults: r.adults || r.numberOfAdults || 2 };
        const childCount = r.child || r.numberOfChild || r.children || 0;
        if (childCount > 0) {
          obj.children = childCount;
          if (r.childAge) obj.childAge = r.childAge;
        }
        return obj;
      });

      // Get hotel IDs from our catalogue for this city
      let hotelIds: number[] = providedHids || [];

      if (hotelIds.length === 0 && cityName) {
        const sb = getSupabaseAdmin();
        const { data: hotels, error } = await sb
          .from("tripjack_hotels")
          .select("tj_hotel_id")
          .eq("is_deleted", false)
          .ilike("city_name", `%${cityName.trim()}%`)
          .limit(100);

        if (error) {
          console.error("DB lookup error:", error.message);
        }

        if (hotels && hotels.length > 0) {
          hotelIds = hotels.map((h: any) => parseInt(h.tj_hotel_id)).filter((id: number) => !isNaN(id));
          console.log(`Found ${hotelIds.length} hotel IDs for "${cityName}" from catalogue`);
        }
      }

      if (hotelIds.length === 0) {
        return new Response(JSON.stringify({
          success: true, hotels: [], count: 0,
          note: `No hotels found in catalogue for "${cityName || 'unknown'}". Run sync-hotels to populate.`,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // v3 Listing API — max 100 hids per request
      const correlationId = generateCorrelationId();
      const listingPayload = {
        checkIn: ciDate,
        checkOut: coDate,
        rooms: v3Rooms,
        currency: "INR",
        correlationId,
        hids: hotelIds.slice(0, 100),
      };

      console.log(`v3 Listing: ${hotelIds.length} hids, correlationId=${correlationId}`);
      console.log("Listing payload:", JSON.stringify(listingPayload).substring(0, 800));

      const listRes = await tjFetch("/hms/v3/hotel/listing", {
        method: "POST",
        body: JSON.stringify(listingPayload),
      }, config.proxySecret);

      const listText = await listRes.text();
      console.log(`Listing response (${listRes.status}): ${listText.substring(0, 1000)}`);

      if (!listRes.ok) {
        return new Response(JSON.stringify({
          success: true, hotels: [], count: 0,
          note: `Listing API returned ${listRes.status}`,
          debug: listText.substring(0, 300),
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let listData: any;
      try {
        listData = JSON.parse(listText);
      } catch {
        return new Response(JSON.stringify({
          success: true, hotels: [], count: 0,
          note: "Invalid JSON from listing API",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!listData?.status?.success) {
        const errMsg = listData?.error?.message || "Listing failed";
        console.error("Listing error:", errMsg);
        return new Response(JSON.stringify({
          success: true, hotels: [], count: 0,
          note: errMsg,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hotelResults = listData?.hotels || [];
      const searchId = listData?.searchId || correlationId;
      console.log(`Listing returned ${hotelResults.length} hotels (total: ${listData?.totalResults || 0})`);

      // Enrich with static data from DB
      const sb = getSupabaseAdmin();
      const tjIds = hotelResults.map((h: any) => String(h.tjHotelId));
      const { data: staticData } = tjIds.length > 0
        ? await sb.from("tripjack_hotels").select("*").in("tj_hotel_id", tjIds)
        : { data: [] };
      const staticMap: Record<string, any> = {};
      for (const s of (staticData || [])) {
        staticMap[s.tj_hotel_id] = s;
      }

      // Map v3 response to normalized output
      const mappedHotels = hotelResults.map((h: any) => {
        const static_ = staticMap[String(h.tjHotelId)] || {};
        let lowestPrice = 0;
        let mealBasis = "";
        let isRefundable = false;
        const availableRooms: any[] = [];

        for (const opt of (h.options || [])) {
          const price = opt.pricing?.totalPrice || 0;
          if (price > 0 && (lowestPrice === 0 || price < lowestPrice)) {
            lowestPrice = price;
            mealBasis = opt.mealBasis || "Room Only";
            isRefundable = opt.cancellation?.isRefundable || false;
          }
          availableRooms.push({
            optionId: opt.optionId || "",
            optionType: opt.optionType || "",
            price: Math.round(opt.pricing?.totalPrice || 0),
            mealBasis: opt.mealBasis || "Room Only",
            isRefundable: opt.cancellation?.isRefundable || false,
            roomLeft: opt.roomLeft,
            roomInfo: opt.roomInfo || [],
          });
        }

        return {
          id: `tj-${h.tjHotelId}`,
          tjHotelId: String(h.tjHotelId),
          name: h.name || static_.name || "Unknown Hotel",
          city: static_.city_name || cityName || "",
          country: static_.country_name || "",
          address: static_.address || "",
          stars: static_.rating || 0,
          rating: static_.rating || 0,
          price: Math.round(lowestPrice),
          currency: listData?.currency || "INR",
          image: static_.image_url || null,
          images: static_.image_url ? [static_.image_url] : [],
          amenities: [],
          propertyType: static_.property_type || "Hotel",
          latitude: static_.latitude || null,
          longitude: static_.longitude || null,
          source: "tripjack",
          searchId,
          correlationId,
          mealBasis,
          isRefundable,
          availableRooms,
        };
      });

      return new Response(JSON.stringify({
        success: true,
        hotels: mappedHotels,
        count: mappedHotels.length,
        totalResults: listData?.totalResults || mappedHotels.length,
        searchId,
        correlationId,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════
    // STEP 2: DYNAMIC DETAIL — All options for one hotel
    // ══════════════════════════════════════════════════════════
    if (action === "detail") {
      const { hotelId, checkinDate, checkoutDate, checkIn, checkOut, roomInfo, correlationId: inCorrelationId } = body;
      if (!hotelId) {
        return new Response(JSON.stringify({ success: false, error: "Missing hotelId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tjId = hotelId.replace(/^tj-/, "");
      const ciDate = checkinDate || checkIn;
      const coDate = checkoutDate || checkOut;

      if (!ciDate || !coDate) {
        // Return static detail only from DB
        const sb = getSupabaseAdmin();
        const { data: staticHotel } = await sb.from("tripjack_hotels").select("*").eq("tj_hotel_id", tjId).maybeSingle();

        // Also try v3 static-detail API
        const res = await tjFetch("/hms/v3/hotel/static-detail", {
          method: "POST",
          body: JSON.stringify({ hid: tjId }),
        }, config.proxySecret);

        let apiDetail: any = null;
        if (res.ok) {
          apiDetail = await res.json();
        } else {
          await res.text(); // consume body
        }

        const images: string[] = [];
        if (apiDetail?.images) {
          for (const img of apiDetail.images) {
            const links = img.links || {};
            const sizes = Object.keys(links).sort((a, b) => parseInt(b) - parseInt(a));
            if (sizes.length > 0) images.push(links[sizes[0]].href);
          }
        }
        if (images.length === 0 && staticHotel?.image_url) images.push(staticHotel.image_url);

        return new Response(JSON.stringify({
          success: true,
          hotel: {
            id: `tj-${tjId}`,
            tjHotelId: tjId,
            name: apiDetail?.name || staticHotel?.name || "",
            city: staticHotel?.city_name || "",
            country: staticHotel?.country_name || "",
            address: apiDetail?.locale?.address?.fulladdr || staticHotel?.address || "",
            stars: parseInt(apiDetail?.star_rating || "0") || staticHotel?.rating || 0,
            images,
            amenities: apiDetail?.amenities ? Object.values(apiDetail.amenities).map((a: any) => a.name) : [],
            descriptions: apiDetail?.descriptions || {},
            policies: apiDetail?.policies || {},
            rooms: apiDetail?.rooms || {},
            propertyType: apiDetail?.property_type?.name || staticHotel?.property_type || "Hotel",
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dynamic detail with live pricing
      const rooms = Array.isArray(roomInfo) ? roomInfo : [{ adults: 2 }];
      const v3Rooms = rooms.map((r: any) => {
        const obj: any = { adults: r.adults || 2 };
        const childCount = r.child || r.children || 0;
        if (childCount > 0) {
          obj.children = childCount;
          if (r.childAge) obj.childAge = r.childAge;
        }
        return obj;
      });

      const correlationId = inCorrelationId || generateCorrelationId();
      const detailPayload = {
        correlationId,
        hid: tjId,
        checkIn: ciDate,
        checkOut: coDate,
        rooms: v3Rooms,
        currency: "INR",
      };

      console.log("v3 dynamic-detail:", JSON.stringify(detailPayload));

      const res = await tjFetch("/hms/v3/hotel/dynamic-detail", {
        method: "POST",
        body: JSON.stringify(detailPayload),
      }, config.proxySecret);

      if (!res.ok) {
        const errText = await res.text();
        console.error("v3 dynamic-detail error:", res.status, errText.substring(0, 500));
        return new Response(JSON.stringify({ success: false, error: `Detail failed: ${res.status}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const detailData = await res.json();
      console.log("v3 detail response keys:", Object.keys(detailData));

      if (!detailData?.status?.success) {
        const errCode = detailData?.error?.code || "";
        return new Response(JSON.stringify({ success: false, error: detailData?.error?.message || `Detail error: ${errCode}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get static data for images, amenities etc
      const sb = getSupabaseAdmin();
      const { data: staticHotel } = await sb.from("tripjack_hotels").select("*").eq("tj_hotel_id", tjId).maybeSingle();

      const options = (detailData.options || []).map((opt: any) => ({
        optionId: opt.optionId,
        optionType: opt.optionType,
        roomInfo: opt.roomInfo || [],
        inclusions: opt.inclusions || [],
        mealBasis: opt.mealBasis || "Room Only",
        bookingNotes: opt.bookingNotes || "",
        pricing: opt.pricing || {},
        commercial: opt.commercial || {},
        compliance: opt.compliance || {},
        cancellation: opt.cancellation || {},
        roomLeft: opt.roomLeft,
      }));

      return new Response(JSON.stringify({
        success: true,
        hotel: {
          id: `tj-${detailData.tjHotelId || tjId}`,
          tjHotelId: detailData.tjHotelId || tjId,
          hotelName: detailData.hotelName || staticHotel?.name || "",
          name: detailData.hotelName || staticHotel?.name || "",
          city: staticHotel?.city_name || "",
          country: staticHotel?.country_name || "",
          address: staticHotel?.address || "",
          stars: staticHotel?.rating || 0,
          images: staticHotel?.image_url ? [staticHotel.image_url] : [],
          propertyType: staticHotel?.property_type || "Hotel",
          options,
          correlationId: detailData.correlationId || correlationId,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════
    // STEP 3: REVIEW — Re-validate price + availability
    // ══════════════════════════════════════════════════════════
    if (action === "review") {
      const { optionId, correlationId: inCorrelationId } = body;
      if (!optionId) {
        return new Response(JSON.stringify({ success: false, error: "Missing optionId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const correlationId = inCorrelationId || generateCorrelationId();
      const reviewPayload = {
        correlationId,
        optionId,
        currency: "INR",
      };

      console.log("v3 review:", JSON.stringify(reviewPayload));

      const res = await tjFetch("/hms/v3/hotel/review", {
        method: "POST",
        body: JSON.stringify(reviewPayload),
      }, config.proxySecret);

      if (!res.ok) {
        const errText = await res.text();
        console.error("v3 review error:", res.status, errText.substring(0, 300));
        return new Response(JSON.stringify({ success: false, error: `Review failed: ${res.status}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const reviewData = await res.json();
      console.log("v3 review keys:", Object.keys(reviewData));

      if (!reviewData?.status?.success) {
        const errCode = reviewData?.error?.code || "";
        if (errCode === "OPTION_SOLD_OUT") {
          return new Response(JSON.stringify({ success: false, error: "This room option is no longer available", soldOut: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: false, error: reviewData?.error?.message || "Review failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        correlationId: reviewData.correlationId,
        tjHotelId: reviewData.tjHotelId,
        hotelName: reviewData.hotelName,
        bookingId: reviewData.bookingId,
        option: reviewData.option || {},
        priceChanged: reviewData.priceChanged || false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════
    // STEP 4: BOOK — Commit the booking
    // ══════════════════════════════════════════════════════════
    if (action === "book") {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { bookingId, roomTravellerInfo, deliveryInfo, paymentAmount } = body;
      if (!bookingId || !roomTravellerInfo) {
        return new Response(JSON.stringify({ success: false, error: "Missing booking parameters" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const bookPayload: any = {
        bookingId,
        roomTravellerInfo,
        deliveryInfo: deliveryInfo || {},
        type: "HOTEL",
      };

      // Include paymentInfos for instant booking, omit for hold
      if (paymentAmount) {
        bookPayload.paymentInfos = [{ amount: paymentAmount }];
      }

      const res = await tjFetch("/oms/v3/hotel/book", {
        method: "POST",
        body: JSON.stringify(bookPayload),
      }, config.proxySecret);

      const bookData = await res.json();
      return new Response(JSON.stringify({
        success: bookData?.status?.success || false,
        bookingId: bookData?.bookingId || bookingId,
        data: bookData,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Booking Details ──
    if (action === "booking-details") {
      const { bookingId } = body;
      if (!bookingId) {
        return new Response(JSON.stringify({ success: false, error: "Missing bookingId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await tjFetch("/oms/v3/hotel/booking-details", {
        method: "POST",
        body: JSON.stringify({ bookingId }),
      }, config.proxySecret);

      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Cancel Booking ──
    if (action === "cancel-booking") {
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { bookingId } = body;
      if (!bookingId) {
        return new Response(JSON.stringify({ success: false, error: "Missing bookingId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await tjFetch(`/oms/v3/hotel/cancel-booking/${bookingId}`, {
        method: "POST",
      }, config.proxySecret);

      const data = await res.json();
      return new Response(JSON.stringify({
        success: data?.status?.success || false,
        bookingId,
        data,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Confirm Hold Booking ──
    if (action === "confirm-book") {
      const { bookingId, paymentAmount } = body;
      if (!bookingId || !paymentAmount) {
        return new Response(JSON.stringify({ success: false, error: "Missing bookingId or paymentAmount" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await tjFetch("/oms/v3/hotel/confirm-book", {
        method: "POST",
        body: JSON.stringify({ bookingId, paymentInfos: [{ amount: paymentAmount }] }),
      }, config.proxySecret);

      const data = await res.json();
      return new Response(JSON.stringify({
        success: data?.status?.success || false,
        data,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Search Cities (from catalogue) ──
    if (action === "search-cities") {
      const { keyword } = body;
      if (!keyword) {
        return new Response(JSON.stringify({ success: false, error: "Missing keyword" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sb = getSupabaseAdmin();
      const { data: hotels } = await sb
        .from("tripjack_hotels")
        .select("city_name, country_name")
        .eq("is_deleted", false)
        .ilike("city_name", `%${keyword.trim()}%`)
        .limit(200);

      // Deduplicate by city_name
      const cityMap = new Map<string, any>();
      for (const h of (hotels || [])) {
        if (h.city_name && !cityMap.has(h.city_name.toLowerCase())) {
          cityMap.set(h.city_name.toLowerCase(), {
            cityName: h.city_name,
            countryName: h.country_name,
          });
        }
      }

      const mapped = Array.from(cityMap.values());
      return new Response(JSON.stringify({ success: true, cities: mapped, count: mapped.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Sync Hotels (v3 fetch-static-hotels) ──
    if (action === "sync-hotels") {
      const sb = getSupabaseAdmin();
      let totalSynced = 0;
      let nextCursor: string | null = body.nextCursor || null;
      let pageCount = 0;
      const maxPages = body.maxPages || 200;

      do {
        const payload: any = {};
        if (nextCursor) payload.next = nextCursor;
        if (body.lastUpdateTime) payload.lastUpdateTime = body.lastUpdateTime;

        console.log(`Sync page ${pageCount + 1}, cursor: ${nextCursor || "START"}`);

        const res = await tjFetch("/hms/v3/fetch-static-hotels", {
          method: "POST",
          body: JSON.stringify(payload),
        }, config.proxySecret);

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Sync page failed: ${res.status} - ${errText.substring(0, 200)}`);
          break;
        }

        const data = await res.json();
        if (!data?.status?.success) {
          console.error("Sync not success:", JSON.stringify(data).substring(0, 300));
          break;
        }

        const hotels = data?.hotelOpInfos || [];
        nextCursor = data?.next || null;
        pageCount++;

        if (hotels.length > 0) {
          const rows = hotels.filter((h: any) => h.hotelId || h.tjHotelId).map((h: any) => ({
            tj_hotel_id: String(h.hotelId || h.tjHotelId),
            unica_id: h.unicaId || null,
            name: h.name || "",
            rating: h.rating || 0,
            property_type: h.propertyType || "Hotel",
            city_name: h.cityName || h.address?.city?.name || "",
            city_code: h.address?.city?.code || "",
            state_name: h.address?.state?.name || "",
            country_name: h.countryName || h.address?.country?.name || "",
            country_code: h.address?.country?.code || "",
            latitude: h.geolocation?.lt ? parseFloat(h.geolocation.lt) : null,
            longitude: h.geolocation?.ln ? parseFloat(h.geolocation.ln) : null,
            address: h.address?.adr || "",
            postal_code: h.address?.postalCode || "",
            image_url: h.images?.[0]?.url || null,
            is_deleted: h.isDeleted || false,
            updated_at: new Date().toISOString(),
          }));

          for (let i = 0; i < rows.length; i += 100) {
            const chunk = rows.slice(i, i + 100);
            const { error } = await sb.from("tripjack_hotels").upsert(chunk, { onConflict: "tj_hotel_id" });
            if (error) console.error("DB upsert error:", error.message);
            else totalSynced += chunk.length;
          }
        }

        if (!nextCursor || hotels.length === 0) break;
      } while (pageCount < maxPages);

      console.log(`Hotel sync: ${totalSynced} hotels, ${pageCount} pages, complete: ${!nextCursor}`);

      return new Response(JSON.stringify({
        success: true, totalSynced, pages: pageCount,
        nextCursor: nextCursor || null,
        complete: !nextCursor,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Sync Deleted Hotels ──
    if (action === "sync-deleted") {
      const { lastUpdateTime } = body;
      if (!lastUpdateTime) {
        return new Response(JSON.stringify({ success: false, error: "Missing lastUpdateTime" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sb = getSupabaseAdmin();
      let totalDeleted = 0;
      let nextCursor: string | null = null;
      let pageCount = 0;

      do {
        const payload: any = { lastUpdateTime };
        if (nextCursor) payload.next = nextCursor;

        const res = await tjFetch("/hms/v3/fetch-static-hotels/deleted", {
          method: "POST",
          body: JSON.stringify(payload),
        }, config.proxySecret);

        if (!res.ok) { await res.text(); break; }
        const data = await res.json();
        if (!data?.status?.success) break;

        const deleted = data.hotelOpInfos || [];
        nextCursor = data.next || null;
        pageCount++;

        if (deleted.length > 0) {
          const ids = deleted.map((h: any) => String(h.tjHotelId));
          const { error } = await sb.from("tripjack_hotels").update({ is_deleted: true }).in("tj_hotel_id", ids);
          if (!error) totalDeleted += ids.length;
        }

        if (!nextCursor) break;
      } while (pageCount < 100);

      return new Response(JSON.stringify({ success: true, totalDeleted, pages: pageCount }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Nationalities ──
    if (action === "nationalities") {
      const res = await tjFetch("/hms/v3/nationality-info", { method: "GET" }, config.proxySecret);
      const data = await res.json();
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Tripjack hotel function error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
