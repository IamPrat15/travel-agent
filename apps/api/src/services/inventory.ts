import { randomUUID } from "node:crypto";
import { TravelIntent } from "./intentParser";
import { PolicyDecision } from "./policyEngine";

export interface TripOption {
  option_id: string;
  mode: string;
  provider: string;
  depart_dt: string;
  arrive_dt: string;
  travel_class: string;
  fare_inr: number;
}

export interface HotelOption {
  hotel_id: string;
  name: string;
  category_stars: number;
  address: string;
  distance_km_from_client: number;
  nightly_rate_inr: number;
  total_inr: number;
}

const WINDOW_HOUR: Record<string, [number, number]> = {
  morning: [9, 30],
  afternoon: [14, 0],
  evening: [18, 30],
  any: [11, 0],
};

export function searchOutbound(intent: TravelIntent, decision: PolicyDecision): TripOption {
  return makeOption(intent.depart_date, intent.depart_window, decision, "outbound");
}

export function searchInbound(intent: TravelIntent, decision: PolicyDecision): TripOption {
  return makeOption(intent.return_date, intent.return_window, decision, "inbound");
}

export function searchHotel(
  clientCity: string,
  clientAddress: string,
  decision: PolicyDecision,
  checkIn: string,
  checkOut: string
): HotelOption {
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  const nights = Math.max(1, Math.round(ms / (24 * 3600 * 1000)));
  const rateByStars: Record<number, number> = { 3: 4500, 4: 7500, 5: 13000 };
  const namesByStars: Record<number, string> = { 3: "Ginger", 4: "Vivanta", 5: "Taj" };
  const rate = rateByStars[decision.hotel_category];
  return {
    hotel_id: `H-${randomUUID().slice(0, 6).toUpperCase()}`,
    name: `${namesByStars[decision.hotel_category]} ${clientCity}`,
    category_stars: decision.hotel_category,
    address: `Near ${clientAddress}`,
    distance_km_from_client: 1.2,
    nightly_rate_inr: rate,
    total_inr: rate * nights,
  };
}

function makeOption(
  dateStr: string,
  window: string,
  decision: PolicyDecision,
  leg: string
): TripOption {
  const [h, m] = WINDOW_HOUR[window] ?? WINDOW_HOUR.any;
  const dep = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  let durationMin: number;
  let provider: string;
  let fare: number;
  if (decision.mode === "flight") {
    durationMin = 75;
    provider = `IndiGo 6E-${1000 + (hashCode(leg) % 900)}`;
    fare = decision.travel_class.includes("Business") ? 22000
         : decision.travel_class.includes("Premium")  ? 11000
         : 6500;
  } else if (decision.mode === "train") {
    durationMin = 210;
    provider = "Vande Bharat 22221";
    fare = decision.travel_class.includes("3-Tier") ? 1500
         : decision.travel_class.includes("2-Tier") ? 2300
         : 3500;
  } else {
    durationMin = 240;
    provider = "Ola Corporate Sedan";
    fare = 5500;
  }

  const arr = new Date(dep.getTime() + durationMin * 60 * 1000);

  return {
    option_id: `OPT-${randomUUID().slice(0, 6).toUpperCase()}`,
    mode: decision.mode,
    provider,
    depart_dt: formatDt(dep),
    arrive_dt: formatDt(arr),
    travel_class: decision.travel_class,
    fare_inr: fare,
  };
}

function formatDt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
