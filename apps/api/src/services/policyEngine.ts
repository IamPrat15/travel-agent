import { prisma } from "../lib/prisma";

export interface PolicyDecision {
  mode: "road" | "train" | "flight";
  travel_class: string;
  hotel_category: number;
  per_diem_inr: number;
  rationale: string[];
  distance_km: number;
}

export async function decidePolicy(
  band: string,
  distanceKm: number
): Promise<PolicyDecision> {
  const ent = await prisma.policyBand.findUnique({ where: { band } });
  if (!ent) throw new Error(`Unknown band: ${band}`);

  const rationale: string[] = [];
  let mode: PolicyDecision["mode"];
  let travelClass: string;

  if (distanceKm < 250) {
    mode = "road";
    travelClass = "Cab (Sedan)";
    rationale.push(`Distance ${distanceKm.toFixed(0)} km < 250 km → road/cab is default mode.`);
  } else if (distanceKm <= 800) {
    if (band === "B5" || band === "B6") {
      mode = "flight";
      travelClass = ent.flightClass;
      rationale.push(`Distance ${distanceKm.toFixed(0)} km in 250-800 km band; band ${band} permits flight.`);
    } else {
      mode = "train";
      travelClass = ent.trainClass;
      rationale.push(`Distance ${distanceKm.toFixed(0)} km in 250-800 km band; band ${band} → train default.`);
    }
  } else {
    mode = "flight";
    travelClass = ent.flightClass;
    rationale.push(`Distance ${distanceKm.toFixed(0)} km > 800 km → flight is mandatory.`);
  }

  rationale.push(
    `Band ${band} → ${travelClass}, ${ent.hotelStars}-star hotel, per-diem ₹${ent.perDiemInr}.`
  );

  return {
    mode,
    travel_class: travelClass,
    hotel_category: ent.hotelStars,
    per_diem_inr: ent.perDiemInr,
    rationale,
    distance_km: Math.round(distanceKm * 10) / 10,
  };
}
