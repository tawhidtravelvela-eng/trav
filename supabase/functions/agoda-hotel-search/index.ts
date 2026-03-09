import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AGODA_LT_URL = "https://affiliateapi7643.agoda.com/affiliateservice/lt_v1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("AGODA_API_KEY");
    const siteId = Deno.env.get("AGODA_SITE_ID");

    if (!apiKey || !siteId) {
      return json({ success: false, error: "Agoda API credentials not configured" }, 400);
    }

    const body = await req.json();
    const { action } = body;

    if (action === "lookup-city") {
      return handleCityLookup(body);
    }

    if (action === "search") {
      return await handleSearch(body, siteId, apiKey);
    }

    return json({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("Agoda hotel search error:", err);
    return json({ success: false, error: err.message }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── City Lookup (local map only - no API call needed) ──
function handleCityLookup(body: any) {
  const { cityName } = body;
  if (!cityName) return json({ success: false, error: "cityName is required" }, 400);

  const normalizedName = cityName.trim().toLowerCase();
  const KNOWN_CITIES: Record<string, number> = {
    "bangkok": 9395, "singapore": 4064, "kuala lumpur": 14621,
    "tokyo": 7055, "hong kong": 14407, "london": 6270,
    "paris": 6489, "new york": 334, "dubai": 7582,
    "seoul": 6847, "bali": 17193, "denpasar": 17193,
    "phuket": 9481, "mumbai": 8945, "delhi": 16551,
    "new delhi": 16551, "kolkata": 8850, "calcutta": 8850,
    "chennai": 4296, "bangalore": 8506, "bengaluru": 8506,
    "hyderabad": 8700, "goa": 8593, "jaipur": 8745,
    "dhaka": 12482, "chittagong": 12521, "cox's bazar": 12519,
    "istanbul": 7591, "rome": 6399, "sydney": 11277,
    "melbourne": 11316, "los angeles": 288, "las vegas": 268,
    "san francisco": 323, "miami": 290, "maldives": 14800,
    "male": 14800, "pattaya": 9464, "chiang mai": 9450,
    "osaka": 7035, "kyoto": 7027, "amsterdam": 3654,
    "barcelona": 6165, "berlin": 5722, "ho chi minh": 18299,
    "hanoi": 18186, "siem reap": 15546, "phnom penh": 15541,
    "jakarta": 17208, "manila": 8975, "taipei": 7357,
    "beijing": 4513, "shanghai": 4542,
  };

  const cityId = KNOWN_CITIES[normalizedName];
  if (cityId) {
    return json({ success: true, cityId, source: "fallback" });
  }

  // Try partial match
  for (const [key, id] of Object.entries(KNOWN_CITIES)) {
    if (key.includes(normalizedName) || normalizedName.includes(key)) {
      return json({ success: true, cityId: id, source: "partial" });
    }
  }

  return json({ success: false, error: `Could not resolve city: ${cityName}` });
}

// ── Hotel Search (Agoda LT API v2.0) ──
async function handleSearch(body: any, siteId: string, apiKey: string) {
  const {
    cityId,
    cityName,
    hotelIds,
    checkinDate,
    checkoutDate,
    adults = 2,
    children = 0,
    childrenAges,
    rooms = 1,
    currency = "USD",
    maxResult = 30,
    minimumStarRating = 0,
    minimumReviewScore = 0,
    sortBy = "Recommended",
    language = "en-us",
    discountOnly = false,
  } = body;

  if (!checkinDate || !checkoutDate) {
    return json({ success: false, error: "checkinDate and checkoutDate are required" }, 400);
  }

  // Resolve cityId
  let resolvedCityId = cityId ? Number(cityId) : null;
  if (!resolvedCityId && !hotelIds && cityName) {
    const lookupResult = handleCityLookup({ cityName });
    const lookupData = await lookupResult.json();
    if (lookupData.success && lookupData.cityId) {
      resolvedCityId = lookupData.cityId;
    } else {
      return json({ success: false, error: `Could not resolve city "${cityName}" to Agoda city ID` }, 400);
    }
  }

  if (!resolvedCityId && !hotelIds) {
    return json({ success: false, error: "cityId, cityName, or hotelIds is required" }, 400);
  }

  // Build request per Agoda LT API v2.0
  const criteria: any = {
    checkInDate: checkinDate,
    checkOutDate: checkoutDate,
    additional: {
      currency,
      language,
      discountOnly,
      occupancy: {
        numberOfAdult: Number(adults),
        numberOfChildren: Number(children),
        numberOfRooms: Number(rooms),
      },
      maxResult: Number(maxResult),
      minimumStarRating: Number(minimumStarRating),
      minimumReviewScore: Number(minimumReviewScore),
      sortBy,
      dailyRate: { minimum: 1, maximum: 10000 },
    },
  };

  if (childrenAges && Array.isArray(childrenAges) && childrenAges.length > 0) {
    criteria.additional.occupancy.childrenAges = childrenAges;
  }

  if (resolvedCityId) {
    criteria.cityId = resolvedCityId;
  } else if (hotelIds) {
    criteria.hotelId = Array.isArray(hotelIds) ? hotelIds.map(Number) : [Number(hotelIds)];
  }

  const searchPayload = { criteria };
  console.log("Agoda request:", JSON.stringify(searchPayload));

  const authHeader = `${siteId}:${apiKey}`;
  const response = await fetch(AGODA_LT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Encoding": "gzip,deflate",
      "Authorization": authHeader,
    },
    body: JSON.stringify(searchPayload),
  });

  const responseText = await response.text();
  console.log("Agoda response status:", response.status, "body:", responseText.slice(0, 800));

  if (!response.ok) {
    return json({
      success: false,
      error: `Agoda API error: ${response.status}`,
      details: responseText.slice(0, 500),
    }, response.status);
  }

  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    return json({ success: false, error: "Invalid JSON from Agoda", raw: responseText.slice(0, 500) }, 500);
  }

  if (data?.error) {
    return json({
      success: false,
      error: data.error.message || "Agoda search error",
      errorId: data.error.id,
    });
  }

  const results = data?.results || [];
  const hotels = results.map((h: any) => ({
    id: `agoda-${h.hotelId}`,
    name: h.hotelName || "Unknown Hotel",
    city: cityName || "",
    country: "",
    rating: h.reviewScore || 0,
    reviews: h.reviewCount || 0,
    stars: h.starRating || 0,
    price: h.dailyRate || 0,
    crossedOutRate: h.crossedOutRate || 0,
    discountPercentage: h.discountPercentage || h.discountPercent || 0,
    image: h.imageURL || null,
    images: h.imageURL ? [h.imageURL] : [],
    amenities: [
      ...(h.freeWifi ? ["Free WiFi"] : []),
      ...(h.includeBreakfast ? ["Breakfast Included"] : []),
    ],
    propertyType: "Hotel",
    landingUrl: h.landingURL || "",
    roomTypeName: h.roomtypeName || "",
    currency: h.currency || currency,
    availableRooms: h.roomtypeName ? [{
      room_category: h.roomtypeName,
      meal_info: h.includeBreakfast ? "Breakfast Included" : "Room Only",
      price: h.dailyRate || 0,
      total_price: h.dailyRate || 0,
      adult: Number(adults),
      child: Number(children),
      source: "agoda",
    }] : [],
    source: "agoda",
    description: "",
    mealBasis: h.includeBreakfast ? "Breakfast Included" : "",
  }));

  return json({
    success: true,
    hotels,
    total: hotels.length,
    currency,
    resolvedCityId,
  });
}
