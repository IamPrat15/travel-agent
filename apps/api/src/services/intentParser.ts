import Anthropic from "@anthropic-ai/sdk";

export interface TravelIntent {
  origin_city: string | null;
  destination_city: string;
  depart_date: string;       // YYYY-MM-DD
  depart_window: "morning" | "afternoon" | "evening" | "any";
  return_date: string;
  return_window: "morning" | "afternoon" | "evening" | "any";
  purpose: string;
  client_name: string | null;
  raw_text: string;
  /**
   * Whether the trip needs hotel booking.
   *   true:  user explicitly asked for hotel, OR overnight stay is needed
   *          (depart_date != return_date)
   *   false: user explicitly said no hotel, OR same-day trip with no overnight
   *   null:  ambiguous — orchestrator should ask user to confirm
   */
  needs_hotel: boolean | null;
  /**
   * Whether the trip is intra-city (origin == destination).
   * For the demo: detected by string match. Production: should use lat/lng.
   */
  is_intra_city: boolean;
}

const WEEKDAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const WINDOW_KEYWORDS: Record<string, string[]> = {
  morning:   ["morning", "am", "breakfast"],
  afternoon: ["afternoon", "lunch", "noon", "post-lunch"],
  evening:   ["evening", "night", "pm", "after work", "dinner"],
};
const KNOWN_CITIES = [
  "mumbai","pune","delhi","bengaluru","bangalore","chennai","hyderabad",
  "kolkata","ahmedabad","jaipur","lucknow","kochi","goa","chandigarh","indore","nagpur",
];

// Phrases that explicitly indicate NO hotel is needed
const NO_HOTEL_PHRASES = [
  "no hotel",
  "without hotel",
  "without a hotel",
  "no stay",
  "day trip",
  "same day",
  "same-day",
  "return same day",
  "returning same day",
  "no overnight",
  "without overnight",
  "no accommodation",
  "no booking required",
  "hotel not required",
  "hotel is not required",
  "no hotel booking",
  "no hotel required",
];

// Phrases that explicitly indicate hotel IS needed
const HOTEL_NEEDED_PHRASES = [
  "need a hotel",
  "need hotel",
  "book a hotel",
  "book hotel",
  "with hotel",
  "and hotel",
  "stay overnight",
  "overnight stay",
  "for the night",
  "stay the night",
];

// ---------- Public entry point ----------

export async function parseIntent(text: string, today: Date = new Date()): Promise<TravelIntent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.length > 10) {
    try {
      return await parseWithLLM(text, today, apiKey);
    } catch (err) {
      console.warn("[intentParser] LLM call failed, falling back to regex:", (err as Error).message);
    }
  }
  return parseWithRegex(text, today);
}

// ---------- LLM path ----------

async function parseWithLLM(text: string, today: Date, apiKey: string): Promise<TravelIntent> {
  const client = new Anthropic({ apiKey });
  const todayStr = today.toISOString().slice(0, 10);
  const todayWeekday = WEEKDAYS[(today.getDay() + 6) % 7];

  const systemPrompt = `You parse one-line business travel requests into JSON.
Today is ${todayStr} (${todayWeekday}).

Return ONLY a JSON object with these exact keys:
{
  "origin_city":      string or null,
  "destination_city": string,
  "depart_date":      "YYYY-MM-DD",
  "depart_window":    "morning" | "afternoon" | "evening" | "any",
  "return_date":      "YYYY-MM-DD",
  "return_window":    "morning" | "afternoon" | "evening" | "any",
  "purpose":          short string,
  "client_name":      string or null,
  "needs_hotel":      true | false | null
}

CRITICAL: Read the request carefully. Do not invent details.

Date rules:
- Resolve weekday names ("Tuesday") to the NEXT future occurrence.
- "tomorrow" = today + 1.
- "today" = today.
- If no return is given AND the trip seems like a day trip (e.g., "morning ... evening", "day trip"), return_date = depart_date.
- Otherwise, return_date = depart_date + 1.

Hotel rules — read these carefully:
- needs_hotel = false if the user explicitly says: "no hotel", "day trip", "same day", "no overnight", "no accommodation", "hotel not required", "no hotel booking", or similar.
- needs_hotel = false if the user describes a same-day round trip (e.g., "morning ... evening", "10 AM ... 6 PM same day", departure and return on the same date).
- needs_hotel = true if user explicitly mentions hotel, overnight, "stay the night", multi-day with no other signal.
- needs_hotel = null only when the request is genuinely ambiguous (multi-day trip but user didn't say either way).

City names: title case ("Pune", "Bengaluru").

Output only the JSON object. No markdown, no commentary.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in LLM response");

  const cleaned = block.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  // Compute is_intra_city. The LLM doesn't compute this — origin matching
  // destination by string is a server-side concern.
  const origin = parsed.origin_city ?? null;
  const dest = parsed.destination_city ?? "Unknown";
  const isIntraCity = origin !== null && origin.trim().toLowerCase() === dest.trim().toLowerCase();

  // Apply same-day inference if needs_hotel was returned as null
  let needsHotel: boolean | null = parsed.needs_hotel ?? null;
  if (needsHotel === null && parsed.depart_date === parsed.return_date) {
    needsHotel = false;
  }

  return {
    origin_city: origin,
    destination_city: dest,
    depart_date: parsed.depart_date,
    depart_window: parsed.depart_window ?? "any",
    return_date: parsed.return_date,
    return_window: parsed.return_window ?? "any",
    purpose: parsed.purpose ?? "business",
    client_name: parsed.client_name ?? null,
    raw_text: text,
    needs_hotel: needsHotel,
    is_intra_city: isIntraCity,
  };
}

// ---------- Regex fallback ----------

function parseWithRegex(text: string, today: Date): TravelIntent {
  const lower = text.toLowerCase();

  const dest = extractCity(lower, ["to ", "in ", "at ", "for "]) ?? extractAnyCity(lower);
  const origin = extractCity(lower, ["from "]);

  const { depart, returnDt, dayTrip } = extractDates(lower, today);
  const departWindow = extractWindow(lower);
  const returnWindow = extractReturnWindow(lower);
  const clientName = extractClient(text);

  // Detect hotel intent from phrases
  const explicitNoHotel = NO_HOTEL_PHRASES.some((p) => lower.includes(p));
  const explicitYesHotel = HOTEL_NEEDED_PHRASES.some((p) => lower.includes(p));

  let needsHotel: boolean | null;
  if (explicitNoHotel) needsHotel = false;
  else if (explicitYesHotel) needsHotel = true;
  else if (dayTrip) needsHotel = false;
  else if (depart.toISOString().slice(0, 10) === returnDt.toISOString().slice(0, 10)) needsHotel = false;
  else needsHotel = null; // ambiguous, orchestrator should ask

  const destStr = dest ?? "Unknown";
  const isIntraCity = origin !== null && origin.toLowerCase() === destStr.toLowerCase();

  return {
    origin_city: origin,
    destination_city: destStr,
    depart_date: depart.toISOString().slice(0, 10),
    depart_window: departWindow,
    return_date: returnDt.toISOString().slice(0, 10),
    return_window: returnWindow,
    purpose: lower.includes("client") || lower.includes("meeting") ? "client meeting" : "business",
    client_name: clientName,
    raw_text: text,
    needs_hotel: needsHotel,
    is_intra_city: isIntraCity,
  };
}

function extractCity(lower: string, prepositions: string[]): string | null {
  for (const prep of prepositions) {
    for (const city of KNOWN_CITIES) {
      if (lower.includes(`${prep}${city}`)) return titleCase(city);
    }
  }
  return null;
}

function extractAnyCity(lower: string): string | null {
  for (const city of KNOWN_CITIES) {
    if (lower.includes(city)) return titleCase(city);
  }
  return null;
}

interface DateExtractionResult {
  depart: Date;
  returnDt: Date;
  /** True if the request describes a same-day trip (day trip or "morning ... evening" pattern) */
  dayTrip: boolean;
}

function extractDates(lower: string, today: Date): DateExtractionResult {
  let depart = addDays(today, 1);
  let returnDt = addDays(depart, 1);
  let dayTrip = false;

  // Detect "tomorrow"
  if (lower.includes("tomorrow")) {
    depart = addDays(today, 1);
    returnDt = addDays(depart, 1);
  } else if (lower.includes("today")) {
    depart = new Date(today);
    returnDt = addDays(depart, 1);
  }

  const todayDow = (today.getDay() + 6) % 7;
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const wd = WEEKDAYS[i];
    const idx = lower.indexOf(wd);
    if (idx >= 0) {
      let daysAhead = (i - todayDow + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      depart = addDays(today, daysAhead);

      const rest = lower.substring(idx + wd.length);
      let secondIdx: number | null = null;
      for (let j = 0; j < WEEKDAYS.length; j++) {
        if (rest.includes(WEEKDAYS[j])) { secondIdx = j; break; }
      }
      if (secondIdx !== null) {
        const departDow = (depart.getDay() + 6) % 7;
        let d2 = (secondIdx - departDow + 7) % 7;
        if (d2 === 0) d2 = 7;
        returnDt = addDays(depart, d2);
      } else {
        returnDt = addDays(depart, 1);
      }
      break;
    }
  }

  // Same-day signals: "day trip", "same day", "morning ... evening" pattern,
  // "tomorrow morning ... return same day", or "10 AM ... return"
  const dayTripSignals = [
    "day trip",
    "same day",
    "same-day",
    "return same day",
    "returning same day",
  ];
  if (dayTripSignals.some((s) => lower.includes(s))) {
    dayTrip = true;
    returnDt = new Date(depart);
  }

  // "morning ... evening" pattern (heuristic: both keywords present in same trip)
  // and no second weekday referenced. Trips that span "morning to evening" of
  // the same day are day trips.
  const hasMorning = WINDOW_KEYWORDS.morning.some((kw) => lower.includes(kw));
  const hasEvening = WINDOW_KEYWORDS.evening.some((kw) => lower.includes(kw));
  if (hasMorning && hasEvening && !dayTrip) {
    // Check there isn't a second weekday explicitly mentioned
    let weekdayCount = 0;
    for (const wd of WEEKDAYS) if (lower.includes(wd)) weekdayCount++;
    if (weekdayCount <= 1) {
      dayTrip = true;
      returnDt = new Date(depart);
    }
  }

  return { depart, returnDt, dayTrip };
}

function extractWindow(lower: string): TravelIntent["depart_window"] {
  for (const [w, kws] of Object.entries(WINDOW_KEYWORDS)) {
    for (const kw of kws) if (lower.includes(kw)) return w as TravelIntent["depart_window"];
  }
  return "any";
}

function extractReturnWindow(lower: string): TravelIntent["return_window"] {
  for (const trig of ["back", "return", "returning"]) {
    const idx = lower.indexOf(trig);
    if (idx >= 0) {
      const tail = lower.substring(idx);
      for (const [w, kws] of Object.entries(WINDOW_KEYWORDS)) {
        for (const kw of kws) if (tail.includes(kw)) return w as TravelIntent["return_window"];
      }
    }
  }
  return "any";
}

function extractClient(text: string): string | null {
  const m1 = /client\s+([A-Z][\w& ]{2,40})/.exec(text);
  if (m1) return m1[1].trim();
  const m2 = /meeting\s+([A-Z][\w& ]{2,40})/.exec(text);
  if (m2) return m2[1].trim();
  const m3 = /meeting with\s+([A-Z][\w& ]{2,40})/.exec(text);
  if (m3) return m3[1].trim();
  return null;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function titleCase(s: string): string {
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
