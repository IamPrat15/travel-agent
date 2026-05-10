/**
 * Corporate cab tariff calculator.
 *
 * Real Indian corporate-fleet pricing for outstation business travel.
 * Sourced from average rates of Savaari, MyChauffeur, EeziBook outstation
 * tariffs as of mid-2025. Production should source these from your actual
 * negotiated corporate rate agreement (Ola Corporate, Uber for Business,
 * or local fleet vendor) — these are illustrative defaults.
 *
 * Calculation:
 *   total = max(minimum_fare, distance_km * rate_per_km)
 *           + driver_allowance * trip_days
 *           + parking_toll_estimate
 *
 * Driver allowance applies for outstation trips > 250 km — there's a
 * mandatory driver overnight stay component. We charge it for return trips.
 *
 * Pricing returned in INR.
 */

export type CabClass = "Sedan" | "SUV" | "Premium Sedan";

interface TariffEntry {
  rate_per_km_inr: number;
  minimum_fare_inr: number;
  driver_allowance_per_day_inr: number;
  estimated_toll_inr_per_100km: number;
}

const TARIFFS: Record<CabClass, TariffEntry> = {
  // Indica/Etios/Dzire-class — most common corporate booking
  Sedan: {
    rate_per_km_inr: 14,
    minimum_fare_inr: 250,
    driver_allowance_per_day_inr: 400,
    estimated_toll_inr_per_100km: 80,
  },
  // Innova/Ertiga-class
  SUV: {
    rate_per_km_inr: 19,
    minimum_fare_inr: 350,
    driver_allowance_per_day_inr: 500,
    estimated_toll_inr_per_100km: 80,
  },
  // Camry/Civic/Skoda-class — for B5/B6 travel
  "Premium Sedan": {
    rate_per_km_inr: 22,
    minimum_fare_inr: 500,
    driver_allowance_per_day_inr: 600,
    estimated_toll_inr_per_100km: 80,
  },
};

export interface CabFareBreakdown {
  cab_class: CabClass;
  distance_km: number;
  rate_per_km_inr: number;
  base_fare_inr: number;
  driver_allowance_inr: number;
  toll_estimate_inr: number;
  total_inr: number;
  is_outstation: boolean;
  trip_days: number;
}

/**
 * Compute one-way fare for a road trip.
 * Caller is responsible for calling twice (outbound + return) if it's a
 * round trip — the orchestrator does this.
 *
 * @param distance_km One-way distance in km.
 * @param cabClass Vehicle class per band entitlement.
 * @param trip_days Number of days the cab is engaged (1 for one-way, 2+ for return).
 *                  Drives the driver allowance multiplier.
 */
export function computeCabFare(
  distance_km: number,
  cabClass: CabClass = "Sedan",
  trip_days: number = 1
): CabFareBreakdown {
  const tariff = TARIFFS[cabClass];
  const isOutstation = distance_km > 60;

  // Base fare: distance * rate, with minimum
  const baseFare = Math.max(tariff.minimum_fare_inr, Math.round(distance_km * tariff.rate_per_km_inr));

  // Driver allowance applies only for outstation trips (defined as > 60 km one-way)
  const driverAllowance = isOutstation
    ? tariff.driver_allowance_per_day_inr * trip_days
    : 0;

  // Toll estimate scales with distance
  const tollEstimate = Math.round((distance_km / 100) * tariff.estimated_toll_inr_per_100km);

  const total = baseFare + driverAllowance + tollEstimate;

  return {
    cab_class: cabClass,
    distance_km: Math.round(distance_km * 10) / 10,
    rate_per_km_inr: tariff.rate_per_km_inr,
    base_fare_inr: baseFare,
    driver_allowance_inr: driverAllowance,
    toll_estimate_inr: tollEstimate,
    total_inr: total,
    is_outstation: isOutstation,
    trip_days,
  };
}

/**
 * Map a band's travel-class label to a cab class.
 * Used by the orchestrator to pick the right tier.
 */
export function cabClassForBand(travel_class: string): CabClass {
  if (travel_class.includes("Business") || travel_class.includes("Premium")) return "Premium Sedan";
  // Default to Sedan for B1-B4. SUV is reserved for special cases (group travel, hill stations)
  // which we don't model in this demo.
  return "Sedan";
}
