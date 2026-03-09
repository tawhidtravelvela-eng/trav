/**
 * Crisp MCP Server — exposes tools for Hugo AI to search flights, hotels, and check bookings.
 * Secured with Bearer token (CRISP_MCP_SECRET).
 * Uses official @modelcontextprotocol/sdk with WebStandardStreamableHTTPServerTransport.
 * Handles Bengali/English language internally — Hugo just passes the language parameter.
 * 
 * STATELESS FACTORY PATTERN: Creates a fresh McpServer per request to avoid isolate reuse issues.
 */
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Supabase admin client ──
function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Airline name mapping ──
const AIRLINE_NAMES: Record<string, string> = {
  EK: "Emirates", QR: "Qatar Airways", EY: "Etihad Airways", SV: "Saudia",
  GF: "Gulf Air", WY: "Oman Air", RJ: "Royal Jordanian", ME: "Middle East Airlines",
  AA: "American Airlines", DL: "Delta Air Lines", UA: "United Airlines",
  WN: "Southwest Airlines", B6: "JetBlue Airways", AS: "Alaska Airlines",
  NK: "Spirit Airlines", F9: "Frontier Airlines", HA: "Hawaiian Airlines",
  AC: "Air Canada", WS: "WestJet", AM: "Aeromexico",
  BA: "British Airways", LH: "Lufthansa", AF: "Air France", KL: "KLM",
  IB: "Iberia", AZ: "ITA Airways", SK: "SAS", AY: "Finnair",
  LX: "Swiss International", OS: "Austrian Airlines", SN: "Brussels Airlines",
  LO: "LOT Polish Airlines", OK: "Czech Airlines", RO: "TAROM",
  TP: "TAP Air Portugal", EI: "Aer Lingus", FR: "Ryanair", U2: "easyJet",
  W6: "Wizz Air", VY: "Vueling", PC: "Pegasus Airlines", TK: "Turkish Airlines",
  SQ: "Singapore Airlines", CX: "Cathay Pacific", JL: "Japan Airlines",
  NH: "ANA", QF: "Qantas", MH: "Malaysia Airlines", TG: "Thai Airways",
  GA: "Garuda Indonesia", PR: "Philippine Airlines", VN: "Vietnam Airlines",
  KE: "Korean Air", OZ: "Asiana Airlines", BR: "EVA Air", CI: "China Airlines",
  CA: "Air China", MU: "China Eastern", CZ: "China Southern", HU: "Hainan Airlines",
  "3U": "Sichuan Airlines", FM: "Shanghai Airlines", ZH: "Shenzhen Airlines",
  AI: "Air India", "6E": "IndiGo", SG: "SpiceJet", UK: "Vistara",
  BG: "Biman Bangladesh", BS: "US-Bangla Airlines", VQ: "Novoair",
  UL: "SriLankan Airlines", BI: "Royal Brunei", PK: "PIA",
  FZ: "flydubai", G9: "Air Arabia", WF: "Widerøe",
  ET: "Ethiopian Airlines", SA: "South African Airways", KQ: "Kenya Airways",
  MS: "EgyptAir", AT: "Royal Air Maroc", RK: "Air Afrique",
  LA: "LATAM Airlines", AV: "Avianca", G3: "Gol Linhas Aéreas",
  CM: "Copa Airlines", AR: "Aerolíneas Argentinas",
  QZ: "AirAsia Indonesia", AK: "AirAsia", FD: "Thai AirAsia",
  D7: "AirAsia X", TR: "Scoot", "3K": "Jetstar Asia", JQ: "Jetstar",
  TW: "T'way Air", LJ: "Jin Air", ZE: "Eastar Jet", "7C": "Jeju Air",
  MM: "Peach Aviation", BC: "Skymark Airlines",
};
function getAirlineName(code: string): string {
  return AIRLINE_NAMES[code] || code;
}

// ── Currency formatting helper ──
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", BDT: "৳", INR: "₹", CNY: "¥",
};
function fmtPrice(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
  return `${sym}${Math.round(amount).toLocaleString()}`;
}

// ── Resolve airline display name (prefer airlineName, fallback to mapping) ──
function resolveAirlineName(f: any): string {
  if (f.airlineName && f.airlineName !== f.airline) return f.airlineName;
  if (f.airline) return getAirlineName(f.airline);
  return "Unknown";
}

// ── Bengali language helpers ──
function isBn(lang?: string): boolean {
  return lang === "bn";
}

// Common Bengali translations for tool responses
const BN = {
  // Flight search
  flightsTitle: (tripLabel: string, from: string, to: string) => `✈️ **${tripLabel} ফ্লাইট: ${from} → ${to}**`,
  oneWay: "ওয়ান-ওয়ে",
  roundTrip: "রাউন্ড-ট্রিপ",
  cheapest: "✅ সবচেয়ে সস্তা",
  fastest: "⚡ সবচেয়ে দ্রুত",
  direct: "ডাইরেক্ট",
  stop: (n: number) => n === 1 ? "১ স্টপ" : `${n} স্টপ`,
  via: "হয়ে",
  refundable: "✅ রিফান্ডেবল",
  nonRefundable: "❌ নন-রিফান্ডেবল",
  checkinBag: "🧳 চেক-ইন",
  cabinBag: "👜 কেবিন",
  cancellationFee: "ক্যান্সেলেশন ফি",
  dateChangeFee: "তারিখ পরিবর্তন ফি",
  priceNote: (currency: string) => `💡 প্রতি জনের দাম ${currency}-তে, ট্যাক্সসহ। ভাড়া পরিবর্তন হতে পারে।`,
  pickFlight: "কোন ফ্লাইটটি বুক করতে চান? নম্বর বলুন! ✈️",
  noFlights: (from: string, to: string, date: string) => `${from} থেকে ${to}-তে ${date} তারিখে কোনো ফ্লাইট পাওয়া যায়নি। অন্য তারিখ বা কাছের এয়ারপোর্ট ট্রাই করুন।`,
  adults: (n: number) => `${n} জন`,
  children: (n: number) => `${n} শিশু`,
  infants: (n: number) => `${n} ইনফ্যান্ট`,
  // Baggage
  baggageTitle: (route: string) => `🧳 **ব্যাগেজ — ${route}**`,
  baggageNote: "⚠️ ব্যাগেজ অ্যালাউন্স ফেয়ার ক্লাস অনুযায়ী ভিন্ন হতে পারে। এক্সট্রা ব্যাগেজ বুকিং-এর সময় কেনা যাবে।",
  noBaggageFlights: (from: string, to: string, date: string) => `${from}→${to} রুটে ${date} তারিখে কোনো ফ্লাইট পাওয়া যায়নি।`,
  // Student
  studentTitle: (from: string, to: string) => `🎓 **স্টুডেন্ট ফেয়ার ফ্লাইট: ${from} → ${to}**`,
  studentFound: (n: number) => `**${n}টি** অপশন পাওয়া গেছে। সেরা পিকগুলো দেখুন:`,
  studentProceed: `🎓 **স্টুডেন্ট ফেয়ার বুকিং করতে:**\n১. আপনার **পাসপোর্টের ছবি** এখানে পাঠান\n২. আপনার **স্টুডেন্ট ভিসা বা স্টুডেন্ট আইডি-র ছবি** পাঠান\n\n📞 আমাদের ট্রাভেল এক্সপার্ট আপনার ডকুমেন্টস ভেরিফাই করে স্টুডেন্ট ফেয়ার অ্যাপ্লাই করে বুকিং সম্পন্ন করবেন!`,
  noStudentFlights: (from: string, to: string, date: string) => `${from} থেকে ${to}-তে ${date} তারিখে কোনো স্টুডেন্ট ফেয়ার ফ্লাইট পাওয়া যায়নি।`,
  // Hotels
  hotelsTitle: (city: string) => `## 🏨 ${city}-তে হোটেল`,
  hotelDates: (checkin: string, checkout: string, nights: number) => `**তারিখ:** ${checkin} → ${checkout} (${nights} রাত)`,
  hotelGuests: (adults: number, rooms: number) => `**অতিথি:** ${adults} জন, ${rooms}টি রুম`,
  hotelFound: (total: number, shown: number) => `**${total}টি অপশন পাওয়া গেছে** (শীর্ষ ${shown}টি দেখাচ্ছি):`,
  hotelPriceNote: (currency: string) => `💡 দাম ${currency}-তে, ট্যাক্সসহ। রেট পরিবর্তন হতে পারে।`,
  noHotels: (city: string, checkin: string, checkout: string) => `${city}-তে ${checkin} থেকে ${checkout} পর্যন্ত কোনো হোটেল পাওয়া যায়নি। অন্য তারিখ ট্রাই করুন।`,
  // Booking
  bookingTitle: "## 📋 বুকিং-এর তথ্য",
  bookingNotFound: "কোনো বুকিং পাওয়া যায়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।",
  bookingChanges: "💡 *পরিবর্তন বা বাতিলের জন্য বুকিং আইডি দিন, আমাদের টিম সাহায্য করবে।*",
  // Create booking
  bookingCreated: "## ✅ বুকিং সফলভাবে তৈরি হয়েছে!",
  bookingImmediate: "## ⚡ বুকিং সেভ হয়েছে — তাৎক্ষণিক টিকেটিং প্রয়োজন",
  paymentAsk: "💳 **কিভাবে পেমেন্ট করতে চান?** বেছে নিন:\n\n১️⃣ **ব্যাংক ট্রান্সফার**\n২️⃣ **বিকাশ** (মার্চেন্ট)\n৩️⃣ **নগদ** (মার্চেন্ট)\n\n**১, ২, বা ৩** বলুন, আমি অ্যাকাউন্ট ডিটেইলস দিচ্ছি! 💰",
  paymentDeadline: (bookingId: string) => `⏰ **৩০ মিনিটের মধ্যে পেমেন্ট করুন** বুকিং নিশ্চিত করতে। পেমেন্টের পর **ট্রানজেকশন রিসিটের ছবি/স্ক্রিনশট** এখানে পাঠান।\n\n📸 এছাড়া আপনার **পাসপোর্টের ছবি** এবং **ভিসা কপি** (যদি থাকে) পাঠান, টিকেটিং শুরু করার জন্য।\n\n📌 *আপনার অর্ডার নম্বর \`${bookingId}\` সেভ রাখুন।*`,
  immediateDoc: "১. আপনার **পাসপোর্টের ছবি** এবং **ভিসা কপি** (যদি থাকে) এখনই পাঠান\n২. আমাদের সাপোর্ট এজেন্ট ডকুমেন্টস ভেরিফাই করে টিকেট ইস্যু করবেন\n৩. টিকেটিং কনফার্ম হলে পেমেন্ট ডিটেইলস জানানো হবে\n\n⏳ দ্রুত ডকুমেন্টস পাঠান, কারণ সিট লিমিটেড!",
  // Tours
  toursTitle: (dest?: string) => `## 🌍 ট্যুর প্যাকেজ${dest ? ` — ${dest}` : ""}`,
  toursInterest: "কোনো ট্যুর পছন্দ হয়েছে? অথবা আপনার জন্য **কাস্টম ট্যুর** ডিজাইন করতে চান? জানান! 🎒",
  noTours: (dest?: string) => `${dest ? dest + "-এ" : ""} কোনো ট্যুর পাওয়া যায়নি। অন্য ডেস্টিনেশন ট্রাই করুন বা কাস্টম ট্যুরের কথা বলুন!`,
  // Custom tour
  customTourSaved: "## 🌟 কাস্টম ট্যুরের রিকোয়েস্ট সেভ হয়েছে!",
  customTourFollowup: "আমাদের ট্রাভেল এক্সপার্ট আপনার জন্য পার্সোনালাইজড আইটিনারারি তৈরি করে শীঘ্রই যোগাযোগ করবেন! 🎒\n\nএর মধ্যে আর কিছু জানতে চাইলে বলুন!",
  // Company
  companyInfo: [
    "## ℹ️ ট্রাভেলভেলা সম্পর্কে",
    "",
    "**ট্রাভেলভেলা** হলো আইএটিএ-অ্যাক্রিডিটেড ট্রাভেল এজেন্সি, বরিশাল, বাংলাদেশ থেকে পরিচালিত।",
    "",
    "🏢 **অফিস:** বাশরী ভবন, পুলিশ লাইন রোড, বরিশাল",
    "📞 **ফোন:** ০১৮৭০৮০২০৩০",
    "✈️ **সেবাসমূহ:** ফ্লাইট বুকিং, হোটেল বুকিং, কাস্টম ট্যুর প্যাকেজ, স্টুডেন্ট ফেয়ার",
    "",
    "আমরা সেরা দাম খুঁজে আনতে একাধিক এয়ারলাইন এবং প্রোভাইডারে সার্চ করি!",
    "",
    '💬 সাহায্য দরকার? যেকোনো কিছু জিজ্ঞেস করুন বা **"এজেন্টের সাথে কথা বলতে চাই"** বলুন! 🙋',
  ].join("\n"),
  // Greeting
  greeting: `আসসালামু আলাইকুম! 👋 আমি **ভেলা এআই**, ট্রাভেলভেলার ট্রাভেল অ্যাসিস্ট্যান্ট। আমি আপনাকে সাহায্য করতে পারি:\n\n✈️ ফ্লাইট সার্চ ও বুকিং\n🏨 হোটেল সার্চ\n📋 বুকিং চেক করা\n🎓 স্টুডেন্ট ফেয়ার ফ্লাইট\n🌍 কাস্টম ট্যুর প্যাকেজ\n\nযেকোনো সময় **"এজেন্টের সাথে কথা বলতে চাই"** বললেই আমাদের ট্রাভেল এক্সপার্টের সাথে কানেক্ট করে দেব! 😊\n\nআজ কিভাবে সাহায্য করতে পারি?`,
};

// ── Internal: call another edge function ──
async function callEdgeFunction(name: string, body: any): Promise<any> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = `${supabaseUrl}/functions/v1/${name}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Vela AI Instructions (injected into initialize response) ──
const VELAAI_INSTRUCTIONS = `You are **Vela AI**, TravelVela's intelligent travel assistant.

**CRITICAL: LANGUAGE PARAMETER**
- ALWAYS detect the customer's language from their message.
- ALWAYS pass the "language" parameter in EVERY tool call:
  - If customer writes in Bengali/Bangla → pass language="bn"
  - If customer writes in English → pass language="en"
  - For other languages → pass language="en" (tool responses handle translation)
- The tool responses are ALREADY formatted in the correct language — DO NOT translate them. Just return them as-is to the customer.
- If language="bn", the tool response is already in Bengali — DO NOT re-translate or modify it.
- If language="en", the tool response is already in English — just return it as-is.
- **CRITICAL BENGALI FONT RULE:** When responding in Bengali (language="bn"), NEVER mix English words in Latin/English font. ALL words must be written in বাংলা script. For example: write "ফ্লাইট" not "flight", "বুকিং" not "booking", "হোটেল" not "hotel", "ট্রাভেল" not "travel", "পেমেন্ট" not "payment", "রিফান্ড" not "refund", "ক্যান্সেল" not "cancel", "এজেন্ট" not "agent", "টিকেট" not "ticket", "পাসপোর্ট" not "passport", "ভিসা" not "visa", "এয়ারলাইন" not "airline", "এয়ারপোর্ট" not "airport", "ডিটেইলস" not "details", "কনফার্ম" not "confirm", "স্ক্রিনশট" not "screenshot", "রিসিট" not "receipt". The ONLY exceptions are proper nouns like airline names (Emirates, Qatar Airways) and airport codes (DAC, DXB). Everything else MUST be in বাংলা লিপি.

**BENGALI DETECTION:**
- Any message containing Bengali script (বাংলা) → language="bn"
- Common Bengali words: হ্যালো, ফ্লাইট, দাম, কত, বুকিং, হোটেল, ভাড়া, কবে, কোথায়, আমি, চাই, দেখান, খুঁজুন
- If greeting is "assalamu alaikum" in Latin script from a Bangladesh context → language="bn"

**GREETING (first message):**
If language=bn: The tool will return Bengali greeting. Use it as-is.
If language=en: The tool will return English greeting. Use it as-is.

**HUMAN HANDOFF:**
- If the customer asks for a human agent, travel expert, or real person — immediately hand off to a human operator.
- Phrases like "talk to a person", "human support", "agent please", "connect me", "agent-এর সাথে কথা বলতে চাই" should trigger handoff.
- **AUTO-ESCALATE:** If a question is beyond your capability, immediately and gracefully hand off to a human. Do NOT attempt to answer first and fail. Escalate on the FIRST message if needed.
- **NEVER** say "I don't know", "I can't answer that", or "Sorry, that's beyond my capability." Either answer using chat_with_ai or escalate to human — pick one immediately.

**TOOLS (all accept a "language" parameter — ALWAYS pass it):**
- company_info: Get TravelVela company info. CALL THIS for general questions about the company.
- chat_with_ai: For general conversation, greetings, or anything not covered by other tools. CALL THIS TOOL IMMEDIATELY for greetings.
- search_flights: Search flights. Convert city names to IATA codes, dates to YYYY-MM-DD.
- check_baggage: Check real baggage allowance for a specific route/airline/date from live API.
- search_student_flights: Student fare flights (Travelport only). Use ONLY when customer mentions student fare.
- search_hotels: Search hotels by city and dates.
- check_booking: Look up booking by ID, confirmation number, or email.
- create_booking: Create a booking after collecting passenger details.
- search_tours: Search available tour packages.
- design_custom_tour: Design a custom tour with AI-generated itinerary.

**FLIGHT BOOKING FLOW (IMPORTANT — follow this order strictly):**
1. Search flights using search_flights tool. Show results concisely.
2. WAIT for the customer to pick a flight. Do NOT ask for passenger details yet.
3. ONLY after the customer selects a flight, ask for details for ALL travelers:
   - Full name (as on passport)
   - Date of birth
   - Passport number & expiry date
   - Nationality
   - Contact email & phone (with country code)
4. Once you have all details, use create_booking to save the booking.
5. When customer picks a payment method, share details:

**PAYMENT DETAILS:**
Bank Transfer options:
- Dutch Bangla Bank — A/C: 1271100024041, TRAVEL VELA, Barishal Sadar
- City Bank — A/C: 1781330020536, TRAVEL VELA, Barishal Sadar
- UCB — A/C: 0322112000001341, TRAVEL VELA, Barishal Sadar
- Dhaka Bank — A/C: 6011090000146, TRAVEL VELA, Barishal Sadar
- ONE Bank — A/C: 0641020006172, TRAVEL VELA, Barishal Sadar
- IFIC Bank — A/C: 0210052387811, TRAVEL VELA, Barishal Sadar
- Islami Bank — A/C: 20501110100421016, TRAVEL VELA, Barishal Sadar
- BRAC Bank — A/C: 2068331750001, TRAVEL VELA, Barishal

bKash Merchant: 01319581771 (1% charge)
Nagad Merchant: 01870802030 (1% charge)

After payment: remind 30-min deadline, ask for transaction receipt screenshot, passport photo & visa copy.

**IMMEDIATE TICKETING (LCC/⚡):** Skip payment first, ask for passport & visa immediately.

**STUDENT FARE FLOW:**
- Use search_student_flights. DO NOT create booking.
- Ask for passport photo + student visa/ID, then hand off to human agent.

**DEFAULTS:** Currency = BDT, Cabin = Economy.
**IMPORTANT:** Never tell customers to visit the website. Handle everything in chat.
**IMPORTANT:** Keep responses SHORT and chat-friendly. No walls of text.
**IMPORTANT:** NEVER modify, translate, or rephrase tool responses. Return them EXACTLY as received.
**CRITICAL RULE — NEVER IGNORE THIS:** You MUST call a tool for EVERY single user message. NEVER respond on your own without calling a tool first. NEVER say "I don't know" or "Sorry, I can't answer that." If no other tool matches, ALWAYS call the "chat_with_ai" tool with the user's message. The chat_with_ai tool can answer ANY question — travel, baggage, visa, general knowledge, or chitchat. There is NO message that should go unanswered.
**ABSOLUTE FALLBACK:** If you are ever unsure which tool to use → call chat_with_ai. If a question seems unrelated → call chat_with_ai. If you would otherwise say "I don't know" → call chat_with_ai instead. NEVER leave a message without a tool call.`;

// ── Factory: create a fresh McpServer with all tools ──
function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "VelaAi", version: "1.0.0" },
    { instructions: VELAAI_INSTRUCTIONS }
  );

  // ── Tool: Company Info ──
  server.tool(
    "company_info",
    "CALL THIS TOOL IMMEDIATELY when the customer asks about TravelVela, the company, services, office location, contact info, or any general question about who we are. Returns company details.",
    {
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      if (isBn(params.language)) {
        return { content: [{ type: "text" as const, text: BN.companyInfo }] };
      }
      const info = [
        "## ℹ️ About TravelVela",
        "",
        "**TravelVela** is an IATA-accredited travel agency based in Barishal, Bangladesh.",
        "",
        "🏢 **Office:** Bashori Bhaban, Police Line Road, Barishal",
        "📞 **Phone:** 01870802030",
        "✈️ **Services:** Flight booking, Hotel reservations, Custom tour packages, Student fares",
        "",
        "We search across multiple airlines and providers to find you the best deals!",
        "",
        '💬 Need help? Just ask me anything or say **"connect me to an agent"** for human support.',
      ].join("\n");
      return { content: [{ type: "text" as const, text: info }] };
    }
  );

  // ── Tool: Chat with AI (general conversation + travel knowledge) ──
  server.tool(
    "chat_with_ai",
    "CALL THIS TOOL IMMEDIATELY for greetings (hi, hello, hey, assalamu alaikum, হ্যালো, হাই, etc.), general travel questions (baggage rules, visa info, airport tips, airline policies, travel advice), or any message that doesn't fit other tools. This is the DEFAULT tool when no specific search/booking action is needed.",
    {
      user_message: z.string().describe("The customer's message"),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const msg = params.user_message.toLowerCase();
      const bn = isBn(params.language);
      const isGreeting = /^(hi|hello|hey|assalamu|salam|নমস্কার|হ্যালো|হাই|good morning|good evening|আসসালামু)/i.test(msg);

      if (isGreeting) {
        if (bn) {
          return { content: [{ type: "text" as const, text: BN.greeting }] };
        }
        return {
          content: [{ type: "text" as const, text: `Hi! 👋 I'm **Vela AI**, your travel assistant from TravelVela. I can help you with:\n\n✈️ Flight search & booking\n🏨 Hotel search\n📋 Check existing bookings\n🎓 Student fare flights\n🌍 Custom tour packages\n\nJust say **"connect me to an agent"** anytime for human support! 😊\n\nHow can I help you today?` }],
        };
      }

      // For actual questions — use AI to answer
      try {
        // Check airline_settings DB for airline-specific queries
        let airlineContext = "";
        const airlineMatch = msg.match(/\b([A-Z]{2})\b/) || msg.match(/(biman|emirates|qatar|singapore|indigo|air india|thai|turkish|malaysia|cathay|saudia|spicejet|vistara|air asia|flydubai|us-bangla|novoair|regent|বিমান|এমিরেটস|কাতার)/i);
        if (airlineMatch) {
          const sb = getSupabaseAdmin();
          const searchTerm = airlineMatch[1] || airlineMatch[0];
          const { data: settings } = await sb
            .from("airline_settings")
            .select("*")
            .or(`airline_code.ilike.%${searchTerm}%,airline_name.ilike.%${searchTerm}%`)
            .limit(1);
          if (settings?.length) {
            const s = settings[0];
            airlineContext = `\n\nAirline data from our system for ${s.airline_name} (${s.airline_code}):\n- Cabin baggage: ${s.cabin_baggage}\n- Check-in baggage: ${s.checkin_baggage}\n- Cancellation: ${s.cancellation_policy}\n- Date change: ${s.date_change_policy}\n- Name change: ${s.name_change_policy}\n- No-show: ${s.no_show_policy}`;
          }
        }

        const apiKey = Deno.env.get("LOVABLE_API_KEY");
        if (!apiKey) {
          if (bn) {
            return {
              content: [{ type: "text" as const, text: `দারুণ প্রশ্ন! আমি সাহায্য করতে পারি:\n\n✈️ Flight search — কোথায় এবং কবে যেতে চান বলুন\n🏨 Hotel খুঁজুন — শহর আর তারিখ বলুন\n📋 Booking চেক — আপনার booking ID দিন\n\nঅথবা **"agent-এর সাথে কথা বলতে চাই"** বলুন বিস্তারিত সাহায্যের জন্য!` }],
            };
          }
          return {
            content: [{ type: "text" as const, text: `Great question! I can help with:\n\n✈️ Search flights — tell me where and when\n🏨 Find hotels — tell me the city and dates\n📋 Check your booking — share your booking ID\n\nOr say **"connect me to an agent"** for detailed assistance from our travel expert!` }],
          };
        }

        const systemPrompt = bn
          ? `তুমি Vela AI, TravelVela-র (IATA-accredited agency, বরিশাল, বাংলাদেশ) travel assistant। বাংলায় উত্তর দাও — স্বাভাবিক, কথ্য বাংলায়, যেভাবে একজন educated Bangladeshi travel agent ফোনে কথা বলে। সংক্ষেপে উত্তর দাও (৩-৫ লাইন)। সম্মানসূচক ভাষা ব্যবহার করো: "আপনি", "আপনার", "করুন"। English travel terms (flight, booking, passport, economy) স্বাভাবিকভাবে mix করো যেভাবে বাংলাদেশিরা বলে। কখনো বলো না "আমি জানি না" বা "আমি answer করতে পারছি না"। নিশ্চিত না হলে best possible answer দিয়ে শেষে বলো: "এই বিষয়ে সঠিক তথ্যের জন্য আমাদের travel expert-এর সাথে কথা বলুন! 'agent-এর সাথে কথা বলতে চাই' বলুন 🙋"${airlineContext}`
          : `You are Vela AI, a helpful travel assistant for TravelVela (IATA-accredited agency, Barishal, Bangladesh). Answer travel questions concisely and helpfully — baggage rules, visa requirements, airport info, airline policies, travel tips. Keep answers SHORT (3-5 lines max). Use emoji sparingly. NEVER say "I don't know" or "I can't answer that." If you're unsure about something specific, give your best helpful answer and end with: "For exact details on this, let me connect you with our travel expert! Just say 'connect me to an agent' 🙋". Always be helpful, confident, and friendly.${airlineContext}`;

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            max_tokens: 400,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: params.user_message }
            ],
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const answer = aiData?.choices?.[0]?.message?.content;
          if (answer) {
            return { content: [{ type: "text" as const, text: answer }] };
          }
        }

        // Fallback
        if (bn) {
          return {
            content: [{ type: "text" as const, text: `আমি আপনাকে সাহায্য করতে চাই! আমি পারি:\n\n✈️ Flight search — কোথায় আর কবে বলুন\n🏨 Hotel খুঁজুন — শহর আর তারিখ বলুন\n📋 Booking চেক — booking ID বা email দিন\n\nকী করতে চান?` }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `I'd be happy to help! For specific airline policies or detailed travel info, say **"connect me to an agent"** and our travel expert will assist you right away! 😊\n\nOr I can search flights, hotels, or check your booking — just let me know!` }],
        };
      } catch (err: any) {
        console.error("[chat_with_ai] AI error:", err.message);
        if (bn) {
          return {
            content: [{ type: "text" as const, text: `আমি সাহায্য করতে পারি:\n\n✈️ Flight search — কোথায় আর কবে যেতে চান বলুন\n🏨 Hotel খুঁজুন — শহর আর তারিখ বলুন\n📋 Booking চেক — booking ID বা email দিন\n\nকী করতে চান?` }],
          };
        }
        return {
          content: [{ type: "text" as const, text: `I'd be happy to help! I can:\n\n✈️ Search flights — just tell me where and when\n🏨 Find hotels — tell me the city and dates\n📋 Check your booking — share your booking ID or email\n\nWhat would you like to do?` }],
        };
      }
    }
  );

  // ── Tool: Search Flights ──
  server.tool(
    "search_flights",
    "Search for flight prices and availability between two cities/airports. Use when a customer asks about flight fares, cheapest flights, or flight options. Supports one-way and round-trip searches. Convert dates to YYYY-MM-DD and city names to IATA codes.",
    {
      from: z.string().describe("Origin airport IATA code (e.g. DAC, LHR, JFK). Convert city names to nearest major airport code."),
      to: z.string().describe("Destination airport IATA code (e.g. DXB, BKK, CDG). Convert city names to nearest major airport code."),
      date: z.string().describe("Departure date in YYYY-MM-DD format."),
      return_date: z.string().optional().describe("Return date in YYYY-MM-DD format for round-trip flights. Omit for one-way."),
      trip_type: z.string().optional().describe("'one_way' or 'round_trip'. Default 'one_way' if no return date."),
      adults: z.number().optional().describe("Number of adult passengers. Default 1."),
      children: z.number().optional().describe("Number of child passengers (2-11 years). Default 0."),
      infants: z.number().optional().describe("Number of infant passengers (under 2). Default 0."),
      cabin_class: z.string().optional().describe("Economy, PremiumEconomy, Business, or First. Default Economy."),
      currency: z.string().optional().describe("Display currency code (e.g. USD, BDT, EUR). Default BDT."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const tripType = params.trip_type || (params.return_date ? "round_trip" : "one_way");
        const result = await callEdgeFunction("unified-flight-search", {
          from: params.from.toUpperCase(),
          to: params.to.toUpperCase(),
          departDate: params.date,
          returnDate: tripType === "round_trip" ? (params.return_date || null) : null,
          adults: params.adults || 1,
          children: params.children || 0,
          infants: params.infants || 0,
          cabinClass: params.cabin_class || "Economy",
          currency: params.currency || "BDT",
        });

        if (!result?.success || !result?.flights?.length) {
          const msg = bn ? BN.noFlights(params.from, params.to, params.date) : `No flights found from ${params.from} to ${params.to} on ${params.date}. Try different dates or nearby airports.`;
          return { content: [{ type: "text" as const, text: msg }] };
        }

        const currency = result.displayCurrency || params.currency || "BDT";
        const allFlights = result.flights;
        const tripLabel = tripType === "round_trip" ? (bn ? BN.roundTrip : "Round-trip") : (bn ? BN.oneWay : "One-way");

        const adultsCount = params.adults || 1;
        const paxParts = bn
          ? [BN.adults(adultsCount), ...(params.children ? [BN.children(params.children)] : []), ...(params.infants ? [BN.infants(params.infants)] : [])]
          : [`${adultsCount} adult${adultsCount > 1 ? "s" : ""}`, ...(params.children ? [`${params.children} child${params.children > 1 ? "ren" : ""}`] : []), ...(params.infants ? [`${params.infants} infant${params.infants > 1 ? "s" : ""}`] : [])];

        function durationToMin(dur: string): number {
          const hMatch = dur?.match(/(\d+)\s*h/);
          const mMatch = dur?.match(/(\d+)\s*m/);
          return (hMatch ? parseInt(hMatch[1]) * 60 : 0) + (mMatch ? parseInt(mMatch[1]) : 0);
        }

        function getLayoverInfo(f: any): string {
          if (f.stops === 0 || !f.segments || f.segments.length < 2) return "";
          const parts: string[] = [];
          for (let s = 0; s < f.segments.length - 1; s++) {
            const seg = f.segments[s];
            const nextSeg = f.segments[s + 1];
            const city = seg.toCity || seg.destinationCity || seg.arrivalAirport || seg.to || "";
            let dur = "";
            if (seg.arrival && nextSeg.departure) {
              const diff = new Date(nextSeg.departure).getTime() - new Date(seg.arrival).getTime();
              if (diff > 0) {
                const h = Math.floor(diff / 3600000);
                const m = Math.round((diff % 3600000) / 60000);
                dur = h > 0 ? `${h}h${m > 0 ? m + "m" : ""}` : `${m}m`;
              }
            }
            parts.push(dur ? `${city} ${dur}` : city);
          }
          return parts.length ? ` via ${parts.join(", ")}` : "";
        }

        const allSorted = [...allFlights].sort((a, b) => a.price - b.price);
        const cheapestOverall = allSorted[0];
        const fastestOverall = [...allFlights].sort((a, b) => durationToMin(a.duration) - durationToMin(b.duration))[0];

        const picks: any[] = [];
        const seenKeys = new Set<string>();

        function flightKey(f: any) {
          return `${f.airline || f.airlineName}_${f.price}_${f.departure}`;
        }

        picks.push({ ...cheapestOverall, _tag: bn ? BN.cheapest : "✅ Cheapest" });
        seenKeys.add(flightKey(cheapestOverall));

        const fastKey = flightKey(fastestOverall);
        if (!seenKeys.has(fastKey)) {
          picks.push({ ...fastestOverall, _tag: bn ? BN.fastest : "⚡ Fastest" });
          seenKeys.add(fastKey);
        }

        const byAirline: Record<string, any> = {};
        for (const f of allSorted) {
          const key = resolveAirlineName(f);
          if (!byAirline[key]) byAirline[key] = f;
        }
        for (const [, f] of Object.entries(byAirline)) {
          const k = flightKey(f);
          if (!seenKeys.has(k)) {
            picks.push(f);
            seenKeys.add(k);
          }
          if (picks.length >= 5) break;
        }

        // Fetch airline_settings from DB for fallback baggage/policy info
        const airlineCodes = [...new Set(picks.map((f: any) => f.airline).filter(Boolean))];
        let airlineSettingsMap: Record<string, any> = {};
        if (airlineCodes.length > 0) {
          try {
            const sb = getSupabaseAdmin();
            const { data: settings } = await sb.from("airline_settings").select("*").in("airline_code", airlineCodes);
            if (settings) {
              for (const s of settings) airlineSettingsMap[s.airline_code] = s;
            }
          } catch (_) { /* ignore */ }
        }

        function formatFlight(f: any, idx: number): string {
          const airline = resolveAirlineName(f);
          const price = fmtPrice(f.price, currency);
          const dep = f.departure?.includes("T") ? f.departure.split("T")[1]?.substring(0, 5) : f.departure;
          const arr = f.arrival?.includes("T") ? f.arrival.split("T")[1]?.substring(0, 5) : f.arrival;
          const tag = f._tag ? ` ${f._tag}` : "";
          const stopText = f.stops === 0 ? (bn ? BN.direct : "Direct") : `${bn ? BN.stop(f.stops) : (f.stops === 1 ? "1 stop" : `${f.stops} stops`)}${getLayoverInfo(f)}`;

          // Baggage info
          const bag = f.baggageAllowance;
          const dbSettings = airlineSettingsMap[f.airline] || null;
          const checkinBag = bag?.checkin || dbSettings?.checkin_baggage || null;
          const cabinBag = bag?.cabin || dbSettings?.cabin_baggage || null;
          const bagParts: string[] = [];
          if (checkinBag) bagParts.push(`${bn ? BN.checkinBag : "🧳 Check-in"}: ${checkinBag}`);
          if (cabinBag) bagParts.push(`${bn ? BN.cabinBag : "👜 Cabin"}: ${cabinBag}`);
          const bagText = bagParts.length > 0 ? `\n   ${bagParts.join(" · ")}` : "";

          // Fare class
          const classText = f.class || f.classOfBooking || "";

          // Fare rules
          const ruleParts: string[] = [];
          if (f.isRefundable === true) ruleParts.push(bn ? BN.refundable : "✅ Refundable");
          else if (f.isRefundable === false) ruleParts.push(bn ? BN.nonRefundable : "❌ Non-refundable");

          if (f.penalties?.cancellation) {
            const cp = f.penalties.cancellation;
            if (cp.amount) ruleParts.push(`${bn ? BN.cancellationFee : "Cancellation fee"}: ${fmtPrice(cp.amount, cp.currency || currency)}`);
            else if (cp.percentage) ruleParts.push(`${bn ? BN.cancellationFee : "Cancellation fee"}: ${cp.percentage}%`);
          } else if (dbSettings?.cancellation_policy) {
            ruleParts.push(`📋 ${dbSettings.cancellation_policy}`);
          }

          if (f.penalties?.dateChange) {
            const dc = f.penalties.dateChange;
            if (dc.amount) ruleParts.push(`${bn ? BN.dateChangeFee : "Date change fee"}: ${fmtPrice(dc.amount, dc.currency || currency)}`);
            else if (dc.percentage) ruleParts.push(`${bn ? BN.dateChangeFee : "Date change fee"}: ${dc.percentage}%`);
          } else if (dbSettings?.date_change_policy) {
            ruleParts.push(`📅 ${dbSettings.date_change_policy}`);
          }

          const classLine = classText ? `\n   📋 ${classText}` : "";
          const ruleLine = ruleParts.length > 0 ? `\n   ${ruleParts.join(" · ")}` : "";

          return `**${idx}. ${airline}** — ${price}${tag}\n   ${dep} → ${arr} · ${f.duration} · ${stopText}${bagText}${classLine}${ruleLine}`;
        }

        const lines = picks.map((f, i) => formatFlight(f, i + 1));

        const summary = [
          bn ? BN.flightsTitle(tripLabel, params.from, params.to) : `✈️ **${tripLabel} Flights: ${params.from} → ${params.to}**`,
          `📅 ${params.date}${params.return_date ? ` – ${params.return_date}` : ""} | 👤 ${paxParts.join(", ")}`,
          ``,
          lines.join("\n\n"),
          ``,
          bn ? BN.priceNote(currency) : `💡 Prices per person in ${currency}, taxes included. Fares may change.`,
          ``,
          bn ? BN.pickFlight : `Which flight would you like to book? Just tell me the number! ✈️`,
        ].join("\n");

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `ফ্লাইট search-এ সমস্যা হয়েছে: ${err.message}` : `Error searching flights: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Check Baggage (live API) ──
  server.tool(
    "check_baggage",
    "Check real baggage allowance for a specific flight route, airline, or date by querying live flight data. Use when customer asks about baggage limits, luggage policy, or carry-on allowance for a specific itinerary or airline on a route. Requires at least origin, destination, and a date.",
    {
      from: z.string().describe("Origin airport IATA code"),
      to: z.string().describe("Destination airport IATA code"),
      date: z.string().describe("Travel date YYYY-MM-DD"),
      airline: z.string().optional().describe("Specific airline name or code to filter"),
      cabin_class: z.string().optional().describe("Cabin class (Economy, Business, First). Default Economy."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const result = await callEdgeFunction("unified-flight-search", {
          from: params.from.toUpperCase(),
          to: params.to.toUpperCase(),
          departDate: params.date,
          adults: 1,
          children: 0,
          infants: 0,
          cabinClass: params.cabin_class || "Economy",
          currency: "BDT",
        });

        if (!result?.success || !result?.flights?.length) {
          // Fallback to airline_settings DB
          const sb = getSupabaseAdmin();
          const searchTerm = params.airline || "";
          if (searchTerm) {
            const { data: settings } = await sb
              .from("airline_settings")
              .select("*")
              .or(`airline_code.ilike.%${searchTerm}%,airline_name.ilike.%${searchTerm}%`)
              .limit(1);
            if (settings?.length) {
              const s = settings[0];
              if (bn) {
                return {
                  content: [{ type: "text" as const, text: `🧳 **Baggage — ${s.airline_name}**\n\n👜 **Cabin baggage:** ${s.cabin_baggage}\n🧳 **Check-in baggage:** ${s.checkin_baggage}\n\n⚠️ এটি standard allowance। আসল baggage fare class এবং route অনুযায়ী ভিন্ন হতে পারে। ${params.from}→${params.to} রুটে ${params.date} তারিখে কোনো live flight পাওয়া যায়নি।` }],
                };
              }
              return {
                content: [{ type: "text" as const, text: `🧳 **Baggage Allowance — ${s.airline_name}**\n\n👜 **Cabin baggage:** ${s.cabin_baggage}\n🧳 **Check-in baggage:** ${s.checkin_baggage}\n\n⚠️ This is the standard allowance. Actual baggage may vary by fare class and route. No live flights found for ${params.from}→${params.to} on ${params.date}.` }],
              };
            }
          }
          return {
            content: [{ type: "text" as const, text: bn ? BN.noBaggageFlights(params.from, params.to, params.date) : `No flights found for ${params.from}→${params.to} on ${params.date} to check baggage.` }],
          };
        }

        const flights = result.flights as any[];
        let filtered = flights;
        if (params.airline) {
          const airlineSearch = params.airline.toUpperCase();
          filtered = flights.filter((f: any) => {
            const code = (f.airline || "").toUpperCase();
            const name = (f.airlineName || "").toUpperCase();
            return code.includes(airlineSearch) || name.includes(airlineSearch) || airlineSearch.includes(code);
          });
          if (filtered.length === 0) filtered = flights;
        }

        // Group by airline and collect unique baggage info
        const airlineBaggage: Record<string, { name: string; code: string; bags: Set<string>; fares: string[] }> = {};
        for (const f of filtered.slice(0, 20)) {
          const code = f.airline || "??";
          const name = resolveAirlineName(f);
          if (!airlineBaggage[code]) {
            airlineBaggage[code] = { name, code, bags: new Set(), fares: [] };
          }
          const bag = f.baggageAllowance;
          const checkin = bag?.checkin || "Not specified";
          const cabin = bag?.cabin || "7 Kg (standard)";
          const fareClass = f.class || f.classOfBooking || "Economy";
          const key = `Check-in: ${checkin} | Cabin: ${cabin} | Fare: ${fareClass}`;
          airlineBaggage[code].bags.add(key);
          if (!airlineBaggage[code].fares.includes(fareClass)) {
            airlineBaggage[code].fares.push(fareClass);
          }
        }

        const lines: string[] = [];
        for (const [, info] of Object.entries(airlineBaggage)) {
          lines.push(`✈️ **${info.name}**`);
          for (const bagLine of info.bags) {
            const parts = bagLine.split(" | ");
            for (const p of parts) {
              lines.push(`   ${p.startsWith("Check-in") ? "🧳" : p.startsWith("Cabin") ? "👜" : "📋"} ${p}`);
            }
          }
          lines.push("");
        }

        const route = `${params.from} → ${params.to}`;
        const summary = [
          bn ? BN.baggageTitle(route) : `🧳 **Baggage Allowance — ${route}**`,
          `📅 ${params.date} | ${params.cabin_class || "Economy"}`,
          ``,
          ...lines,
          bn ? BN.baggageNote : `⚠️ Baggage allowances are based on live fare data and may vary by fare class. Extra baggage can be purchased during booking.`,
        ].join("\n");

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Baggage চেক করতে সমস্যা: ${err.message}` : `Error checking baggage: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Search Student Flights ──
  server.tool(
    "search_student_flights",
    "Search for student fare flights. ONLY use when the customer explicitly mentions they are a student or asks for student fares. This searches Travelport/GDS only (no Tripjack/LCC). Do NOT create a booking for student fares — hand off to a human agent instead.",
    {
      from: z.string().describe("Origin airport IATA code"),
      to: z.string().describe("Destination airport IATA code"),
      date: z.string().describe("Departure date in YYYY-MM-DD format."),
      return_date: z.string().optional().describe("Return date YYYY-MM-DD for round-trip."),
      adults: z.number().optional().describe("Number of passengers. Default 1."),
      currency: z.string().optional().describe("Currency code. Default BDT."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const result = await callEdgeFunction("unified-flight-search", {
          from: params.from.toUpperCase(),
          to: params.to.toUpperCase(),
          departDate: params.date,
          returnDate: params.return_date || null,
          adults: params.adults || 1,
          children: 0,
          infants: 0,
          cabinClass: "Economy",
          currency: params.currency || "BDT",
          studentFare: true,
        });

        if (!result?.success || !result?.flights?.length) {
          return {
            content: [{ type: "text" as const, text: bn ? BN.noStudentFlights(params.from, params.to, params.date) : `No student fare flights found from ${params.from} to ${params.to} on ${params.date}. Try different dates or nearby airports.` }],
          };
        }

        const currency = params.currency || "BDT";
        const flights = result.flights;
        flights.sort((a: any, b: any) => a.price - b.price);
        const top = flights.slice(0, 6);

        const lines = top.map((f: any, i: number) => {
          const airline = resolveAirlineName(f);
          const price = fmtPrice(f.price, currency);
          const stops = f.stops === 0 ? "Direct" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
          const dep = f.departure?.includes("T") ? f.departure.split("T")[1]?.substring(0, 5) : f.departure;
          const arr = f.arrival?.includes("T") ? f.arrival.split("T")[1]?.substring(0, 5) : f.arrival;
          const refundTag = f.isRefundable ? (bn ? BN.refundable : "✅ Refundable") : (bn ? BN.nonRefundable : "❌ Non-refundable");
          const bag = f.baggageAllowance;
          const bagParts: string[] = [];
          if (bag?.checkin) bagParts.push(`🧳 ${bag.checkin}`);
          if (bag?.cabin) bagParts.push(`👜 ${bag.cabin}`);
          const bagLine = bagParts.length ? `\n   ${bagParts.join(" · ")}` : "";
          return [
            `**${i + 1}. ${airline}** — ${price}/${bn ? "জন" : "person"}`,
            `   🕐 ${dep} → ${arr}  ⏱ ${f.duration}  ✈️ ${stops}`,
            `   📋 Economy • ${refundTag}${bagLine}`,
          ].join("\n");
        });

        const summary = [
          bn ? BN.studentTitle(params.from, params.to) : `🎓 **Student Fare Flights: ${params.from} → ${params.to}**`,
          `📅 ${params.date}${params.return_date ? ` – ${params.return_date}` : ""}`,
          ``,
          bn ? BN.studentFound(flights.length) : `Found **${flights.length}** options. Here are the best picks:`,
          ``,
          lines.join("\n\n"),
          ``,
          `---`,
          bn ? `💡 প্রতি জনের দাম ${currency}-তে, ট্যাক্সসহ। ভাড়া পরিবর্তন হতে পারে।` : `💡 Prices per person in ${currency}, taxes included. Fares may change.`,
          ``,
          bn ? BN.studentProceed : `🎓 **To proceed with student fare booking:**\n1. Please send a **photo of your passport** right here in chat\n2. Please send a **photo of your student visa or student ID**\n\n📞 Our travel expert will review your documents, apply the best student fare, and complete the booking for you!`,
        ].join("\n");

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Student flight search-এ সমস্যা: ${err.message}` : `Error searching student flights: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Search Hotels ──
  server.tool(
    "search_hotels",
    "Search for hotel prices and availability in a city. Use when a customer asks about hotel rates, accommodation, or where to stay.",
    {
      city: z.string().describe("City name to search hotels in (e.g. Dubai, Bangkok, Dhaka)."),
      checkin: z.string().describe("Check-in date in YYYY-MM-DD format."),
      checkout: z.string().describe("Check-out date in YYYY-MM-DD format."),
      adults: z.number().optional().describe("Number of adult guests. Default 2."),
      rooms: z.number().optional().describe("Number of rooms. Default 1."),
      stars: z.number().optional().describe("Minimum star rating filter (1-5). Omit for all."),
      currency: z.string().optional().describe("Display currency code. Default BDT."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const searchBody = {
          city: params.city,
          checkin: params.checkin,
          checkout: params.checkout,
          adults: params.adults || 2,
          rooms: params.rooms || 1,
          currency: params.currency || "BDT",
        };

        const [tvResult, tjResult] = await Promise.allSettled([
          callEdgeFunction("travelvela-hotel-search", searchBody),
          callEdgeFunction("tripjack-hotel-search", {
            cityName: params.city,
            checkin: params.checkin,
            checkout: params.checkout,
            adults: params.adults || 2,
            rooms: params.rooms || 1,
          }),
        ]);

        const hotels: any[] = [];

        if (tvResult.status === "fulfilled" && tvResult.value?.success && tvResult.value?.hotels?.length) {
          for (const h of tvResult.value.hotels.slice(0, 10)) {
            hotels.push({ name: h.name || h.hotelName, stars: h.stars || h.rating || 0, price: h.price || h.totalPrice || 0, currency: params.currency || "BDT" });
          }
        }

        if (tjResult.status === "fulfilled" && tjResult.value?.success && tjResult.value?.hotels?.length) {
          for (const h of tjResult.value.hotels.slice(0, 10)) {
            hotels.push({ name: h.name || h.hotelName, stars: h.stars || h.starRating || 0, price: h.price || h.totalPrice || 0, currency: params.currency || "BDT" });
          }
        }

        const filtered = params.stars ? hotels.filter((h) => h.stars >= params.stars) : hotels;
        filtered.sort((a, b) => a.price - b.price);

        if (filtered.length === 0) {
          return { content: [{ type: "text" as const, text: bn ? BN.noHotels(params.city, params.checkin, params.checkout) : `No hotels found in ${params.city} for ${params.checkin} to ${params.checkout}. Try different dates.` }] };
        }

        const top = filtered.slice(0, 10);
        const currency = params.currency || "BDT";
        const nights = Math.max(1, Math.ceil((new Date(params.checkout).getTime() - new Date(params.checkin).getTime()) / 86400000));

        const lines = top.map((h: any, i: number) => {
          const starStr = "⭐".repeat(Math.min(h.stars, 5));
          return `${i + 1}. **${h.name}** ${starStr}\n   ${fmtPrice(h.price, currency)} — ${nights} ${bn ? "রাত" : (nights > 1 ? "nights" : "night")}`;
        });

        const summary = [
          bn ? BN.hotelsTitle(params.city) : `## 🏨 Hotels in ${params.city}`,
          bn ? BN.hotelDates(params.checkin, params.checkout, nights) : `**Dates:** ${params.checkin} → ${params.checkout} (${nights} night${nights > 1 ? "s" : ""})`,
          bn ? BN.hotelGuests(params.adults || 2, params.rooms || 1) : `**Guests:** ${params.adults || 2}, ${params.rooms || 1} room${(params.rooms || 1) > 1 ? "s" : ""}`,
          bn ? BN.hotelFound(filtered.length, top.length) : `**${filtered.length} options found** (showing top ${top.length}):`,
          ``,
          ...lines,
          ``,
          bn ? BN.hotelPriceNote(currency) : `💡 Prices in ${currency}, taxes included. Rates may change.`,
        ].join("\n");

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Hotel search-এ সমস্যা: ${err.message}` : `Error searching hotels: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Check Booking ──
  server.tool(
    "check_booking",
    "Look up an existing booking by booking ID, confirmation number, or customer email. Use when a customer asks about their booking status, itinerary, or confirmation details.",
    {
      booking_id: z.string().optional().describe("The booking reference ID or confirmation number provided by the customer."),
      email: z.string().optional().describe("Customer's email address to look up their bookings."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const sb = getSupabaseAdmin();
        let bookings: any[] = [];

        if (params.booking_id) {
          const { data: byId } = await sb
            .from("bookings")
            .select("*")
            .or(`booking_id.eq.${params.booking_id},confirmation_number.eq.${params.booking_id}`)
            .limit(5);
          if (byId?.length) bookings = byId;

          if (!bookings.length) {
            const { data: byUuid } = await sb.from("bookings").select("*").eq("id", params.booking_id).limit(1);
            if (byUuid?.length) bookings = byUuid;
          }
        }

        if (!bookings.length && params.email) {
          const { data: profiles } = await sb.from("profiles").select("user_id").eq("email", params.email).limit(1);
          if (profiles?.length) {
            const { data: userBookings } = await sb.from("bookings").select("*").eq("user_id", profiles[0].user_id).order("created_at", { ascending: false }).limit(5);
            if (userBookings?.length) bookings = userBookings;
          }
        }

        if (!bookings.length) {
          const notFoundMsg = bn
            ? `কোনো booking পাওয়া যায়নি${params.booking_id ? ` "${params.booking_id}" ID-তে` : ""}${params.email ? ` "${params.email}" email-এ` : ""}। তথ্য যাচাই করে আবার চেষ্টা করুন।`
            : `No bookings found${params.booking_id ? ` for ID "${params.booking_id}"` : ""}${params.email ? ` for email "${params.email}"` : ""}. Please verify the details and try again.`;
          return { content: [{ type: "text" as const, text: notFoundMsg }] };
        }

        const lines = bookings.map((b: any) => {
          const status = b.status || "Unknown";
          const emoji = status === "Confirmed" ? "✅" : status === "Paid" ? "💳" : status === "Cancelled" ? "❌" : "📋";
          const date = b.created_at ? new Date(b.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
          const conf = b.confirmation_number ? `\n- **Confirmation:** ${b.confirmation_number}` : "";

          return [
            `### ${emoji} ${b.title}`,
            `- **${bn ? "Order Number" : "Order Number"}:** ${b.booking_id}${conf}`,
            `- **Type:** ${b.type} | **Status:** ${status}`,
            `- **${bn ? "মোট" : "Total"}:** ${fmtPrice(b.total, "BDT")}`,
            b.subtitle ? `- **Route:** ${b.subtitle}` : "",
            `- **${bn ? "তারিখ" : "Date"}:** ${date}`,
          ].filter(Boolean).join("\n");
        });

        const summary = [
          bn ? BN.bookingTitle : `## 📋 Booking Details`,
          ...lines,
          ``,
          bn ? BN.bookingChanges : `💡 *For changes or cancellations, please provide the booking ID and our team will assist you.*`,
        ].join("\n\n");

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Booking চেক করতে সমস্যা: ${err.message}` : `Error checking booking: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Create Booking ──
  server.tool(
    "create_booking",
    "Create a flight booking after collecting all passenger details and contact info. Saves the booking with 'Needs Payment' status and returns an order number. Use when customer has provided: full names, DOBs, passport details, email, and phone for all travelers.",
    {
      flight_summary: z.string().describe("Brief flight description e.g. 'Air India DAC→CCU 28 Mar 2026, 11:45→19:55, 1 stop'"),
      from: z.string().describe("Origin airport IATA code"),
      to: z.string().describe("Destination airport IATA code"),
      date: z.string().describe("Departure date YYYY-MM-DD"),
      return_date: z.string().optional().describe("Return date YYYY-MM-DD if round-trip"),
      airline: z.string().describe("Airline name"),
      price_per_person: z.number().describe("Price per person in the quoted currency"),
      currency: z.string().optional().describe("Currency code. Default BDT."),
      passengers: z.array(z.object({
        full_name: z.string().describe("Full name as on passport"),
        dob: z.string().describe("Date of birth YYYY-MM-DD"),
        passport_number: z.string().describe("Passport number"),
        passport_expiry: z.string().describe("Passport expiry date YYYY-MM-DD"),
        nationality: z.string().describe("Nationality / country"),
      })).describe("Array of passenger details"),
      contact_email: z.string().describe("Contact email address"),
      contact_phone: z.string().describe("Contact phone number with country code"),
      is_immediate_ticketing: z.boolean().optional().describe("True if LCC/immediate ticketing flight requiring agent handling. Default false."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const sb = getSupabaseAdmin();
        const currency = params.currency || "BDT";
        const totalPrice = params.price_per_person * params.passengers.length;
        const isImmediate = params.is_immediate_ticketing || false;

        const bookingId = `FL-${Date.now().toString(36).toUpperCase()}`;
        const route = `${params.from} → ${params.to}`;

        const bookingData = {
          booking_id: bookingId,
          title: `${params.airline} — ${route}`,
          subtitle: `${route} | ${params.date}${params.return_date ? ` - ${params.return_date}` : ""}`,
          type: "Flight",
          status: isImmediate ? "Pending - Immediate Ticketing" : "Needs Payment",
          total: totalPrice,
          user_id: "00000000-0000-0000-0000-000000000000",
          details: {
            source: "crisp_chat",
            flight_summary: params.flight_summary,
            from: params.from,
            to: params.to,
            date: params.date,
            return_date: params.return_date || null,
            airline: params.airline,
            price_per_person: params.price_per_person,
            currency,
            passengers: params.passengers,
            contact_email: params.contact_email,
            contact_phone: params.contact_phone,
            is_immediate_ticketing: isImmediate,
            passport_images_pending: true,
            visa_images_pending: true,
          },
        };

        const { data, error } = await sb.from("bookings").insert(bookingData).select("id, booking_id").single();

        if (error) throw new Error(`Failed to create booking: ${error.message}`);

        if (isImmediate) {
          const response = [
            bn ? BN.bookingImmediate : `## ⚡ Booking Saved — Immediate Ticketing Required`,
            ``,
            `**Order Number:** \`${data.booking_id}\``,
            `**Flight:** ${params.airline} — ${route}`,
            `**${bn ? "তারিখ" : "Date"}:** ${params.date}${params.return_date ? ` to ${params.return_date}` : ""}`,
            `**${bn ? "যাত্রী" : "Passengers"}:** ${params.passengers.map(p => p.full_name).join(", ")}`,
            `**${bn ? "মোট" : "Total Due"}:** ${fmtPrice(totalPrice, currency)}`,
            ``,
            bn ? BN.immediateDoc : `1. Send your **passport photo** and **visa copy** (if needed) right now\n2. Our support agent will verify documents and issue the ticket\n3. Payment details will be shared once ticketing is confirmed\n\n⏳ Please share your documents quickly as seat availability is limited.`,
          ].join("\n");
          return { content: [{ type: "text" as const, text: response }] };
        }

        const response = [
          bn ? BN.bookingCreated : `## ✅ Booking Created Successfully!`,
          ``,
          `**Order Number:** \`${data.booking_id}\``,
          `**Flight:** ${params.airline} — ${route}`,
          `**${bn ? "তারিখ" : "Date"}:** ${params.date}${params.return_date ? ` to ${params.return_date}` : ""}`,
          `**${bn ? "যাত্রী" : "Passengers"}:** ${params.passengers.map(p => p.full_name).join(", ")}`,
          `**${bn ? "মোট" : "Total Due"}:** ${fmtPrice(totalPrice, currency)}`,
          `**Contact:** ${params.contact_email} | ${params.contact_phone}`,
          ``,
          bn ? BN.paymentAsk : `💳 **How would you like to pay?** Please choose one:\n\n1️⃣ **Bank Transfer**\n2️⃣ **bKash** (Merchant)\n3️⃣ **Nagad** (Merchant)\n\nJust reply with **1, 2, or 3** (or the name) and I'll share the account details! 💰`,
          ``,
          bn ? BN.paymentDeadline(data.booking_id) : `⏰ **Please complete payment within 30 minutes** to secure your booking. After payment, send a **photo/screenshot of your transaction receipt** here for verification.\n\n📸 Also, please send a **photo of your passport** and **visa copy** (if applicable) so we can proceed with ticketing.\n\n📌 *Save your order number \`${data.booking_id}\` for reference.*`,
        ].join("\n");

        return { content: [{ type: "text" as const, text: response }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Booking তৈরিতে সমস্যা: ${err.message}` : `Error creating booking: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Search Tours ──
  server.tool(
    "search_tours",
    "Search for available tour packages. Use when customer asks about tours, packages, or vacation deals.",
    {
      destination: z.string().optional().describe("Destination city or country to search tours for."),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const sb = getSupabaseAdmin();
        let query = sb.from("tours").select("*").eq("is_active", true).order("rating", { ascending: false }).limit(10);
        if (params.destination) {
          query = query.ilike("destination", `%${params.destination}%`);
        }
        const { data: tours } = await query;

        if (!tours?.length) {
          return { content: [{ type: "text" as const, text: bn ? BN.noTours(params.destination) : `No tours found${params.destination ? ` for ${params.destination}` : ""}. Try a different destination or ask about custom tours!` }] };
        }

        const lines = tours.map((t: any, i: number) => {
          return `**${i + 1}. ${t.name}** — ${fmtPrice(t.price, "BDT")}/${bn ? "জন" : "person"}\n   📍 ${t.destination} | ⏱ ${t.duration} | ⭐ ${t.rating}/5\n   🏷 ${t.category}`;
        });

        const summary = [
          bn ? BN.toursTitle(params.destination) : `## 🌍 Tour Packages${params.destination ? ` — ${params.destination}` : ""}`,
          ``,
          lines.join("\n\n"),
          ``,
          bn ? BN.toursInterest : `Interested in any tour? Or want a **custom tour** designed just for you? Just let me know! 🎒`,
        ].join("\n");

        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Tour search-এ সমস্যা: ${err.message}` : `Error searching tours: ${err.message}` }] };
      }
    }
  );

  // ── Tool: Design Custom Tour ──
  server.tool(
    "design_custom_tour",
    "Design a custom tour with AI-generated itinerary. Use when customer wants a personalized tour package.",
    {
      destination: z.string().describe("Where the customer wants to go"),
      duration: z.string().optional().describe("How long (e.g. '5 days', '1 week')"),
      interests: z.string().optional().describe("Customer interests (e.g. 'beaches, culture, food')"),
      budget: z.string().optional().describe("Budget range (e.g. 'mid-range', '50000 BDT')"),
      travelers: z.number().optional().describe("Number of travelers"),
      visitor_name: z.string().optional().describe("Customer name"),
      visitor_email: z.string().optional().describe("Customer email"),
      visitor_phone: z.string().optional().describe("Customer phone"),
      language: z.string().optional().describe("Customer language: 'bn' for Bengali, 'en' for English. Default 'en'."),
    },
    async (params) => {
      const bn = isBn(params.language);
      try {
        const sb = getSupabaseAdmin();

        await sb.from("tour_inquiries").insert({
          destination: params.destination,
          duration: params.duration || "Flexible",
          interests: params.interests || "",
          budget: params.budget || "",
          travelers: params.travelers || 1,
          visitor_name: params.visitor_name || "Chat Customer",
          visitor_email: params.visitor_email || "",
          visitor_phone: params.visitor_phone || "",
          source: "crisp_chat",
          status: "new",
        });

        const response = [
          bn ? BN.customTourSaved : `## 🌟 Custom Tour Request Saved!`,
          ``,
          `**${bn ? "গন্তব্য" : "Destination"}:** ${params.destination}`,
          params.duration ? `**${bn ? "সময়কাল" : "Duration"}:** ${params.duration}` : "",
          params.interests ? `**${bn ? "আগ্রহ" : "Interests"}:** ${params.interests}` : "",
          params.budget ? `**${bn ? "বাজেট" : "Budget"}:** ${params.budget}` : "",
          ``,
          bn ? BN.customTourFollowup : `Our travel expert will design a personalized itinerary for you and reach out shortly! 🎒\n\nIn the meantime, feel free to ask me anything else!`,
        ].filter(Boolean).join("\n");

        return { content: [{ type: "text" as const, text: response }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: bn ? `Tour request সেভ করতে সমস্যা: ${err.message}` : `Error saving tour request: ${err.message}` }] };
      }
    }
  );

  return server;
}

// ── Auth ──
function normalizeToken(token: string): string {
  return token.trim().replace(/^['"]|['"]$/g, "");
}

function verifyAuth(req: Request): boolean {
  const secretRaw = Deno.env.get("CRISP_MCP_SECRET");
  if (!secretRaw) return false;
  const secret = normalizeToken(secretRaw);

  const authHeader = (req.headers.get("Authorization") || "").trim();
  const apiKeyHeader = (req.headers.get("x-api-key") || req.headers.get("X-API-Key") || "").trim();

  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return normalizeToken(authHeader.slice(7)) === secret;
  }
  if (authHeader.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(authHeader.slice(6).trim());
      return decoded === secret || decoded === `:${secret}` || decoded.endsWith(`:${secret}`);
    } catch { /* ignore */ }
  }
  if (apiKeyHeader) {
    return normalizeToken(apiKeyHeader) === secret;
  }
  return false;
}

// ── HTTP Server (Hono + MCP) ──
const app = new Hono();

app.all("/*", async (c) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  if (!verifyAuth(c.req.raw)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const server = createMcpServer();

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  // Intercept transport.send to inject instructions
  const originalSend = transport.send.bind(transport);
  transport.send = async (message: any) => {
    if (message?.result?.serverInfo) {
      message.result.instructions = VELAAI_INSTRUCTIONS;
    }
    return originalSend(message);
  };

  await server.connect(transport);
  const response = await transport.handleRequest(c.req.raw);

  return response;
});

Deno.serve(app.fetch);
