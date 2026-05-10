/**
 * Inventory search — DEMO STUBS with realistic Indian travel data.
 *
 * Every option returned carries `data_source: "demo_stub"` so the UI and
 * audit log can be unambiguous about provenance. Production swap-in would
 * replace these functions with calls to a licensed GDS / OTA / aggregator.
 *
 * What's enriched compared to the v1 stub:
 *   - Photos via Unsplash random URLs (free, public placeholder service)
 *   - Hotel ratings, reviews count, amenities list
 *   - Realistic Indian-context provider names (Vande Bharat, IndiGo, Vistara, etc.)
 *   - Booking-link URLs (deep-links to public search pages, not auto-bookings)
 *
 * Pricing logic is unchanged — flat-rate-by-class. Real pricing comes from
 * the production data source. The fares here are illustrative only.
 */

import { randomUUID } from "node:crypto";
import { TravelIntent } from "./intentParser";
import { PolicyDecision } from "./policyEngine";

export interface TripOption {
  option_id: string;
  mode: string;
  provider: string;
  provider_logo_url?: string;
  depart_dt: string;
  arrive_dt: string;
  duration_min: number;
  stops: number;
  travel_class: string;
  fare_inr: number;
  baggage_kg?: number;
  refundable?: boolean;
  booking_link?: string;
  data_source: "demo_stub" | "amadeus" | "tbo" | "irctc";
}

export interface HotelOption {
  hotel_id: string;
  name: string;
  brand_chain?: string;
  category_stars: number;
  address: string;
  distance_km_from_client: number;
  nightly_rate_inr: number;
  total_inr: number;
  nights: number;
  guest_rating?: number;       // 0.0 - 10.0
  reviews_count?: number;
  photo_urls: string[];
  amenities: string[];
  description: string;
  refundable?: boolean;
  booking_link?: string;
  data_source: "demo_stub" | "booking_com" | "amadeus" | "tbo";
}

const WINDOW_HOUR: Record<string, [number, number]> = {
  morning: [9, 30],
  afternoon: [14, 0],
  evening: [18, 30],
  any: [11, 0],
};

// ---------- Public API ----------

export function searchOutbound(intent: TravelIntent, decision: PolicyDecision): TripOption {
  return makeOption(intent.depart_date, intent.depart_window, decision, "outbound", intent);
}

export function searchInbound(intent: TravelIntent, decision: PolicyDecision): TripOption {
  return makeOption(intent.return_date, intent.return_window, decision, "inbound", intent);
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
  const stars = decision.hotel_category;

  const profile = HOTEL_PROFILES_BY_STARS[stars] ?? HOTEL_PROFILES_BY_STARS[3];
  // Pick a brand based on a stable hash of the city, so the same city
  // consistently gets the same hotel suggestion.
  const brandIdx = hashCode(clientCity) % profile.brands.length;
  const brand = profile.brands[brandIdx];

  return {
    hotel_id: `H-${randomUUID().slice(0, 6).toUpperCase()}`,
    name: `${brand} ${clientCity}`,
    brand_chain: brand,
    category_stars: stars,
    address: `Near ${clientAddress}`,
    distance_km_from_client: 1.2,
    nightly_rate_inr: profile.rate_inr,
    total_inr: profile.rate_inr * nights,
    nights,
    guest_rating: profile.rating,
    reviews_count: profile.reviews,
    photo_urls: hotelPhotos(stars, clientCity),
    amenities: profile.amenities,
    description: `${profile.descriptor} in ${clientCity}, well-positioned for business travel. ${profile.amenities.slice(0, 3).join(", ")} and 24x7 reception.`,
    refundable: true,
    booking_link: `https://www.makemytrip.com/hotels/hotel-listing/?city=${encodeURIComponent(clientCity)}&checkin=${checkIn}&checkout=${checkOut}`,
    data_source: "demo_stub",
  };
}

// ---------- Hotel profile data ----------

interface HotelProfile {
  rate_inr: number;
  brands: string[];
  rating: number;
  reviews: number;
  amenities: string[];
  descriptor: string;
}

const HOTEL_PROFILES_BY_STARS: Record<number, HotelProfile> = {
  3: {
    rate_inr: 4500,
    brands: ["Ginger", "Lemon Tree", "Treebo Premium", "Holiday Inn Express", "ibis"],
    rating: 7.8,
    reviews: 342,
    amenities: ["Free Wi-Fi", "Breakfast included", "Air conditioning", "Business desk", "Laundry service"],
    descriptor: "A reliable business-class hotel",
  },
  4: {
    rate_inr: 7500,
    brands: ["Vivanta by Taj", "Courtyard by Marriott", "Crowne Plaza", "Novotel", "Hyatt Place"],
    rating: 8.4,
    reviews: 891,
    amenities: ["Free Wi-Fi", "Buffet breakfast", "Fitness centre", "Swimming pool", "Business centre", "Airport shuttle", "Restaurant & bar"],
    descriptor: "An upscale 4-star property",
  },
  5: {
    rate_inr: 13000,
    brands: ["Taj", "ITC", "The Oberoi", "JW Marriott", "The Leela Palace"],
    rating: 9.1,
    reviews: 2148,
    amenities: ["Free Wi-Fi", "Concierge", "Premium spa", "Multiple fine-dining restaurants", "Heated swimming pool", "24x7 fitness centre", "Executive lounge", "Limousine on request"],
    descriptor: "A luxury 5-star hotel",
  },
};

function hotelPhotos(stars: number, city: string): string[] {
  // Unsplash Source: free, public, returns a random photo matching the query.
  const baseQueries = stars === 5
    ? ["luxury-hotel-lobby", "luxury-hotel-suite", "fine-dining-restaurant"]
    : stars === 4
    ? ["business-hotel-room", "hotel-pool", "hotel-lobby"]
    : ["hotel-room", "hotel-bathroom", "hotel-breakfast"];
  return baseQueries.map(
    (q, i) => `https://source.unsplash.com/featured/640x400/?${q}&sig=${hashCode(city + i + stars)}`
  );
}

// ---------- Flight / train / cab option ----------

function makeOption(
  dateStr: string,
  window: string,
  decision: PolicyDecision,
  leg: string,
  intent: TravelIntent
): TripOption {
  const [h, m] = WINDOW_HOUR[window] ?? WINDOW_HOUR.any;
  const dep = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  let durationMin: number;
  let provider: string;
  let providerLogo: string | undefined;
  let fare: number;
  const stops = 0;
  let baggage = 15;
  let bookingLink: string | undefined;

  const route = `${intent.origin_city ?? "?"}-${intent.destination_city}`;

  if (decision.mode === "flight") {
    durationMin = 75 + (hashCode(route) % 30);
    const carrier = pickFlightCarrier(route, leg);
    provider = `${carrier.name} ${carrier.code}-${1000 + (hashCode(leg + route) % 900)}`;
    providerLogo = carrier.logo;
    fare = decision.travel_class.includes("Business") ? 22000
         : decision.travel_class.includes("Premium")  ? 11000
         : 6500;
    baggage = decision.travel_class.includes("Business") ? 30
            : decision.travel_class.includes("Premium")  ? 20
            : 15;
    bookingLink = `https://www.makemytrip.com/flight/search?itinerary=${encodeURIComponent(intent.origin_city ?? "")}-${encodeURIComponent(intent.destination_city)}-${dateStr}`;
  } else if (decision.mode === "train") {
    durationMin = 195 + (hashCode(route) % 90);
    const t = pickTrain(route);
    provider = `${t.name} ${t.number}`;
    fare = decision.travel_class.includes("3-Tier") ? 1500
         : decision.travel_class.includes("2-Tier") ? 2300
         : 3500;
    bookingLink = `https://www.irctc.co.in/nget/train-search`;
  } else {
    durationMin = 180 + (hashCode(route) % 120);
    provider = pickCab(leg);
    fare = 5500;
    bookingLink = `https://www.olacabs.com/`;
  }

  const arr = new Date(dep.getTime() + durationMin * 60 * 1000);

  return {
    option_id: `OPT-${randomUUID().slice(0, 6).toUpperCase()}`,
    mode: decision.mode,
    provider,
    provider_logo_url: providerLogo,
    depart_dt: formatDt(dep),
    arrive_dt: formatDt(arr),
    duration_min: durationMin,
    stops,
    travel_class: decision.travel_class,
    fare_inr: fare,
    baggage_kg: decision.mode === "flight" ? baggage : undefined,
    refundable: decision.travel_class.includes("Business") || decision.travel_class.includes("Premium"),
    booking_link: bookingLink,
    data_source: "demo_stub",
  };
}

function pickFlightCarrier(route: string, leg: string): { name: string; code: string; logo: string } {
  const carriers = [
    { name: "IndiGo",    code: "6E", logo: "" },
    { name: "Air India", code: "AI", logo: "" },
    { name: "Vistara",   code: "UK", logo: "" },
    { name: "SpiceJet",  code: "SG", logo: "" },
    { name: "Akasa Air", code: "QP", logo: "" },
  ];
  return carriers[hashCode(route + leg) % carriers.length];
}

function pickTrain(route: string): { name: string; number: string } {
  const trains = [
    { name: "Vande Bharat Exp",  number: "22221" },
    { name: "Rajdhani Exp",      number: "12951" },
    { name: "Shatabdi Exp",      number: "12009" },
    { name: "Tejas Exp",         number: "82901" },
    { name: "Duronto Exp",       number: "12261" },
  ];
  return trains[hashCode(route) % trains.length];
}

function pickCab(leg: string): string {
  const cabs = [
    "Ola Corporate (Sedan)",
    "Uber for Business (Sedan)",
    "MyChauffeur Sedan",
    "Savaari Sedan",
  ];
  return cabs[hashCode(leg) % cabs.length];
}

// ---------- Helpers ----------

function formatDt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
