import { prisma } from "../lib/prisma";
import { haversineKm } from "../lib/haversine";
import { parseIntent } from "./intentParser";
import { decidePolicy } from "./policyEngine";
import { searchOutbound, searchInbound, searchHotel } from "./inventory";
import { geocodePincode } from "./geocoding";
import { computeVerdict } from "./verdict";
import { computeRoute, buildStaticMapUrl, isGoogleMapsConfigured } from "./googleMaps";
import { computeCabFare, cabClassForBand } from "./cabTariff";

export interface ProcessRequestInput {
  employeeId: string;
  text: string;
  userSuppliedClient?: {
    client_name: string;
    address: string;
    pincode: string;
  };
  /** When user has answered the "do you need a hotel?" question, override the parser. */
  needsHotelOverride?: boolean;
}

export async function processRequest(input: ProcessRequestInput) {
  const { employeeId, text, userSuppliedClient, needsHotelOverride } = input;

  // 1. Employee lookup
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    const err: any = new Error(`Employee ${employeeId} not found`);
    err.statusCode = 404;
    throw err;
  }

  // 2. Parse intent
  const intent = await parseIntent(text);
  if (!intent.origin_city) intent.origin_city = employee.homeCity;

  // Apply user's explicit hotel decision if provided
  if (typeof needsHotelOverride === "boolean") {
    intent.needs_hotel = needsHotelOverride;
  }

  // 3. Resolve client
  let client = null;
  if (intent.client_name) {
    client = await prisma.client.findFirst({
      where: { name: { equals: intent.client_name, mode: "insensitive" } },
    });
  }
  if (!client && userSuppliedClient) {
    // Geocode the pincode → coordinates + canonical city name
    const geo = await geocodePincode(userSuppliedClient.pincode);

    // Upsert the user-supplied client into the directory
    client = await prisma.client.upsert({
      where: { name: userSuppliedClient.client_name },
      update: {
        address: userSuppliedClient.address,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
      },
      create: {
        name: userSuppliedClient.client_name,
        address: userSuppliedClient.address,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
        source: "user_provided",
      },
    });
  }

  if (!client) {
    // Persist a draft so the UI can resume later if it wants
    const draft = await prisma.tripRequest.create({
      data: {
        status: "needs_client_address",
        rawText: text,
        employeeId: employee.id,
        intent: intent as any,
      },
    });
    await prisma.auditLog.create({
      data: {
        tripRequestId: draft.id,
        event: "needs_address",
        actor: employee.id,
        details: { client_name_attempted: intent.client_name } as any,
      },
    });
    return {
      status: "needs_client_address" as const,
      trip_request_id: draft.id,
      message: `Client '${intent.client_name ?? "(not specified)"}' not found in directory. Please provide the client office address and pincode.`,
      intent,
      required_fields: ["client_name", "address", "pincode"],
    };
  }

  // 4. Distance + policy
  // Try Google Maps Routes API first for road distance + duration + polyline.
  // Fall back to haversine if not configured or API call fails.
  let distanceKm = haversineKm(employee.homeLat, employee.homeLng, client.lat, client.lng);
  let routeMeta: {
    distance_km: number;
    duration_min: number;
    polyline: string;
    static_map_url: string | null;
    data_source: "google_maps" | "haversine_fallback";
  } = {
    distance_km: Math.round(distanceKm * 10) / 10,
    duration_min: 0,
    polyline: "",
    static_map_url: null,
    data_source: "haversine_fallback",
  };

  if (isGoogleMapsConfigured()) {
    try {
      const route = await computeRoute(
        { lat: employee.homeLat, lng: employee.homeLng },
        { lat: client.lat, lng: client.lng },
        "DRIVE"
      );
      // Use the real road distance, not the haversine straight line.
      distanceKm = route.distance_km;
      routeMeta = {
        distance_km: route.distance_km,
        duration_min: route.duration_min,
        polyline: route.polyline,
        static_map_url: buildStaticMapUrl(
          route.polyline,
          { lat: employee.homeLat, lng: employee.homeLng },
          { lat: client.lat, lng: client.lng }
        ),
        data_source: "google_maps",
      };
    } catch (err) {
      console.warn("[orchestrator] Google Maps Routes failed, using haversine:", (err as Error).message);
    }
  }

  const decision = await decidePolicy(employee.band, distanceKm);

  // 4b. If hotel intent is ambiguous AND it's a multi-day trip, ask the user.
  // (Same-day trips have needs_hotel=false set by the parser, so we don't
  // ask in that case — same day = no hotel by definition.)
  const isMultiDayTrip = intent.return_date && intent.return_date !== intent.depart_date;
  if (intent.needs_hotel === null && isMultiDayTrip) {
    const draft = await prisma.tripRequest.create({
      data: {
        status: "needs_hotel_decision",
        rawText: text,
        employeeId: employee.id,
        clientId: client.id,
        intent: intent as any,
      },
    });
    await prisma.auditLog.create({
      data: {
        tripRequestId: draft.id,
        event: "needs_hotel_decision",
        actor: employee.id,
        details: { question: "Hotel booking required?" } as any,
      },
    });
    return {
      status: "needs_hotel_decision" as const,
      trip_request_id: draft.id,
      message: `This is a multi-day trip (${intent.depart_date} to ${intent.return_date}). Do you need hotel booking?`,
      intent,
      required_fields: ["needs_hotel"],
    };
  }

  // 5. Inventory
  // For road trips, replace flat-rate cab pricing with the Ola/Uber-style
  // corporate tariff (fare + tolls).
  const outbound = searchOutbound(intent, decision);
  const inbound  = searchInbound(intent, decision);

  // Hotel only if needs_hotel is true (or null for multi-day, but we
  // intercept that above; null at this point means same-day = no hotel)
  const includeHotel = intent.needs_hotel === true;
  const hotel = includeHotel
    ? searchHotel(client.city, client.address, decision, intent.depart_date, intent.return_date)
    : null;

  let cabFareBreakdown: any = null;
  if (decision.mode === "road") {
    const cabClass = cabClassForBand(decision.travel_class);
    const isRoundTrip = intent.return_date && intent.return_date !== intent.depart_date;
    const legs = isRoundTrip ? 2 : 1;
    const tripDays = isRoundTrip ? 2 : 1;

    cabFareBreakdown = computeCabFare(distanceKm, cabClass, legs, tripDays);

    // Per-leg display fare for outbound/inbound cards
    const oneLegFare = cabFareBreakdown.base_fare_inr_per_leg + cabFareBreakdown.toll_estimate_inr_per_leg;
    outbound.fare_inr = oneLegFare;
    outbound.provider = `${cabClass} (Corporate Fleet)`;
    inbound.fare_inr = oneLegFare;
    inbound.provider = `${cabClass} (Corporate Fleet)`;
  }

  const total = outbound.fare_inr + inbound.fare_inr + (hotel?.total_inr ?? 0);

  // 6. Persist as pending finance approval
  const tripRequest = await prisma.tripRequest.create({
    data: {
      status: "pending_finance_approval",
      rawText: text,
      employeeId: employee.id,
      clientId: client.id,
      intent: intent as any,
      // Enrich the policy with route metadata + cab fare breakdown so the
      // finance reviewer (and AI Verdict) can audit the pricing trail.
      policy: { ...decision, route: routeMeta, cab_fare_breakdown: cabFareBreakdown } as any,
      outbound: outbound as any,
      inbound: inbound as any,
      hotel: hotel as any,
      estimatedTotalInr: total,
    },
    include: { employee: true, client: true },
  });

  // 7. Audit log
  await prisma.auditLog.create({
    data: {
      tripRequestId: tripRequest.id,
      event: "submitted",
      actor: employee.id,
      details: {
        rationale: decision.rationale,
        distance_km: decision.distance_km,
        estimated_total_inr: total,
      } as any,
    },
  });

  // 8. AI Verdict (generated for finance reviewer; failure is non-fatal)
  let verdict: any = null;
  try {
    verdict = await computeVerdict(tripRequest.id);
  } catch (err) {
    console.warn("[orchestrator] verdict generation failed:", (err as Error).message);
  }

  return {
    status: "submitted_to_finance" as const,
    trip_request_id: tripRequest.id,
    payload: tripRequest,
    verdict,
    next_step:
      "Finance team will review policy compliance, approve, and either book directly or forward to the travel desk.",
  };
}
