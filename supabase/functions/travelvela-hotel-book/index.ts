import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Require authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid or expired session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get TravelVela credentials
    const authToken = Deno.env.get("TRAVELVELA_AUTH_TOKEN");
    const username = Deno.env.get("TRAVELVELA_USERNAME");
    const password = Deno.env.get("TRAVELVELA_PASSWORD");

    if (!authToken || !username || !password) {
      return new Response(JSON.stringify({ success: false, error: "TravelVela API credentials not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      hotel_data_provider = "travelvela",
      hotel_id,
      hotel_email,
      hotel_phone,
      hotel_name,
      hotel_rating,
      hotel_latitude,
      hotel_longitude,
      hotel_address,
      // Booking details
      city,
      checkin_date,
      checkout_date,
      guest_name,
      email,
      contact,
      address,
      guest_city,
      zip_code,
      country,
      note,
      total_guests,
      price,
      // Room info
      rooms,
    } = body;

    if (!hotel_id || !hotel_name) {
      return new Response(JSON.stringify({ success: false, error: "Missing required hotel booking parameters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build booking request body as raw JSON per API docs
    const bookingPayload: any = {
      hotel_data_provider,
      hotel_id,
      hotel_email: hotel_email || "",
      hotel_phone: hotel_phone || "",
      hotel_name,
      hotel_rating: hotel_rating || 0,
      hotel_latitude: hotel_latitude || "",
      hotel_longitude: hotel_longitude || "",
      hotel_address: hotel_address || "",
      // Guest details
      city: city || guest_city || "",
      checkin_date: checkin_date || "",
      checkout_date: checkout_date || "",
      guest_name: guest_name || "",
      email: email || "",
      contact: contact || "",
      address: address || "",
      zip_code: zip_code || "",
      country: country || "",
      note: note || "",
      total_guests: total_guests || 1,
      price: price || 0,
    };

    // Add room info if provided
    if (rooms && Array.isArray(rooms)) {
      bookingPayload.rooms = rooms;
    }

    console.log("Sending hotel booking request to TravelVela...");

    const bookRes = await fetch("https://admin.travelvela.com/api/book/hotel", {
      method: "POST",
      headers: {
        Authorization: authToken,
        username,
        password,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookingPayload),
    });

    const responseText = await bookRes.text();
    console.log("TravelVela hotel book response status:", bookRes.status);

    if (!bookRes.ok) {
      console.error("TravelVela hotel book error:", responseText.substring(0, 500));
      return new Response(JSON.stringify({ success: false, error: `Booking failed: ${bookRes.status}` }), {
        status: bookRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let bookData: any;
    try {
      bookData = JSON.parse(responseText);
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Invalid response from booking API" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract booking reference
    const bookingRef =
      bookData.booking_id ||
      bookData.BookingId ||
      bookData.data?.booking_id ||
      bookData.data?.id ||
      bookData.id ||
      null;

    const status =
      bookData.status ||
      bookData.data?.status ||
      (bookingRef ? "Confirmed" : "Unknown");

    if (!bookingRef && !bookData.success) {
      const errorMsg = bookData.error || bookData.message || bookData.data?.error || "Hotel booking not confirmed";
      return new Response(JSON.stringify({ success: false, error: errorMsg }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      bookingId: bookingRef || "PENDING",
      status,
      data: bookData.data || bookData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("TravelVela hotel booking error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
