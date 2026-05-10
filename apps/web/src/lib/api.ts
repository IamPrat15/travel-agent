import axios from "axios";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// ----- Types -----

export interface Employee {
  id: string;
  name: string;
  email: string;
  band: string;
  homeCity: string;
  department: string;
}

export interface ClientInput {
  client_name: string;
  address: string;
  pincode: string;
}

export interface ParseInput {
  employee_id: string;
  text: string;
  user_supplied_client?: ClientInput;
  /** When user has answered the hotel question, pass their answer here. */
  user_supplied_needs_hotel?: boolean;
}

export interface TripIntent {
  origin_city: string | null;
  destination_city: string;
  depart_date: string;
  depart_window: string;
  return_date: string;
  return_window: string;
  purpose: string;
  client_name: string | null;
  raw_text: string;
  /** true | false | null (ambiguous) */
  needs_hotel: boolean | null;
  is_intra_city: boolean;
}

export interface RouteMeta {
  distance_km: number;
  duration_min: number;
  polyline: string;
  static_map_url: string | null;
  data_source: "google_maps" | "haversine_fallback";
}

export interface CabFareBreakdown {
  cab_class: string;
  distance_km: number;
  rate_per_km_inr: number;
  legs: number;
  base_fare_inr_per_leg: number;
  base_fare_inr_total: number;
  toll_estimate_inr_per_leg: number;
  toll_estimate_inr_total: number;
  total_inr: number;
  is_outstation: boolean;
  trip_days: number;
}

export interface PolicyDecision {
  mode: string;
  travel_class: string;
  hotel_category: number;
  per_diem_inr: number;
  rationale: string[];
  distance_km: number;
  route?: RouteMeta;
  cab_fare_breakdown?: CabFareBreakdown | null;
}

export interface TripOption {
  option_id: string;
  mode: string;
  provider: string;
  provider_logo_url?: string;
  depart_dt: string;
  arrive_dt: string;
  duration_min?: number;
  stops?: number;
  travel_class: string;
  fare_inr: number;
  baggage_kg?: number;
  refundable?: boolean;
  booking_link?: string;
  data_source?: "demo_stub" | "amadeus" | "tbo" | "irctc";
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
  nights?: number;
  guest_rating?: number;
  reviews_count?: number;
  photo_urls?: string[];
  amenities?: string[];
  description?: string;
  refundable?: boolean;
  booking_link?: string;
  data_source?: "demo_stub" | "booking_com" | "amadeus" | "tbo";
}

// ----- Verdict types (must match backend verdict.ts) -----

export type CheckSeverity = "pass" | "info" | "warn" | "fail";

export interface VerdictCheck {
  id: string;
  category: "policy" | "anomaly" | "sanity";
  severity: CheckSeverity;
  label: string;
  detail: string;
}

export type VerdictRecommendation =
  | "approve_recommended"
  | "approve_with_review"
  | "reject_recommended"
  | "manual_review_required";

export interface AiVerdict {
  recommendation: VerdictRecommendation;
  confidence: number;
  checks: VerdictCheck[];
  summary: string;
  metrics: { pass: number; info: number; warn: number; fail: number };
  generated_at: string;
  llm_used: boolean;
}

// ----- Trip request -----

export interface TripRequest {
  id: string;
  status: string;
  rawText: string;
  employeeId: string;
  clientId: string | null;
  intent: TripIntent;
  policy: PolicyDecision | null;
  outbound: TripOption | null;
  inbound: TripOption | null;
  hotel: HotelOption | null;
  estimatedTotalInr: number | null;
  financeNote: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  verdict?: AiVerdict | null;
  employee?: Employee;
  client?: { id: string; name: string; address: string; city: string };
  auditLogs?: Array<{
    id: string; event: string; actor: string; details: any; createdAt: string;
  }>;
}

export type ParseResponse =
  | {
      status: "needs_client_address";
      trip_request_id: string;
      message: string;
      intent: TripIntent;
      required_fields: string[];
    }
  | {
      status: "needs_hotel_decision";
      trip_request_id: string;
      message: string;
      intent: TripIntent;
      required_fields: string[];
    }
  | {
      status: "submitted_to_finance";
      trip_request_id: string;
      payload: TripRequest;
      verdict?: AiVerdict | null;
      next_step: string;
    };

// ----- Calls -----

export async function getEmployees() {
  const { data } = await api.get<Employee[]>("/employees");
  return data;
}

export async function parseTravel(input: ParseInput) {
  const { data } = await api.post<ParseResponse>("/travel/parse", input);
  return data;
}

export async function submitTravel(input: ParseInput) {
  const { data } = await api.post<ParseResponse>("/travel/submit", input);
  return data;
}

export async function getFinanceQueue(status?: string) {
  const { data } = await api.get<TripRequest[]>("/finance/queue", {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getTripRequest(id: string) {
  const { data } = await api.get<TripRequest>(`/finance/${id}`);
  return data;
}

export async function approveTripRequest(id: string, approver: string, note?: string) {
  const { data } = await api.post<TripRequest>(`/finance/${id}/approve`, { approver, note });
  return data;
}

export async function rejectTripRequest(id: string, approver: string, note?: string) {
  const { data } = await api.post<TripRequest>(`/finance/${id}/reject`, { approver, note });
  return data;
}

export async function markBooked(id: string, approver: string, note?: string) {
  const { data } = await api.post<TripRequest>(`/finance/${id}/mark-booked`, { approver, note });
  return data;
}

export async function regenerateVerdict(id: string) {
  const { data } = await api.post<AiVerdict>(`/finance/${id}/regenerate-verdict`);
  return data;
}
