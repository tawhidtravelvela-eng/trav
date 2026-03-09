import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Passenger {
  title: string;
  firstName: string;
  lastName: string;
  dob?: string;
  nationality?: string;
  passportNumber?: string;
  passportCountry?: string;
  passportExpiry?: string;
  gender?: string;
  frequentFlyer?: string;
  type: "ADT" | "CNN" | "INF";
}

// Login to TravelVela and get bearer token
async function loginToTravelVela(authToken: string, username: string, password: string): Promise<string> {
  const userEmail = Deno.env.get("TRAVELVELA_USER_EMAIL");
  const userPassword = Deno.env.get("TRAVELVELA_USER_PASSWORD");

  if (!userEmail || !userPassword) {
    throw new Error("TravelVela user login credentials not configured");
  }

  const formData = new FormData();
  formData.append("email", userEmail);
  formData.append("password", userPassword);

  console.log("Logging in to TravelVela with email:", userEmail);

  const loginRes = await fetch("https://admin.travelvela.com/api/user/login", {
    method: "POST",
    headers: {
      "Authorization": authToken,
      "username": username,
      "password": password,
      "Accept": "application/json",
    },
    body: formData,
  });

  const loginText = await loginRes.text();
  console.log("TravelVela login status:", loginRes.status, "body:", loginText.substring(0, 500));

  if (!loginRes.ok) {
    throw new Error(`TravelVela login failed: ${loginRes.status} - ${loginText.substring(0, 200)}`);
  }

  let loginData: any;
  try {
    loginData = JSON.parse(loginText);
  } catch {
    throw new Error(`Invalid login response: ${loginText.substring(0, 200)}`);
  }

  // Extract bearer token from login response
  const token =
    loginData.data?.access_token ||
    loginData.data?.token ||
    loginData.access_token ||
    loginData.token ||
    loginData.data?.bearer_token;

  if (!token) {
    console.log("Login response keys:", JSON.stringify(loginData));
    throw new Error(`No access token in login response: ${JSON.stringify(loginData).substring(0, 300)}`);
  }

  console.log("TravelVela login successful, got bearer token");
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Require authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get TravelVela partner credentials
    const authToken = Deno.env.get("TRAVELVELA_AUTH_TOKEN");
    const username = Deno.env.get("TRAVELVELA_USERNAME");
    const password = Deno.env.get("TRAVELVELA_PASSWORD");

    if (!authToken || !username || !password) {
      return new Response(
        JSON.stringify({ success: false, error: "TravelVela API credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Login to TravelVela to get bearer token
    let bearerToken: string;
    try {
      bearerToken = await loginToTravelVela(authToken, username, password);
    } catch (loginErr) {
      const msg = loginErr instanceof Error ? loginErr.message : "Login failed";
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Parse booking request
    const body = await req.json();
    const {
      segments,
      passengers,
      contactEmail,
      contactPhone = "",
      cabinClass = "Economy",
      priceId,
      originCarrierInfo,
      destinationCarrierInfo,
      durationMinutes,
      baseFare,
      grandTotal,
      seats,
      adults = 1,
      children = 0,
      infants = 0,
      isOneWay = true,
      travelportMeta = null,
    } = body;

    if (!segments?.length || !passengers?.length || !contactEmail) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required booking parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    const buildCarrierInfo = (seg: any) => {
      const carrier = seg.carrier || "";
      const opCarrier = seg.operatingCarrier || "";
      const flightNum = seg.flightNumber || "";
      const displayName = opCarrier || carrier;
      return `${displayName} ${flightNum}`.trim();
    };

    const originCarrier = originCarrierInfo || buildCarrierInfo(firstSeg);
    const destCarrier = destinationCarrierInfo || buildCarrierInfo(lastSeg);

    // Build passenger array per docs: title, first_name, last_name, dob, passport_number, passport_expiry, gender, frequent_flyer
    const apiPassengers = passengers.map((pax: Passenger) => ({
      title: pax.title,
      first_name: pax.firstName,
      last_name: pax.lastName,
      dob: pax.dob || "",
      passport_number: pax.passportNumber || "",
      passport_expiry: pax.passportExpiry || "",
      gender: pax.gender || (pax.title === "MR" || pax.title === "MSTR" ? "Male" : "Female"),
      frequent_flyer: pax.frequentFlyer || "",
    }));

    // Step 3: Build booking payload (raw JSON per docs)
    const bookingPayload: Record<string, any> = {
      price_id: priceId || null,
      travelport_meta: travelportMeta,
      passenger_email: contactEmail,
      passenger_phone: contactPhone,
      origin_location: firstSeg.origin || "",
      origin_datetime: firstSeg.departure || "",
      origin_carrier_info: originCarrier,
      destination_location: lastSeg.destination || "",
      destination_datetime: lastSeg.arrival || "",
      destination_carrier_info: destCarrier,
      one_way: isOneWay ? 1 : 0,
      duration: durationMinutes || 0,
      base_fare: baseFare || 0,
      grand_total: grandTotal || 0,
      seats: seats || 1,
      adults,
      children,
      infants,
      class: cabinClass === "Business" ? 1 : 0,
      passengers: apiPassengers,
    };

    console.log("TravelVela booking payload:", JSON.stringify(bookingPayload).substring(0, 1500));

    // Step 4: Call booking endpoint with bearer token
    const bookRes = await fetch("https://admin.travelvela.com/api/book/flight", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${bearerToken}`,
        "AuthHeader": authToken,
        "username": username,
        "password": password,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookingPayload),
    });

    const responseText = await bookRes.text();
    console.log("TravelVela book response status:", bookRes.status);
    console.log("TravelVela book response body:", responseText.substring(0, 1500));

    if (!bookRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Booking failed: ${bookRes.status}`, details: responseText.substring(0, 300) }),
        { status: bookRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let bookData: any;
    try {
      bookData = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid response from booking API", rawResponse: responseText.substring(0, 300) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract PNR/booking reference
    const data = bookData.data || bookData;
    const pnr =
      data.pnr || data.PNR || data.booking_reference || data.BookingReference ||
      data.booking_id || data.BookingId || data.confirmation_number ||
      bookData.pnr || bookData.PNR || null;

    const airlinePnr =
      data.airline_pnr || data.AirlinePNR || data.supplier_locator ||
      data.SupplierLocator || bookData.airline_pnr || null;

    const status = data.status || bookData.status || (pnr ? "Confirmed" : "Unknown");

    if (!pnr && !bookData.success && !data.success) {
      const errorMsg = data.error || data.message || bookData.error || bookData.message || "Booking not confirmed by airline";
      return new Response(
        JSON.stringify({ success: false, error: errorMsg, apiResponse: bookData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        pnr: pnr || "PENDING",
        airlinePnr: airlinePnr || null,
        status,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("TravelVela booking error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
