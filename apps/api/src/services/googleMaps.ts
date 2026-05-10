/**
 * Google Maps Routes API client.
 *
 * What this does:
 *   Compute road distance and duration between two lat/lng points using
 *   the Routes API v2 (https://routes.googleapis.com/directions/v2:computeRoutes).
 *   Returns distance in km, duration in seconds, and an encoded polyline
 *   which can be rendered on a static map image.
 *
 * Why Routes API v2 (not the legacy Directions API):
 *   - Cheaper (Pro SKU, 5000 events/month free vs Legacy's $200 credit)
 *   - Returns traffic-aware durations
 *   - Single API for driving / walking / two-wheel / transit
 *   - Recommended path going forward; Directions API is now Legacy
 *
 * Cost reality at our usage:
 *   - 1 trip submission ≈ 1-2 Routes API calls (origin->destination + maybe
 *     return). Even 1000 trips/month = 2000 calls — well within the free
 *     5000/month tier. A demo will be effectively free.
 *
 * Honest fallback:
 *   - If GOOGLE_MAPS_API_KEY is not set, isGoogleMapsConfigured() returns
 *     false and the rest of the app uses haversine. No silent degradation.
 *   - On API errors (rate limit, network, bad coords), we throw — the
 *     caller decides whether to retry or fall back.
 */

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export interface RouteResult {
  distance_km: number;
  duration_min: number;
  /** Encoded polyline string (Google's standard format) for drawing on a map. */
  polyline: string;
  /** Indicates whether this is real Google data or a fallback. */
  data_source: "google_maps" | "haversine_fallback";
}

export function isGoogleMapsConfigured(): boolean {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  return typeof key === "string" && key.length > 10;
}

/**
 * Get a road route between two lat/lng points.
 * Throws on error — caller should catch and fall back to haversine.
 */
export async function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  travelMode: "DRIVE" | "TWO_WHEELER" | "WALK" | "BICYCLE" = "DRIVE"
): Promise<RouteResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const body = {
    origin: { location: { latLng: origin } },
    destination: { location: { latLng: destination } },
    travelMode,
    routingPreference: travelMode === "DRIVE" ? "TRAFFIC_AWARE" : undefined,
    polylineEncoding: "ENCODED_POLYLINE",
    computeAlternativeRoutes: false,
    languageCode: "en-IN",
    units: "METRIC",
  };

  const response = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask is required by Routes API to control response shape and cost.
      // Asking only for what we need keeps us in the cheap "Compute Routes Basic" SKU.
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Routes API ${response.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string; // "1234s" format
      polyline?: { encodedPolyline?: string };
    }>;
  };

  if (!data.routes || data.routes.length === 0) {
    throw new Error("Routes API returned no routes");
  }

  const route = data.routes[0];
  const meters = route.distanceMeters ?? 0;
  // Duration is "Ns" — strip the trailing 's'.
  const seconds = parseInt(String(route.duration ?? "0s").replace(/s$/, ""), 10) || 0;

  return {
    distance_km: Math.round(meters / 100) / 10, // 1 decimal place
    duration_min: Math.round(seconds / 60),
    polyline: route.polyline?.encodedPolyline ?? "",
    data_source: "google_maps",
  };
}

/**
 * Build a Static Maps API URL for previewing the route as an image.
 * The static map URL is meant for <img src=...> rendering; no JS needed
 * client-side. Free tier covers 10000/month.
 *
 * @param polyline The encoded polyline from computeRoute.
 * @param width / height Image dimensions in pixels (max 640x640 on free tier).
 */
export function buildStaticMapUrl(
  polyline: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  width = 600,
  height = 320
): string | null {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !polyline) return null;

  const params = new URLSearchParams({
    size: `${width}x${height}`,
    scale: "2", // retina
    maptype: "roadmap",
    // Brand-red path color (FIRST AI maroon-80 hex without alpha)
    path: `color:0x9c1d26ff|weight:4|enc:${polyline}`,
    // Origin marker (green) + destination marker (red)
    markers: [
      `color:green|label:A|${origin.lat},${origin.lng}`,
      `color:red|label:B|${destination.lat},${destination.lng}`,
    ].join("&markers="),
    key: apiKey,
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
