# Travel Request Agent

An AI-powered travel request system: an employee writes one line ("I need to be in Pune Tuesday afternoon, back Wednesday evening"), the agent parses intent, looks up employee band & client address, applies bank travel policy (mode, class, hotel category), and routes a structured request to Finance for approval and booking.

## Stack

**Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + TanStack Query + React Router
**Backend**: Node 20 + Express + TypeScript + Prisma ORM + Zod
**Database**: PostgreSQL
**LLM**: Anthropic Claude (with regex fallback if no API key)
**Deploy**: Render (Blueprint deploys all 3 services from one `render.yaml`)

## Repo layout

```
travel-agent/
├── render.yaml             ← Render Blueprint: API + Web + Postgres
├── package.json            ← npm workspaces root
├── apps/
│   ├── api/                ← Express + Prisma backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma     (5 models: employee, client, policy_band, trip_request, audit_log)
│   │   │   └── seed.ts            (3 employees, 3 clients, 6 policy bands)
│   │   └── src/
│   │       ├── index.ts          (Express app, CORS, error handling)
│   │       ├── lib/              (prisma client, haversine)
│   │       ├── routes/           (travel, employees, clients, finance)
│   │       └── services/
│   │           ├── intentParser.ts    (Anthropic SDK + regex fallback)
│   │           ├── policyEngine.ts    (distance bands × employee band → mode/class/hotel)
│   │           ├── inventory.ts       (flight/train/hotel stubs)
│   │           └── orchestrator.ts    (main flow + DB persistence + audit)
│   └── web/                ← Vite + React frontend
│       └── src/
│           ├── App.tsx, main.tsx, index.css
│           ├── components/ui/   (shadcn primitives)
│           ├── lib/              (axios API client, types)
│           └── pages/
│               ├── EmployeeView.tsx   (submit request, see proposal)
│               └── FinanceView.tsx    (queue, approve/reject/mark-booked)
```

## What the agent does

1. **Parse intent** (Anthropic Claude → regex fallback). Extracts origin, destination, dates, time windows, client.
2. **Employee lookup** (Postgres). Band, home city, manager.
3. **Client lookup** (Postgres). If not found, agent returns `needs_client_address` and the UI prompts the employee for it.
4. **Policy engine** (Postgres-driven bands). Distance + band → mode (road/train/flight), class, hotel stars.
5. **Inventory search** (stubs). Flights, trains, hotels with realistic fares.
6. **Persist + audit**. Trip request saved with status `pending_finance_approval`, every state change logged.
7. **Finance UI**. Approve / reject / mark-booked, with note and audit trail.

## Quick deploy to Render

### Prerequisites
- A GitHub account and a repo to push this code into.
- A Render account (free tier works for this demo).
- Optionally, an Anthropic API key for the LLM intent parser. Without it, the regex fallback runs.

### Step 1 — Push to GitHub

```bash
cd travel-agent
git init
git add .
git commit -m "Initial travel agent"
git branch -M main
git remote add origin https://github.com/<you>/travel-agent.git
git push -u origin main
```

### Step 2 — Create the Blueprint on Render

1. Render dashboard → **New** → **Blueprint**.
2. Connect your GitHub repo.
3. Render reads `render.yaml` and proposes 3 services:
   - `travel-agent-db` (Postgres, free)
   - `travel-agent-api` (Node web service, free)
   - `travel-agent-web` (Static site, free)
4. Click **Apply**. The DB provisions immediately. The API and Web services start building.

### Step 3 — Set the secret env vars

The Blueprint marks two values as `sync: false` (you set them yourself, not from a file):

**On `travel-agent-api`:**
- `ANTHROPIC_API_KEY` — paste your Anthropic key, or leave blank to use the regex fallback.
- `CORS_ORIGIN` — set this **after the web service deploys**. It will be something like `https://travel-agent-web-abcd.onrender.com`.

**On `travel-agent-web`:**
- `VITE_API_URL` — set this **after the API service deploys**. Something like `https://travel-agent-api-wxyz.onrender.com`.

### Step 4 — Two-pass deploy (because the URLs are circular)

Render gives the API and Web services their URLs only after they first deploy. So:

1. First deploy runs with placeholders. Web build will succeed (it just bakes in whatever `VITE_API_URL` is at build time — initially empty/wrong); API will start (with `CORS_ORIGIN=*` effectively, which is fine for first-pass testing).
2. Once both have URLs visible in the dashboard:
   - Set `VITE_API_URL` on the web service to the API's URL.
   - Set `CORS_ORIGIN` on the API to the web service's URL.
   - **Manually trigger a redeploy of both services** (Settings → Manual Deploy → Deploy latest commit). The web service must redeploy because Vite bakes env vars in at build time.

### Step 5 — Test it

Open the web service URL. Pick an employee, type a sample request, hit Submit. The result appears below; switch to **Finance queue** to approve/reject.

API endpoints (also useful for `curl` testing):

| Method | Path | Purpose |
|---|---|---|
| GET  | `/health`              | health check + LLM status |
| GET  | `/employees`           | list seeded employees |
| GET  | `/clients?q=`          | search client directory |
| POST | `/travel/parse`        | submit travel request (returns proposal or `needs_client_address`) |
| POST | `/travel/submit`       | resubmit with `user_supplied_client` |
| GET  | `/finance/queue?status=` | finance queue (default: pending) |
| GET  | `/finance/:id`         | full detail + audit log |
| POST | `/finance/:id/approve` | approve (body: `{approver, note}`) |
| POST | `/finance/:id/reject`  | reject |
| POST | `/finance/:id/mark-booked` | mark as booked |

## Sample requests

```bash
# Happy path - client in directory
curl -X POST $API/travel/parse -H 'Content-Type: application/json' -d '{
  "employee_id": "E1001",
  "text": "I need to be in Pune Tuesday afternoon, back Wednesday evening for client Bajaj Finance"
}'

# Unknown client - returns needs_client_address
curl -X POST $API/travel/parse -H 'Content-Type: application/json' -d '{
  "employee_id": "E1002",
  "text": "Need to fly to Bengaluru Monday morning, back Tuesday evening for client Acme Capital"
}'

# Resubmit with the address
curl -X POST $API/travel/submit -H 'Content-Type: application/json' -d '{
  "employee_id": "E1002",
  "text": "Need to fly to Bengaluru Monday morning, back Tuesday evening for client Acme Capital",
  "user_supplied_client": {
    "client_name": "Acme Capital",
    "address": "Prestige Tech Park, Outer Ring Road, Bengaluru",
    "city": "Bengaluru",
    "lat": 12.9352,
    "lng": 77.6914
  }
}'
```

## Local development

You'll need a Postgres running locally (or via Docker).

```bash
# 1. Start Postgres (Docker example)
docker run --name pg-travel -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
docker exec -it pg-travel psql -U postgres -c "CREATE DATABASE travel_agent;"

# 2. Backend
cd apps/api
cp .env.example .env
# Edit .env: set DATABASE_URL, ANTHROPIC_API_KEY (optional), CORS_ORIGIN=http://localhost:5173
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
# API on http://localhost:3000

# 3. Frontend (in a separate terminal)
cd apps/web
cp .env.example .env
# Default VITE_API_URL=http://localhost:3000 should be fine
npm install
npm run dev
# Web on http://localhost:5173
```

## Sample data (seeded automatically)

**Employees**
| ID | Name | Band | Home |
|---|---|---|---|
| E1001 | Priya Sharma | B3 | Mumbai |
| E1002 | Arjun Mehta  | B5 | Mumbai |
| E1003 | Neha Verma   | B1 | Pune |

**Clients (in directory)**: Bajaj Finance (Pune), Persistent Systems (Pune), Tata Capital (Mumbai)

**Policy bands**
| Band | Flight class | Train class | Hotel | Per diem |
|---|---|---|---|---|
| B1, B2 | Economy         | AC 3-Tier | 3-star | ₹1,500 |
| B3, B4 | Economy         | AC 2-Tier | 4-star | ₹2,500 |
| B5     | Premium Economy | AC 1-Tier | 5-star | ₹4,000 |
| B6     | Business        | AC 1-Tier | 5-star | ₹6,000 |

**Mode rules**
- < 250 km → road/cab (any band)
- 250–800 km → train (B1–B4) or flight (B5+)
- > 800 km → flight (any band)

## Replacing the stubs with production systems

Each component has a clean interface — swap one at a time without touching the others.

| Stub today | Replace with |
|---|---|
| `EmployeeLookup` (Postgres seeded) | Sync from your HRMS/Workday/SuccessFactors into the `employees` table, or proxy the lookup live |
| `ClientAddressLookup` (Postgres seeded) | Sync from CRM/Client Master into `clients` |
| `PolicyEngine.BAND_ENTITLEMENT` (Postgres `policy_band` table) | Already in DB — just update rows. No deploy needed for policy changes |
| `InventorySearch` flight stub | Amadeus / Sabre / TBO / corporate booking tool API |
| `InventorySearch` train stub  | IRCTC partner API or aggregator |
| `InventorySearch` hotel stub  | Booking.com EPS / Expedia Affiliate / corporate hotel program |
| `InventorySearch` cab stub    | Ola Corporate / Uber for Business |
| `FinanceHandoff` (DB-only)    | Add ServiceNow/Jira ticket creation + email to finance DL on `submitted` event |

## Cold-start caveat (Render free tier)

Free services spin down after ~15 min idle. With 3 tiers (web → API → DB), the first request after a cold start can take 60–90 seconds. Each subsequent request is fast. For client-facing demos, upgrade the API service to **Starter** ($7/mo) to keep it always-on.

## Things to add before this is more than a demo

- **Auth.** Currently the employee dropdown is a stub. Add JWT/SSO and infer `employee_id` from the token.
- **Manager approval step.** Insert a `pending_manager_approval` state before `pending_finance_approval`.
- **Email notifications.** SendGrid/SES on submit, approve, reject.
- **Real distance.** Replace haversine with Google Distance Matrix or Mapbox for road/train (haversine is fine for flights).
- **Geocoding.** When the user supplies a client address, call a geocoder server-side instead of asking them for lat/lng.
- **Audit reporting.** A "policy compliance" view aggregating audit logs for RBI/internal audit.
- **Test suite.** Vitest for the frontend, Jest/Vitest + supertest for the backend.
