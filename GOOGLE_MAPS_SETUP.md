# Google Maps API Key — 10-minute setup

You need a Google Maps API key to enable real road distances and route maps.
Free tier covers your demo usage easily — Google requires billing to be
enabled, but won't actually charge unless you exceed thousands of requests
per month.

## Steps

### 1. Go to Google Cloud Console

Open https://console.cloud.google.com/ and sign in with any Google account
(personal Gmail is fine; doesn't have to be a corporate account for the dev
demo).

### 2. Create a project

If you don't already have a project, click the project dropdown at the top
of the page → **NEW PROJECT** → name it something like `travel-agent-demo`
→ Create.

### 3. Enable the two APIs you need

Go to **APIs & Services → Library** in the left menu. Search for and
enable each of these:

- **Routes API** — provides road distance + duration + polyline
- **Maps Static API** — provides the rendered map image

For each: click the API → click **Enable**.

### 4. Enable billing (mandatory but free at our usage)

Google requires a billing account on file even for free-tier usage.
Go to **Billing** in the left menu → follow the prompts to add a card.

**You will not be charged** at demo volume:
- Routes API: 5,000 free events/month (Pro tier)
- Static Maps: 10,000 free events/month (Essentials tier)
- A typical demo with ~100 trip requests = 200-300 calls = well under free

You can also set a budget alert at $1 to be safe: go to **Billing → Budgets
& alerts → Create budget** and set the cap.

### 5. Create the API key

Go to **APIs & Services → Credentials** in the left menu → **+ Create
Credentials → API key**. Copy the key that appears.

### 6. Restrict the key (optional but recommended)

Click on the new key in the Credentials page. Under "API restrictions",
select "Restrict key" and choose only:
- Routes API
- Maps Static API

This means even if the key is leaked, it can't be used for other Google
services — limits the blast radius.

You can also restrict by HTTP referrer (your Render URL) but skip this
for now — the API is called from the backend, not the browser.

### 7. Add the key to Render

Go to your Render dashboard → travel-agent-api service → **Environment**
tab → click **Add Environment Variable**:

- Key: `GOOGLE_MAPS_API_KEY`
- Value: (paste the key from step 5)

Click **Save Changes**. Render will automatically redeploy the API.

### 8. Verify it's working

Open your API health endpoint in a browser:

```
https://travel-agent-api-XXXX.onrender.com/health
```

You should see:

```json
{
  "status": "ok",
  "llm_configured": true,
  "google_maps_configured": true
}
```

If `google_maps_configured` is `true`, you're done.

### 9. Submit a trip request

Open your web URL, submit any trip request (e.g., the default Mumbai →
Pune sample). The result page should now show:

- A real map image with the route highlighted in red
- Real road distance (e.g., 152 km, not the haversine 125 km)
- Real drive time estimate (e.g., 3h 15m)
- Cab fare breakdown using corporate tariff rates

If you don't see the map, check the Render logs for the API service —
errors will be logged with the prefix `[orchestrator] Google Maps Routes
failed`.

## Troubleshooting

**"This API project is not authorized to use this API"**
→ The two APIs (Routes + Static Maps) need to be enabled in step 3 for
the same project as the key was created in.

**"You must enable Billing on the Google Cloud Project"**
→ Step 4. Yes, even for the free tier.

**Map shows but routes are wrong**
→ Coordinates of your seed clients may be off. Check the geocoding logic
in `apps/api/src/services/geocoding.ts` — pincode lookups depend on the
India Post API which occasionally has stale data.

**You see HTTP 429 in the logs**
→ Rate limited. Default Routes API quota is 100 requests/second. You can
raise this in the Google Cloud Console → APIs & Services → Quotas.

**You see HTTP 403 with "REQUEST_DENIED"**
→ API restrictions in step 6 are too tight. Re-check that Routes API and
Maps Static API are both in the allowed list for the key.
