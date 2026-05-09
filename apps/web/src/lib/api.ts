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
  city: string;
  lat: number;
  lng: number;
}

export interface ParseInput {
  employee_id: string;
  text: string;
  user_supplied_client?: ClientInput;
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
}

export interface PolicyDecision {
  mode: string;
  travel_class: string;
  hotel_category: number;
  per_diem_inr: number;
  rationale: string[];
  distance_km: number;
}

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
      status: "submitted_to_finance";
      trip_request_id: string;
      payload: TripRequest;
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
