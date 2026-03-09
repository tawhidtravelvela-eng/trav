import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api.viator.com/partner";
const SANDBOX_URL = "https://api.sandbox.viator.com/partner";

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getHeaders(apiKey: string, lang = "en-US") {
  return {
    "exp-api-key": apiKey,
    "Accept-Language": lang,
    Accept: "application/json;version=2.0",
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("VIATOR_API_KEY");
    if (!apiKey) {
      return json({ success: false, error: "Viator API key not configured" }, 400);
    }

    const body = await req.json();
    const { action } = body;
    // Use production by default, sandbox if specified
    const baseUrl = body.sandbox ? SANDBOX_URL : BASE_URL;

    switch (action) {
      case "search":
        return await handleSearch(body, apiKey, baseUrl);
      case "freetext":
        return await handleFreetext(body, apiKey, baseUrl);
      case "product":
        return await handleProduct(body, apiKey, baseUrl);
      case "reviews":
        return await handleReviews(body, apiKey, baseUrl);
      case "availability":
        return await handleAvailability(body, apiKey, baseUrl);
      case "destinations":
        return await handleDestinations(apiKey, baseUrl);
      default:
        return json({ success: false, error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("Viator error:", err);
    return json({ success: false, error: err.message }, 500);
  }
});

// POST /products/search - Search tours by destination, tags, filters
async function handleSearch(body: any, apiKey: string, baseUrl: string) {
  const {
    destinationId,
    tags,
    startDate,
    endDate,
    currency = "USD",
    sortOrder = "DEFAULT",
    limit = 30,
    searchText,
    filtering = {},
  } = body;

  const payload: any = {
    sorting: { sort: sortOrder, order: "DESCENDING" },
    pagination: { start: body.start || 1, count: limit },
    currency,
  };

  // filtering is required by Viator - must have at least destination or tags
  const filterObj: any = { ...filtering };
  if (destinationId) {
    filterObj.destination = destinationId;
  }
  if (tags && tags.length > 0) {
    filterObj.tags = tags;
  }
  if (startDate) {
    filterObj.startDate = startDate;
  }
  if (endDate) {
    filterObj.endDate = endDate;
  }
  
  // Only add filtering if we have at least one filter
  if (Object.keys(filterObj).length > 0) {
    payload.filtering = filterObj;
  }

  if (searchText) {
    payload.searchTerm = searchText;
  }

  console.log("Viator /products/search payload:", JSON.stringify(payload));

  const res = await fetch(`${baseUrl}/products/search`, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("Viator search status:", res.status, "body:", text.slice(0, 500));

  if (!res.ok) {
    return json({ success: false, error: `Viator API error: ${res.status}`, details: text.slice(0, 500) }, res.status);
  }

  const data = JSON.parse(text);
  const tours = (data.products || []).map(mapProduct);

  return json({
    success: true,
    tours,
    totalCount: data.totalCount || tours.length,
    currency,
  });
}

// POST /search/freetext - Text search across products, destinations, attractions
async function handleFreetext(body: any, apiKey: string, baseUrl: string) {
  const { searchText, currency = "USD", limit = 20 } = body;

  if (!searchText) {
    return json({ success: false, error: "searchText is required" }, 400);
  }

  // Viator v2 /search/freetext expects searchType as a string
  const payload = {
    searchTerm: searchText,
    searchType: "PRODUCTS" as const,
    currency,
    productFiltering: {},
    productCount: limit,
  };

  console.log("Viator freetext payload:", JSON.stringify(payload));
  console.log("Viator URL:", `${baseUrl}/search/freetext`);
  console.log("Viator key (masked):", apiKey.slice(0, 8) + "...");

  const res = await fetch(`${baseUrl}/search/freetext`, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log("Viator freetext response:", res.status, text.slice(0, 500));

  if (!res.ok) {
    // If production fails, try sandbox
    if (baseUrl === BASE_URL) {
      console.log("Retrying with sandbox URL...");
      const sandboxRes = await fetch(`${SANDBOX_URL}/search/freetext`, {
        method: "POST",
        headers: getHeaders(apiKey),
        body: JSON.stringify(payload),
      });
      const sandboxText = await sandboxRes.text();
      console.log("Viator sandbox response:", sandboxRes.status, sandboxText.slice(0, 500));
      if (sandboxRes.ok) {
        const data = JSON.parse(sandboxText);
        const products = (data.products?.results || []).map(mapProduct);
        return json({ success: true, products, totalProducts: data.products?.totalCount || 0 });
      }
      return json({ success: false, error: `Viator freetext error: ${sandboxRes.status}`, details: sandboxText.slice(0, 500) }, sandboxRes.status);
    }
    return json({ success: false, error: `Viator freetext error: ${res.status}`, details: text.slice(0, 500) }, res.status);
  }

  const data = JSON.parse(text);
  const products = (data.products?.results || []).map(mapProduct);
  const destinations = data.destinations?.results || [];
  const attractions = data.attractions?.results || [];

  return json({
    success: true,
    products,
    destinations,
    attractions,
    totalProducts: data.products?.totalCount || 0,
  });
}

// GET /products/{product-code} - Get full product details + pricing
async function handleProduct(body: any, apiKey: string, baseUrl: string) {
  const { productCode, currency = "USD" } = body;
  if (!productCode) {
    return json({ success: false, error: "productCode is required" }, 400);
  }

  // Fetch product details and availability/pricing in parallel
  const [detailRes, scheduleRes] = await Promise.all([
    fetch(`${baseUrl}/products/${productCode}`, {
      method: "GET",
      headers: getHeaders(apiKey),
    }),
    fetch(`${baseUrl}/availability/schedules/${productCode}`, {
      method: "GET",
      headers: { ...getHeaders(apiKey) },
    }),
  ]);

  const detailText = await detailRes.text();
  if (!detailRes.ok) {
    return json({ success: false, error: `Viator product error: ${detailRes.status}`, details: detailText.slice(0, 500) }, detailRes.status);
  }

  const data = JSON.parse(detailText);

  // Extract pricing from availability schedules
  try {
    if (scheduleRes.ok) {
      const scheduleData = await scheduleRes.json();
      console.log("Schedule response keys:", JSON.stringify(Object.keys(scheduleData)).slice(0, 200));
      // The schedule response includes pricing summary with fromPrice
      if (scheduleData.summary?.fromPrice != null) {
        data.pricing = {
          summary: { fromPrice: scheduleData.summary.fromPrice },
          currency: scheduleData.currency || currency,
        };
        console.log("Product price from schedules:", scheduleData.summary.fromPrice);
      } else if (scheduleData.bookableItems?.length > 0) {
        // Try to extract price from first bookable item
        const firstItem = scheduleData.bookableItems[0];
        const seasons = firstItem?.seasons || [];
        let lowestPrice = 0;
        for (const season of seasons) {
          for (const pricing of (season.pricingRecords || [])) {
            for (const detail of (pricing.pricingDetails || [])) {
              const p = detail.price?.original?.recommendedRetailPrice || detail.price?.original?.partnerTotalPrice || 0;
              if (p > 0 && (lowestPrice === 0 || p < lowestPrice)) {
                lowestPrice = p;
              }
            }
          }
        }
        if (lowestPrice > 0) {
          data.pricing = {
            summary: { fromPrice: lowestPrice },
            currency: scheduleData.currency || currency,
          };
          console.log("Product price from bookable items:", lowestPrice);
        }
      }
    } else {
      const errText = await scheduleRes.text();
      console.log("Schedule fetch failed:", scheduleRes.status, errText.slice(0, 300));
    }
  } catch (e) {
    console.log("Failed to parse schedule pricing:", e);
  }

  return json({ success: true, product: data });
}

// GET /reviews/{product-code} - Fetch product reviews
async function handleReviews(body: any, apiKey: string, baseUrl: string) {
  const { productCode, count = 10, page = 1 } = body;
  if (!productCode) {
    return json({ success: false, error: "productCode is required" }, 400);
  }

  const payload = {
    productCode,
    provider: "ALL" as const,
    count,
    page,
    sortBy: "MOST_RECENT_PER_LOCALE",
    ratings: [1, 2, 3, 4, 5],
  };

  const res = await fetch(`${baseUrl}/reviews/product`, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Viator reviews error:", res.status, text.slice(0, 300));
    return json({ success: false, error: `Viator reviews error: ${res.status}` }, res.status);
  }

  const data = JSON.parse(text);
  const reviews = (data.reviews || []).map((r: any) => ({
    userName: r.userName || "Traveler",
    rating: r.rating || 0,
    text: r.text || r.reviewText || "",
    title: r.title || "",
    publishedDate: r.publishedDate || r.submissionDate || "",
    provider: r.provider || "",
    avatarUrl: r.avatarUrl || null,
    travelerType: r.travelerType || "",
  }));

  return json({
    success: true,
    reviews,
    totalReviews: data.totalCount || data.totalReviews || reviews.length,
    averageRating: data.combinedAverageRating || data.rating || 0,
  });
}

// POST /availability/check - Check real-time availability & pricing
async function handleAvailability(body: any, apiKey: string, baseUrl: string) {
  const { productCode, productOptionCode, travelDate, paxMix, currency = "USD" } = body;

  if (!productCode || !travelDate || !paxMix) {
    return json({ success: false, error: "productCode, travelDate, and paxMix are required" }, 400);
  }

  const payload: any = {
    productCode,
    travelDate,
    paxMix,
    currency,
  };
  if (productOptionCode) {
    payload.productOptionCode = productOptionCode;
  }

  const res = await fetch(`${baseUrl}/availability/check`, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    return json({ success: false, error: `Viator availability error: ${res.status}`, details: text.slice(0, 500) }, res.status);
  }

  const data = JSON.parse(text);
  return json({ success: true, availability: data });
}

// GET /destinations - Get all Viator destinations
async function handleDestinations(apiKey: string, baseUrl: string) {
  const res = await fetch(`${baseUrl}/destinations`, {
    method: "GET",
    headers: getHeaders(apiKey),
  });

  const text = await res.text();
  if (!res.ok) {
    return json({ success: false, error: `Viator destinations error: ${res.status}`, details: text.slice(0, 500) }, res.status);
  }

  const data = JSON.parse(text);
  return json({ success: true, destinations: data.destinations || data });
}

// Map Viator product to our normalized tour format
function mapProduct(p: any) {
  const images = (p.images || []).map((img: any) => {
    // Pick the largest variant
    const variants = img.variants || [];
    const best = variants.reduce((a: any, b: any) => ((b.width || 0) > (a.width || 0) ? b : a), variants[0] || {});
    return best.url || "";
  }).filter(Boolean);

  const pricing = p.pricing || {};
  const price = pricing.summary?.fromPrice || pricing.fromPrice || 0;

  // Extract duration
  let duration = "";
  const dur = p.duration || {};
  if (dur.fixedDurationInMinutes) {
    const h = Math.floor(dur.fixedDurationInMinutes / 60);
    const m = dur.fixedDurationInMinutes % 60;
    duration = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
  } else if (dur.variableDurationFromMinutes && dur.variableDurationToMinutes) {
    const fromH = Math.floor(dur.variableDurationFromMinutes / 60);
    const toH = Math.floor(dur.variableDurationToMinutes / 60);
    duration = `${fromH}-${toH}h`;
  }

  // Extract rating
  const reviews = p.reviews || {};
  const rating = reviews.combinedAverageRating || reviews.rating || 0;
  const reviewCount = reviews.totalReviews || 0;

  // Tags as highlights
  const highlights = (p.tags || []).slice(0, 5).map((t: any) => t.tagName || t);

  // Destination from location
  const destination = p.destination?.name || p.location?.address?.city || "";

  return {
    id: `viator-${p.productCode}`,
    productCode: p.productCode,
    name: p.title || "Untitled Tour",
    destination,
    duration,
    price,
    currency: pricing.currency || "USD",
    category: p.flags?.includes("FREE_CANCELLATION") ? "Free Cancellation" : "Tour",
    rating: Math.round(rating * 10) / 10,
    reviewCount,
    image: images[0] || null,
    images,
    highlights,
    description: p.description || "",
    shortDescription: p.shortDescription || "",
    bookingUrl: p.productUrl || "",
    cancellationPolicy: p.cancellationPolicy?.description || "",
    source: "viator",
    // Product options for booking
    productOptions: (p.productOptions || []).map((o: any) => ({
      productOptionCode: o.productOptionCode,
      description: o.description || o.title || "",
    })),
    ageBands: p.pricingInfo?.ageBands || [],
  };
}
