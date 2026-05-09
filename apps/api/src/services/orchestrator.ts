import { prisma } from "../lib/prisma";
import { haversineKm } from "../lib/haversine";
import { parseIntent } from "./intentParser";
import { decidePolicy } from "./policyEngine";
import { searchOutbound, searchInbound, searchHotel } from "./inventory";
import { geocodePincode } from "./geocoding";

export interface ProcessRequestInput {
  employeeId: string;
  text: string;
  userSuppliedClient?: {
    client_name: string;
    address: string;
    pincode: string;
  };
}

export async function processRequest(input: ProcessRequestInput) {
  const { employeeId, text, userSuppliedClient } = input;

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
  const distanceKm = haversineKm(employee.homeLat, employee.homeLng, client.lat, client.lng);
  const decision = await decidePolicy(employee.band, distanceKm);

  // 5. Inventory
  const outbound = searchOutbound(intent, decision);
  const inbound  = searchInbound(intent, decision);
  const hotel    = searchHotel(client.city, client.address, decision, intent.depart_date, intent.return_date);
  const total = outbound.fare_inr + inbound.fare_inr + hotel.total_inr;

  // 6. Persist as pending finance approval
  const tripRequest = await prisma.tripRequest.create({
    data: {
      status: "pending_finance_approval",
      rawText: text,
      employeeId: employee.id,
      clientId: client.id,
      intent: intent as any,
      policy: decision as any,
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

  return {
    status: "submitted_to_finance" as const,
    trip_request_id: tripRequest.id,
    payload: tripRequest,
    next_step:
      "Finance team will review policy compliance, approve, and either book directly or forward to the travel desk.",
  };
}
