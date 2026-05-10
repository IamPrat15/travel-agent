# Phase 5 Update — Bug Fixes from PDF Review

This update fixes the four issues you flagged from the deployed app:

## Bug 1: "No hotel booking is required" was ignored

**Before:** Trip text said "No hotel booking is required" → system added Holiday Inn Express ₹4,500 anyway.

**After:** Intent parser now extracts a `needs_hotel: true | false | null` field. When the user explicitly says "no hotel", "no hotel booking", "hotel not required", "no accommodation", "no overnight" — `needs_hotel = false` and `searchHotel()` is skipped entirely.

**Verified:** Test scenario "Mumbai office, 10 AM Monday, day trip, meeting Persistent Systems" now produces:
- 105.5 km distance (real, not 0)
- No hotel
- Cab fare ₹3,120 total (was ₹13,500 with bogus hotel)

## Bug 2: Same-day round trips still got hotels

**Before:** "Travel to Tata Capital tomorrow morning, return same day evening" → hotel was added because no explicit "no hotel" phrase.

**After:** When `depart_date == return_date`, the parser sets `needs_hotel = false` automatically. Also: when the request contains both "morning" and "evening" keywords with a single weekday, it's treated as a same-day trip ("morning ... evening" pattern).

## Bug 3: Multi-day trips with ambiguous hotel intent should ASK

**Before:** "I need to be in Pune Tuesday afternoon, back Wednesday evening for client Bajaj Finance" → system silently added a hotel without asking.

**After:** When `intent.needs_hotel === null` AND it's a multi-day trip, the orchestrator now returns:
```
status: "needs_hotel_decision"
message: "This is a multi-day trip (2026-05-12 to 2026-05-13). Do you need hotel booking?"
required_fields: ["needs_hotel"]
```

The frontend shows a dialog with two pill-rounded buttons: "No hotel needed" (outline) and "Yes, book hotel" (black primary). Whichever the user picks is sent back as `user_supplied_needs_hotel: boolean` and the trip resumes through the orchestrator.

This mirrors the existing "needs_client_address" pattern. Same UX shape, just for the hotel question.

## Bug 4: Cab fare had driver allowance line

**Before:** Cab breakdown showed:
```
Base fare (120.2 km × ₹14/km × 2 legs)    ₹3,364
Driver allowance (2 days) · OUTSTATION      ₹800
Toll estimate (2 legs)                      ₹192
Total                                       ₹4,356
```

**After:** Cab breakdown is Ola/Uber-style — fare + tolls only:
```
Base fare (120.2 km × ₹14/km × 2 legs)    ₹3,364
Toll estimate (2 legs)                      ₹192
Total                                       ₹3,556
```

The `driver_allowance_inr` field is gone from `CabFareBreakdown` entirely. Per-leg fare is now `base_fare_inr_per_leg + toll_estimate_inr_per_leg` (cleanly halves the round-trip).

Driver allowance is still implicitly bundled into vendor pricing when finance actually books on Ola Corporate / Uber for Business — that's how those platforms work — but the user-facing breakdown matches the consumer mental model.

## Bonus: AI Verdict catches 0-km trips

I also added a sanity check: if `distance_km < 5` for a trip that should be intercity, the verdict service now flags it as `severity: fail` with label "Trip distance is suspiciously low". The original PDF case (Mumbai office / Persistent Systems showing 0 km) would now produce a `reject_recommended` verdict at 52% confidence instead of the misleading `approve_with_review` at 80%.

I also added a hotel-vs-intent sanity check: if a hotel is added when `intent.needs_hotel === false` OR when `depart_date == return_date`, it's flagged as a fail. This catches future regressions even if the orchestrator logic drifts.

## Files in this zip (21 total — cumulative with all prior phases)

### Backend
- `apps/api/src/services/intentParser.ts` — needs_hotel extraction, same-day inference, "tomorrow"/"today" date keywords
- `apps/api/src/services/orchestrator.ts` — skips hotel when not needed, asks user when ambiguous, simplified cab fare wiring
- `apps/api/src/services/cabTariff.ts` — driver allowance removed; fare + tolls only
- `apps/api/src/services/verdict.ts` — 0-km sanity check + hotel-vs-intent sanity check
- `apps/api/src/services/inventory.ts` — unchanged
- `apps/api/src/services/googleMaps.ts` — unchanged
- `apps/api/src/routes/travel.ts` — accepts `user_supplied_needs_hotel`
- `apps/api/src/routes/finance.ts` — unchanged
- `apps/api/src/index.ts` — unchanged
- `apps/api/.env.example` — unchanged

### Frontend
- `apps/web/src/lib/api.ts` — TripIntent gains `needs_hotel`/`is_intra_city`; ParseResponse gains `needs_hotel_decision` variant; CabFareBreakdown drops `driver_allowance_inr`; ParseInput gains `user_supplied_needs_hotel`
- `apps/web/src/pages/EmployeeView.tsx` — handles `needs_hotel_decision` response with new dialog
- `apps/web/src/pages/FinanceView.tsx` — unchanged
- `apps/web/src/components/RouteMap.tsx` — driver allowance row removed
- `apps/web/src/components/VerdictCard.tsx` — unchanged
- `apps/web/src/components/first/index.tsx` — unchanged (FIRST AI primitives)
- `apps/web/src/styles/first-tokens.css` — unchanged
- `apps/web/src/App.tsx` — unchanged
- `apps/web/src/index.css` — unchanged
- `apps/web/index.html` — unchanged

### Docs
- `GOOGLE_MAPS_SETUP.md` — unchanged

## Smoke test results

I ran the three exact PDF scenarios end-to-end against a sqlite test sandbox:

| Scenario | Old result | New result |
|---|---|---|
| "No hotel booking is required" | Holiday Inn Express ₹4,500 added | No hotel rendered |
| "tomorrow morning ... return same day evening" | Hotel auto-added | Hotel skipped (same-day inferred) |
| "Mumbai office, day trip, meeting Persistent Systems" | 0 km, ₹250 cab + JW Marriott ₹13,000 = **₹13,500** | 105.5 km Mumbai→Pune, ₹3,120 total, **no hotel** |
| "Pune Tuesday afternoon, back Wednesday evening" | Hotel auto-added | Asks "do you need hotel?" before proceeding |

## What's still imperfect and you should know

**Regex fallback is dumber than the LLM path.** The intent parser falls back to regex when `ANTHROPIC_API_KEY` is not set. The regex parser has limitations: e.g., "Travel to Tata Capital" with no explicit "client X" phrasing won't extract "Tata Capital" as the client. In production with the LLM key set, this is handled correctly. If your senior tests with the API key off, they'll see this fallback behavior. Either ensure the key is always set, or accept that the regex fallback is for emergencies.

**Client name resolution is exact-match.** "Persistent" alone won't match "Persistent Systems" in production (Postgres uses case-insensitive equals). For better fuzzy matching we'd need a search-style lookup — that's a Phase 6 candidate.

**The system still doesn't validate "can a Mumbai person take a same-day road trip to Persistent Pune at 10 AM and be back by evening"?** 105 km × 2 = 210 km of driving + meeting time. That's tight. A real planner would flag it. The current verdict doesn't. Worth a future check: "Is the schedule physically feasible given travel times?"

## Upload checklist (same pattern as before)

For changed files: navigate on GitHub → pencil → select-all → paste → commit.

For new files: Add file → Create new file → use the path with slashes to create folders.

The new file paths in this drop:
- `apps/api/src/services/intentParser.ts` (replaced)
- `apps/api/src/services/cabTariff.ts` (replaced)
- `apps/api/src/services/orchestrator.ts` (replaced)
- `apps/api/src/services/verdict.ts` (replaced)
- `apps/api/src/routes/travel.ts` (replaced)
- `apps/web/src/lib/api.ts` (replaced)
- `apps/web/src/pages/EmployeeView.tsx` (replaced)
- `apps/web/src/components/RouteMap.tsx` (replaced)

Render auto-redeploys. Wait 3-5 minutes after the last commit, then re-run your three PDF scenarios.

## Senior demo talking points

When you walk through this with the senior:

> "You flagged four bugs from the live test. All four are fixed:
> 
> 1. The system now reads 'no hotel' explicitly and skips it.
> 2. Same-day trips don't get hotels by default — the system infers it from depart=return.
> 3. When it's genuinely ambiguous, the system asks the employee instead of guessing.
> 4. The cab fare is now Ola/Uber style — fare + tolls, no driver allowance line.
> 
> I also added a sanity check that catches 0-km bogus trips and downgrades the verdict from approve to reject. The Mumbai/Persistent case from your test would now flag with 'Trip distance is suspiciously low — human review required.'
> 
> One genuine remaining issue I want to call out: the regex parser fallback is dumber than the LLM. If we want the system to robustly understand all phrasings, we keep `ANTHROPIC_API_KEY` always set. Approving the model spend for this is a one-line decision."
