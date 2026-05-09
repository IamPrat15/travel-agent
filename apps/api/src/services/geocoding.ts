/**
 * Pincode-based geocoding for Indian addresses.
 *
 * Strategy:
 *   1. Validate the pincode via the free India Post API (postalpincode.in,
 *      no key required) → returns district + state.
 *   2. Look up coordinates from a built-in table covering ~60 major Indian
 *      cities + every state capital. Match by city/district name (with
 *      common aliases handled), then by state capital as fallback.
 *   3. If both miss, throw — the UI can fall back to asking for coordinates.
 *
 * Why no online geocoder (e.g. Nominatim/OSM)?
 *   Most free public geocoders rate-limit or block requests from cloud
 *   provider IPs (Render, AWS, etc.), making them unreliable in production.
 *   The built-in table is small, accurate enough for distance-band policy
 *   (the 250 km / 800 km thresholds tolerate ±10 km error easily), and
 *   has zero external runtime dependencies once the pincode is validated.
 *
 * Replacing this with a paid geocoder (MapMyIndia, Google, LocationIQ) is
 * a one-function change — see the "// REPLACE" marker below.
 */

interface GeocodeResult {
  lat: number;
  lng: number;
  city: string;        // canonical city name (e.g. "Bengaluru" not "Bangalore Urban")
  district: string;
  state: string;
  pincode: string;
  match_quality: "city" | "state_capital_fallback";
}

// Module-level cache keyed by pincode.
const cache = new Map<string, GeocodeResult>();

const FETCH_TIMEOUT_MS = 5000;

export async function geocodePincode(pincode: string): Promise<GeocodeResult> {
  const clean = pincode.trim().replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) {
    const err: any = new Error(`Invalid Indian pincode: '${pincode}'. Must be 6 digits.`);
    err.statusCode = 400;
    throw err;
  }

  const cached = cache.get(clean);
  if (cached) return cached;

  // Step 1: India Post lookup (district + state)
  // REPLACE with a paid geocoder here if you want street-level precision.
  const postOffice = await lookupIndiaPost(clean);

  // Step 2: Resolve city → coordinates from built-in table
  const coords = resolveCoordinates(postOffice.district, postOffice.state);

  const result: GeocodeResult = {
    lat: coords.lat,
    lng: coords.lng,
    city: coords.canonicalCity,
    district: postOffice.district,
    state: postOffice.state,
    pincode: clean,
    match_quality: coords.matchQuality,
  };
  cache.set(clean, result);
  return result;
}

// ---------- India Post ----------

interface PostOfficeInfo {
  city: string;
  district: string;
  state: string;
}

async function lookupIndiaPost(pincode: string): Promise<PostOfficeInfo> {
  const url = `https://api.postalpincode.in/pincode/${pincode}`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    const err: any = new Error(`India Post API returned ${res.status}`);
    err.statusCode = 502;
    throw err;
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    const err: any = new Error(`Unexpected India Post response for ${pincode}`);
    err.statusCode = 502;
    throw err;
  }
  const entry = data[0];
  if (entry.Status !== "Success" || !Array.isArray(entry.PostOffice) || entry.PostOffice.length === 0) {
    const err: any = new Error(`Pincode '${pincode}' not found in India Post directory`);
    err.statusCode = 404;
    throw err;
  }
  const po = entry.PostOffice[0];
  return {
    city: po.District ?? po.Block ?? po.Name ?? "",
    district: po.District ?? "",
    state: po.State ?? "",
  };
}

// ---------- Built-in city table ----------

const CITY_COORDS: Record<string, { lat: number; lng: number; aliases?: string[] }> = {
  // Tier 1
  "Mumbai":     { lat: 19.0760, lng: 72.8777, aliases: ["Greater Mumbai", "Mumbai City", "Mumbai Suburban"] },
  "Delhi":      { lat: 28.6139, lng: 77.2090, aliases: ["New Delhi", "North Delhi", "South Delhi", "Central Delhi", "East Delhi", "West Delhi", "North East Delhi", "North West Delhi", "South East Delhi", "South West Delhi", "Shahdara"] },
  "Bengaluru":  { lat: 12.9716, lng: 77.5946, aliases: ["Bangalore", "Bangalore Urban", "Bangalore Rural"] },
  "Chennai":    { lat: 13.0827, lng: 80.2707, aliases: ["Madras"] },
  "Kolkata":    { lat: 22.5726, lng: 88.3639, aliases: ["Calcutta"] },
  "Hyderabad":  { lat: 17.3850, lng: 78.4867, aliases: ["Cyberabad", "Secunderabad"] },
  "Ahmedabad":  { lat: 23.0225, lng: 72.5714, aliases: ["Ahmadabad"] },
  "Pune":       { lat: 18.5204, lng: 73.8567, aliases: ["Poona"] },
  // Tier 2
  "Jaipur":     { lat: 26.9124, lng: 75.7873 },
  "Surat":      { lat: 21.1702, lng: 72.8311 },
  "Lucknow":    { lat: 26.8467, lng: 80.9462 },
  "Kanpur":     { lat: 26.4499, lng: 80.3319, aliases: ["Kanpur Nagar"] },
  "Nagpur":     { lat: 21.1458, lng: 79.0882 },
  "Indore":     { lat: 22.7196, lng: 75.8577 },
  "Thane":      { lat: 19.2183, lng: 72.9781 },
  "Bhopal":     { lat: 23.2599, lng: 77.4126 },
  "Visakhapatnam": { lat: 17.6868, lng: 83.2185, aliases: ["Vizag"] },
  "Patna":      { lat: 25.5941, lng: 85.1376 },
  "Vadodara":   { lat: 22.3072, lng: 73.1812, aliases: ["Baroda"] },
  "Ghaziabad":  { lat: 28.6692, lng: 77.4538 },
  "Ludhiana":   { lat: 30.9010, lng: 75.8573 },
  "Agra":       { lat: 27.1767, lng: 78.0081 },
  "Nashik":     { lat: 19.9975, lng: 73.7898, aliases: ["Nasik"] },
  "Faridabad":  { lat: 28.4089, lng: 77.3178 },
  "Meerut":     { lat: 28.9845, lng: 77.7064 },
  "Rajkot":     { lat: 22.3039, lng: 70.8022 },
  "Varanasi":   { lat: 25.3176, lng: 82.9739, aliases: ["Banaras", "Benares"] },
  "Srinagar":   { lat: 34.0837, lng: 74.7973 },
  "Aurangabad": { lat: 19.8762, lng: 75.3433 },
  "Dhanbad":    { lat: 23.7957, lng: 86.4304 },
  "Amritsar":   { lat: 31.6340, lng: 74.8723 },
  "Navi Mumbai":{ lat: 19.0330, lng: 73.0297 },
  "Allahabad":  { lat: 25.4358, lng: 81.8463, aliases: ["Prayagraj"] },
  "Howrah":     { lat: 22.5958, lng: 88.2636 },
  "Ranchi":     { lat: 23.3441, lng: 85.3096 },
  "Gwalior":    { lat: 26.2183, lng: 78.1828 },
  "Jabalpur":   { lat: 23.1815, lng: 79.9864 },
  "Coimbatore": { lat: 11.0168, lng: 76.9558, aliases: ["Kovai"] },
  "Vijayawada": { lat: 16.5062, lng: 80.6480 },
  "Jodhpur":    { lat: 26.2389, lng: 73.0243 },
  "Madurai":    { lat: 9.9252,  lng: 78.1198 },
  "Raipur":     { lat: 21.2514, lng: 81.6296 },
  "Kota":       { lat: 25.2138, lng: 75.8648 },
  "Chandigarh": { lat: 30.7333, lng: 76.7794 },
  "Guwahati":   { lat: 26.1445, lng: 91.7362, aliases: ["Kamrup", "Kamrup Metropolitan"] },
  "Solapur":    { lat: 17.6599, lng: 75.9064 },
  "Mysuru":     { lat: 12.2958, lng: 76.6394, aliases: ["Mysore"] },
  "Tiruchirappalli": { lat: 10.7905, lng: 78.7047, aliases: ["Trichy", "Tiruchirapalli"] },
  "Bareilly":   { lat: 28.3670, lng: 79.4304 },
  "Aligarh":    { lat: 27.8974, lng: 78.0880 },
  "Moradabad":  { lat: 28.8386, lng: 78.7733 },
  "Gurgaon":    { lat: 28.4595, lng: 77.0266, aliases: ["Gurugram"] },
  "Noida":      { lat: 28.5355, lng: 77.3910, aliases: ["Gautam Buddha Nagar"] },
  "Kochi":      { lat: 9.9312,  lng: 76.2673, aliases: ["Cochin", "Ernakulam"] },
  "Thiruvananthapuram": { lat: 8.5241, lng: 76.9366, aliases: ["Trivandrum"] },
  "Bhubaneswar":{ lat: 20.2961, lng: 85.8245, aliases: ["Khordha"] },
  "Dehradun":   { lat: 30.3165, lng: 78.0322 },
  "Shimla":     { lat: 31.1048, lng: 77.1734 },
  "Goa":        { lat: 15.2993, lng: 74.1240, aliases: ["Panaji", "North Goa", "South Goa"] },
};

const STATE_CAPITAL: Record<string, string> = {
  "ANDHRA PRADESH":      "Visakhapatnam",
  "ARUNACHAL PRADESH":   "Itanagar",
  "ASSAM":               "Guwahati",
  "BIHAR":               "Patna",
  "CHHATTISGARH":        "Raipur",
  "DELHI":               "Delhi",
  "GOA":                 "Goa",
  "GUJARAT":             "Ahmedabad",
  "HARYANA":             "Gurgaon",
  "HIMACHAL PRADESH":    "Shimla",
  "JHARKHAND":           "Ranchi",
  "KARNATAKA":           "Bengaluru",
  "KERALA":              "Thiruvananthapuram",
  "MADHYA PRADESH":      "Bhopal",
  "MAHARASHTRA":         "Mumbai",
  "MANIPUR":             "Imphal",
  "MEGHALAYA":           "Shillong",
  "MIZORAM":             "Aizawl",
  "NAGALAND":            "Kohima",
  "ODISHA":              "Bhubaneswar",
  "PUNJAB":              "Ludhiana",
  "RAJASTHAN":           "Jaipur",
  "SIKKIM":              "Gangtok",
  "TAMIL NADU":          "Chennai",
  "TELANGANA":           "Hyderabad",
  "TRIPURA":             "Agartala",
  "UTTAR PRADESH":       "Lucknow",
  "UTTARAKHAND":         "Dehradun",
  "WEST BENGAL":         "Kolkata",
  "JAMMU AND KASHMIR":   "Srinagar",
  "LADAKH":              "Leh",
  "CHANDIGARH":          "Chandigarh",
  "PUDUCHERRY":          "Puducherry",
};

const EXTRA_STATE_COORDS: Record<string, { lat: number; lng: number }> = {
  "Itanagar":  { lat: 27.0844, lng: 93.6053 },
  "Imphal":    { lat: 24.8170, lng: 93.9368 },
  "Shillong":  { lat: 25.5788, lng: 91.8933 },
  "Aizawl":    { lat: 23.7271, lng: 92.7176 },
  "Kohima":    { lat: 25.6701, lng: 94.1077 },
  "Gangtok":   { lat: 27.3389, lng: 88.6065 },
  "Agartala":  { lat: 23.8315, lng: 91.2868 },
  "Leh":       { lat: 34.1526, lng: 77.5771 },
  "Puducherry":{ lat: 11.9416, lng: 79.8083 },
};

function resolveCoordinates(district: string, state: string): {
  lat: number;
  lng: number;
  canonicalCity: string;
  matchQuality: GeocodeResult["match_quality"];
} {
  const normalizedDist = district.trim();

  for (const [city, info] of Object.entries(CITY_COORDS)) {
    if (city.toLowerCase() === normalizedDist.toLowerCase()) {
      return { lat: info.lat, lng: info.lng, canonicalCity: city, matchQuality: "city" };
    }
    if (info.aliases?.some((a) => a.toLowerCase() === normalizedDist.toLowerCase())) {
      return { lat: info.lat, lng: info.lng, canonicalCity: city, matchQuality: "city" };
    }
  }

  const capitalName = STATE_CAPITAL[state.toUpperCase()];
  if (capitalName) {
    const capitalInfo = CITY_COORDS[capitalName] ?? EXTRA_STATE_COORDS[capitalName];
    if (capitalInfo) {
      return {
        lat: capitalInfo.lat,
        lng: capitalInfo.lng,
        canonicalCity: capitalName,
        matchQuality: "state_capital_fallback",
      };
    }
  }

  const err: any = new Error(
    `No coordinates found for district='${district}', state='${state}'. ` +
    `This pincode may be in a region not covered by the built-in table.`
  );
  err.statusCode = 422;
  throw err;
}

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
