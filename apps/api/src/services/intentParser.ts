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
  const todayWeekday = WEEKDAYS[(today.getDay() + 6) % 7]; // JS Sunday=0; we want Monday=0

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
  "client_name":      string or null
}

Rules:
- Resolve weekday names ("Tuesday") to the NEXT future occurrence of that weekday from today.
- If no return date is given, assume next day after departure.
- City names: title case, e.g. "Pune", "Bengaluru".
- Output only the JSON object. No markdown, no commentary.`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in LLM response");

  // Strip code fences if the model added them
  const cleaned = block.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);

  return {
    origin_city: parsed.origin_city ?? null,
    destination_city: parsed.destination_city,
    depart_date: parsed.depart_date,
    depart_window: parsed.depart_window ?? "any",
    return_date: parsed.return_date,
    return_window: parsed.return_window ?? "any",
    purpose: parsed.purpose ?? "business",
    client_name: parsed.client_name ?? null,
    raw_text: text,
  };
}

// ---------- Regex fallback ----------

function parseWithRegex(text: string, today: Date): TravelIntent {
  const lower = text.toLowerCase();

  const dest = extractCity(lower, ["to ", "in ", "at ", "for "]) ?? extractAnyCity(lower);
  const origin = extractCity(lower, ["from "]);

  const { depart, returnDt } = extractDates(lower, today);
  const departWindow = extractWindow(lower);
  const returnWindow = extractReturnWindow(lower);
  const clientName = extractClient(text);

  return {
    origin_city: origin,
    destination_city: dest ?? "Unknown",
    depart_date: depart.toISOString().slice(0, 10),
    depart_window: departWindow,
    return_date: returnDt.toISOString().slice(0, 10),
    return_window: returnWindow,
    purpose: lower.includes("client") || lower.includes("meeting") ? "client meeting" : "business",
    client_name: clientName,
    raw_text: text,
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

function extractDates(lower: string, today: Date): { depart: Date; returnDt: Date } {
  let depart = addDays(today, 1);
  let returnDt = addDays(depart, 1);

  const todayDow = (today.getDay() + 6) % 7; // make Mon=0
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const wd = WEEKDAYS[i];
    const idx = lower.indexOf(wd);
    if (idx >= 0) {
      let daysAhead = (i - todayDow + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      depart = addDays(today, daysAhead);

      // Look for a SECOND weekday after the first occurrence, for return
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
  return { depart, returnDt };
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
  const m2 = /meeting with\s+([A-Z][\w& ]{2,40})/.exec(text);
  if (m2) return m2[1].trim();
  return null;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
