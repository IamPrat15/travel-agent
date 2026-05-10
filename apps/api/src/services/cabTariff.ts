/**
 * Cab tariff calculator — Ola / Uber Outstation-style structure.
 *
 * Pricing model:
 *   one_way_fare = max(minimum_fare, distance_km * rate_per_km)
 *   one_way_tolls = (distance_km / 100) * estimated_toll_inr_per_100km
 *   round_trip_total = (one_way_fare * legs) + (one_way_tolls * legs)
 *
 * No driver allowance line item — that's bundled into vendor pricing
 * invisibly when the user books on Ola/Uber. We keep the user mental
 * model clean: fare + tolls.
 *
 * Rates calibrated against:
 *   - Ola Outstation Sedan (Mumbai-Pune, May 2025): ~₹14/km
 *   - Uber Intercity (similar): ~₹15/km
 *   - Premium tiers (Innova, Camry): ~₹18-22/km
 */

export type CabClass = "Sedan" | "SUV" | "Premium Sedan";

interface TariffEntry {
  rate_per_km_inr: number;
  minimum_fare_inr: number;
  estimated_toll_inr_per_100km: number;
}

const TARIFFS: Record<CabClass, TariffEntry> = {
  // Indica/Etios/Dzire-class — most common corporate booking
  Sedan: {
    rate_per_km_inr: 14,
    minimum_fare_inr: 250,
    estimated_toll_inr_per_100km: 80,
  },
  // Innova/Ertiga-class
  SUV: {
    rate_per_km_inr: 19,
    minimum_fare_inr: 350,
    estimated_toll_inr_per_100km: 80,
  },
  // Camry/Civic/Skoda-class — for B5/B6 travel
  "Premium Sedan": {
    rate_per_km_inr: 22,
    minimum_fare_inr: 500,
    estimated_toll_inr_per_100km: 80,
  },
};

export interface CabFareBreakdown {
  cab_class: CabClass;
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

/**
 * Compute cab fare breakdown for a trip. Returns the same shape regardless
 * of whether it's one-way or round-trip — caller passes `legs` (1 or 2).
 *
 * @param distance_km One-way distance
 * @param cabClass Vehicle tier per band entitlement
 * @param legs 1 for one-way, 2 for round-trip
 * @param trip_days Total trip days (used only for display, not pricing)
 */
export function computeCabFare(
  distance_km: number,
  cabClass: CabClass = "Sedan",
  legs: number = 2,
  trip_days: number = 1
): CabFareBreakdown {
  const tariff = TARIFFS[cabClass];
  const isOutstation = distance_km > 60;

  // Base fare per leg: distance * rate, with minimum
  const baseFarePerLeg = Math.max(tariff.minimum_fare_inr, Math.round(distance_km * tariff.rate_per_km_inr));
  const baseFareTotal = baseFarePerLeg * legs;

  // Toll estimate per leg
  const tollPerLeg = Math.round((distance_km / 100) * tariff.estimated_toll_inr_per_100km);
  const tollTotal = tollPerLeg * legs;

  const total = baseFareTotal + tollTotal;

  return {
    cab_class: cabClass,
    distance_km: Math.round(distance_km * 10) / 10,
    rate_per_km_inr: tariff.rate_per_km_inr,
    legs,
    base_fare_inr_per_leg: baseFarePerLeg,
    base_fare_inr_total: baseFareTotal,
    toll_estimate_inr_per_leg: tollPerLeg,
    toll_estimate_inr_total: tollTotal,
    total_inr: total,
    is_outstation: isOutstation,
    trip_days,
  };
}

/**
 * Map a band's travel-class label to a cab class.
 */
export function cabClassForBand(travel_class: string): CabClass {
  if (travel_class.includes("Business") || travel_class.includes("Premium")) return "Premium Sedan";
  return "Sedan";
}
