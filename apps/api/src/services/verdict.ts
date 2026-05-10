/**
 * AI Verdict for finance approval.
 *
 * What this is:
 *   A rules-based audit reviewer that pre-checks every trip request before
 *   it lands in the finance queue. It produces a structured verdict the
 *   finance reviewer can sanity-check, plus a natural-language summary.
 *
 * Why deterministic:
 *   The pass/fail decisions and the confidence score are computed from
 *   pure rules over the trip data. The LLM only writes the prose summary.
 *   This means the verdict is reproducible and auditable — re-running it
 *   on the same trip always produces the same decisions.
 *
 * Three check categories:
 *   1. Policy compliance — does this trip match the bank's stated policy
 *      for this employee's band? (mode, class, hotel stars, per-diem)
 *   2. Anomaly detection — does this trip look reasonable compared to
 *      historical requests? (fare bands, hotel proximity, lead time)
 *   3. Data sanity — are dates, totals, and references coherent?
 */

import { prisma } from "../lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

export type CheckSeverity = "pass" | "info" | "warn" | "fail";

export interface VerdictCheck {
  id: string;
  category: "policy" | "anomaly" | "sanity";
  severity: CheckSeverity;
  label: string;
  detail: string;
}

export type VerdictRecommendation =
  | "approve_recommended"
  | "approve_with_review"
  | "reject_recommended"
  | "manual_review_required";

export interface AiVerdict {
  recommendation: VerdictRecommendation;
  confidence: number; // 0 - 100
  checks: VerdictCheck[];
  summary: string;
  // The raw counts used to compute confidence — exposed for audit transparency
  metrics: {
    pass: number;
    info: number;
    warn: number;
    fail: number;
  };
  generated_at: string;
  llm_used: boolean;
}

// Helper: tolerate JSON-as-string (sqlite) as well as parsed JSON (Postgres).
// Prisma's Json column type is parsed automatically on Postgres but stored as
// String on sqlite. This makes the verdict service work in both.
function asObj(v: any): any {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

/**
 * Top-level entry point. Pulls the trip request from DB, runs all checks,
 * and writes the verdict back to the audit log.
 */
export async function computeVerdict(tripRequestId: string): Promise<AiVerdict> {
  const trip = await prisma.tripRequest.findUnique({
    where: { id: tripRequestId },
    include: { employee: true, client: true },
  });
  if (!trip) {
    const err: any = new Error(`TripRequest ${tripRequestId} not found`);
    err.statusCode = 404;
    throw err;
  }

  // Normalize JSON fields (handles both Postgres-native Json and sqlite strings)
  const normalized = {
    ...trip,
    intent: asObj((trip as any).intent),
    policy: asObj((trip as any).policy),
    outbound: asObj((trip as any).outbound),
    inbound: asObj((trip as any).inbound),
    hotel: asObj((trip as any).hotel),
  };

  // Pull historical context for anomaly checks - last 90 days of approved
  // or pending trips, used to compute median fares for similar routes.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const historicalTripsRaw = await prisma.tripRequest.findMany({
    where: {
      id: { not: tripRequestId },
      status: { in: ["approved", "booked", "pending_finance_approval"] },
      createdAt: { gte: ninetyDaysAgo },
      estimatedTotalInr: { not: null },
    },
    select: {
      estimatedTotalInr: true,
      policy: true,
      intent: true,
      createdAt: true,
    },
  });
  const historicalTrips = historicalTripsRaw.map((h) => ({
    ...h,
    policy: asObj(h.policy),
    intent: asObj(h.intent),
  }));

  const checks: VerdictCheck[] = [];
  checks.push(...runPolicyChecks(normalized));
  checks.push(...runAnomalyChecks(normalized, historicalTrips));
  checks.push(...runSanityChecks(normalized));

  const metrics = countSeverities(checks);
  const recommendation = decideRecommendation(metrics);
  const confidence = computeConfidence(metrics, checks);

  const summary = await generateSummary(normalized, checks, recommendation, confidence);
  const llmUsed = summary.source === "llm";

  const verdict: AiVerdict = {
    recommendation,
    confidence,
    checks,
    summary: summary.text,
    metrics,
    generated_at: new Date().toISOString(),
    llm_used: llmUsed,
  };

  // Persist verdict to audit log so finance has a permanent record.
  // In Postgres the `details` column is Json (object accepted); in sqlite
  // (test environments) it's String, so we fall back to stringifying.
  try {
    await prisma.auditLog.create({
      data: {
        tripRequestId,
        event: "ai_verdict_generated",
        actor: "system",
        details: verdict as any,
      },
    });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("Expected String")) {
      await prisma.auditLog.create({
        data: {
          tripRequestId,
          event: "ai_verdict_generated",
          actor: "system",
          details: JSON.stringify(verdict) as any,
        },
      });
    } else {
      throw err;
    }
  }

  return verdict;
}

// ---------- Policy checks (deterministic) ----------

function runPolicyChecks(trip: any): VerdictCheck[] {
  const checks: VerdictCheck[] = [];
  const policy = trip.policy as any;
  const employee = trip.employee;
  const outbound = trip.outbound as any;
  const inbound = trip.inbound as any;
  const hotel = trip.hotel as any;
  const intent = trip.intent as any;

  if (!policy) {
    checks.push({
      id: "policy_missing",
      category: "policy",
      severity: "fail",
      label: "Policy decision missing",
      detail: "No policy decision was recorded — cannot verify compliance.",
    });
    return checks;
  }

  // 1. Mode-distance band match
  const km = policy.distance_km;
  const mode = policy.mode;

  // 1a. Sanity: distance shouldn't be near zero. A 0 km "trip" usually means
  // the destination resolved to the employee's home city, OR the client lookup
  // returned a stale match. Either way, the request needs human review before
  // any policy logic runs against it.
  if (km < 5) {
    checks.push({
      id: "zero_distance_anomaly",
      category: "sanity",
      severity: "fail",
      label: "Trip distance is suspiciously low",
      detail: `Distance computed as ${km.toFixed(1)} km — likely a destination/client mismatch or intra-city trip. Human review required.`,
    });
  }

  let expectedMode: "road" | "train" | "flight";
  if (km < 250) expectedMode = "road";
  else if (km <= 800) expectedMode = (employee.band === "B5" || employee.band === "B6") ? "flight" : "train";
  else expectedMode = "flight";

  if (mode === expectedMode) {
    checks.push({
      id: "mode_band",
      category: "policy",
      severity: "pass",
      label: "Travel mode matches distance band",
      detail: `${km.toFixed(0)} km → ${mode} (correct for band ${employee.band}).`,
    });
  } else {
    checks.push({
      id: "mode_band",
      category: "policy",
      severity: "fail",
      label: "Travel mode does not match distance band",
      detail: `${km.toFixed(0)} km → policy expects ${expectedMode} for band ${employee.band}, but selected ${mode}.`,
    });
  }

  // 2. Hotel star matches band entitlement
  // (This is an exact match check — band tables drive entitlement.)
  const expectedStarsByBand: Record<string, number> = {
    B1: 3, B2: 3, B3: 4, B4: 4, B5: 5, B6: 5,
  };
  const expectedStars = expectedStarsByBand[employee.band];
  if (hotel && expectedStars !== undefined) {
    if (hotel.category_stars === expectedStars) {
      checks.push({
        id: "hotel_band",
        category: "policy",
        severity: "pass",
        label: "Hotel category matches band entitlement",
        detail: `Band ${employee.band} entitled to ${expectedStars}-star; selected ${hotel.category_stars}-star.`,
      });
    } else if (hotel.category_stars < expectedStars) {
      checks.push({
        id: "hotel_band",
        category: "policy",
        severity: "info",
        label: "Hotel below band entitlement",
        detail: `Band ${employee.band} entitled to ${expectedStars}-star; employee chose ${hotel.category_stars}-star (cost-saving, allowed).`,
      });
    } else {
      checks.push({
        id: "hotel_band",
        category: "policy",
        severity: "fail",
        label: "Hotel above band entitlement",
        detail: `Band ${employee.band} entitled to ${expectedStars}-star; selected ${hotel.category_stars}-star is over-spec.`,
      });
    }
  }

  // 2b. Sanity: hotel vs trip-shape mismatch.
  // If the user explicitly said no hotel but one was added anyway, flag it.
  // If it's a same-day trip (depart == return) but a hotel was added, flag it.
  if (hotel && intent) {
    if (intent.needs_hotel === false) {
      checks.push({
        id: "hotel_vs_intent",
        category: "sanity",
        severity: "fail",
        label: "Hotel added despite explicit 'no hotel' instruction",
        detail: "Employee specified no hotel was needed, but an overnight stay is in the itinerary.",
      });
    } else if (intent.depart_date && intent.return_date && intent.depart_date === intent.return_date) {
      checks.push({
        id: "hotel_vs_intent",
        category: "sanity",
        severity: "fail",
        label: "Hotel added to same-day trip",
        detail: `Trip departs and returns on ${intent.depart_date} — no overnight stay needed.`,
      });
    }
  }

  // 3. Travel class matches policy decision
  if (outbound && policy.travel_class && outbound.travel_class !== policy.travel_class) {
    checks.push({
      id: "class_consistency",
      category: "policy",
      severity: "warn",
      label: "Travel class mismatch on outbound",
      detail: `Policy assigned ${policy.travel_class}; outbound option lists ${outbound.travel_class}.`,
    });
  } else if (outbound) {
    checks.push({
      id: "class_consistency",
      category: "policy",
      severity: "pass",
      label: "Travel class consistent with policy",
      detail: `Outbound and inbound use ${policy.travel_class} as assigned.`,
    });
  }

  return checks;
}

// ---------- Anomaly checks (statistical) ----------

function runAnomalyChecks(trip: any, history: any[]): VerdictCheck[] {
  const checks: VerdictCheck[] = [];
  const policy = trip.policy as any;
  const intent = trip.intent as any;
  const hotel = trip.hotel as any;
  const total = trip.estimatedTotalInr ?? 0;

  // 1. Fare reasonableness vs historical median for same mode + band
  const sameModeBand = history.filter((h: any) => {
    const p = h.policy as any;
    return p && p.mode === policy?.mode && p.hotel_category === policy?.hotel_category;
  });
  if (sameModeBand.length >= 5) {
    const totals = sameModeBand
      .map((h: any) => h.estimatedTotalInr as number)
      .filter((n: any) => typeof n === "number")
      .sort((a, b) => a - b);
    const median = totals[Math.floor(totals.length / 2)];
    const ratio = median > 0 ? total / median : 1;
    if (ratio > 1.5) {
      checks.push({
        id: "fare_outlier_high",
        category: "anomaly",
        severity: "warn",
        label: "Total cost is unusually high",
        detail: `₹${total.toLocaleString("en-IN")} is ${(ratio * 100 - 100).toFixed(0)}% above the ${sameModeBand.length}-trip median of ₹${median.toLocaleString("en-IN")} for similar trips.`,
      });
    } else if (ratio < 0.5) {
      checks.push({
        id: "fare_outlier_low",
        category: "anomaly",
        severity: "info",
        label: "Total cost notably below typical",
        detail: `₹${total.toLocaleString("en-IN")} is well below the ₹${median.toLocaleString("en-IN")} median — verify completeness.`,
      });
    } else {
      checks.push({
        id: "fare_in_range",
        category: "anomaly",
        severity: "pass",
        label: "Total cost within typical range",
        detail: `₹${total.toLocaleString("en-IN")} compared to median ₹${median.toLocaleString("en-IN")} for similar trips.`,
      });
    }
  } else {
    checks.push({
      id: "fare_in_range",
      category: "anomaly",
      severity: "info",
      label: "Insufficient history for fare comparison",
      detail: `Only ${sameModeBand.length} similar trips in last 90 days — not enough to flag outliers reliably.`,
    });
  }

  // 2. Booking lead time
  const departDate = intent?.depart_date ? new Date(intent.depart_date) : null;
  const createdAt = new Date(trip.createdAt);
  if (departDate && !isNaN(departDate.getTime())) {
    const leadDays = Math.round((departDate.getTime() - createdAt.getTime()) / (24 * 3600 * 1000));
    if (leadDays < 0) {
      checks.push({
        id: "lead_time",
        category: "anomaly",
        severity: "fail",
        label: "Departure date is in the past",
        detail: `Departure ${intent.depart_date} is before submission date.`,
      });
    } else if (leadDays < 2) {
      checks.push({
        id: "lead_time",
        category: "anomaly",
        severity: "warn",
        label: "Last-minute booking",
        detail: `Only ${leadDays} day(s) until departure — fares may be elevated, justification recommended.`,
      });
    } else if (leadDays > 60) {
      checks.push({
        id: "lead_time",
        category: "anomaly",
        severity: "info",
        label: "Booking far in advance",
        detail: `${leadDays} days lead time — verify dates are correct.`,
      });
    } else {
      checks.push({
        id: "lead_time",
        category: "anomaly",
        severity: "pass",
        label: "Booking lead time is normal",
        detail: `${leadDays} days between submission and departure.`,
      });
    }
  }

  // 3. Hotel proximity to client office
  if (hotel && typeof hotel.distance_km_from_client === "number") {
    if (hotel.distance_km_from_client > 10) {
      checks.push({
        id: "hotel_distance",
        category: "anomaly",
        severity: "warn",
        label: "Hotel far from client office",
        detail: `Hotel is ${hotel.distance_km_from_client.toFixed(1)} km from client — recommended < 10 km for evening logistics.`,
      });
    } else {
      checks.push({
        id: "hotel_distance",
        category: "anomaly",
        severity: "pass",
        label: "Hotel near client office",
        detail: `${hotel.distance_km_from_client.toFixed(1)} km from client office.`,
      });
    }
  }

  return checks;
}

// ---------- Data sanity checks ----------

function runSanityChecks(trip: any): VerdictCheck[] {
  const checks: VerdictCheck[] = [];
  const intent = trip.intent as any;
  const outbound = trip.outbound as any;
  const inbound = trip.inbound as any;
  const total = trip.estimatedTotalInr ?? 0;
  const hotel = trip.hotel as any;

  // 1. Return after departure
  if (intent?.depart_date && intent?.return_date) {
    const dep = new Date(intent.depart_date);
    const ret = new Date(intent.return_date);
    if (ret < dep) {
      checks.push({
        id: "date_order",
        category: "sanity",
        severity: "fail",
        label: "Return date is before departure",
        detail: `Return ${intent.return_date} earlier than departure ${intent.depart_date}.`,
      });
    } else {
      checks.push({
        id: "date_order",
        category: "sanity",
        severity: "pass",
        label: "Trip dates are in order",
        detail: `${intent.depart_date} → ${intent.return_date}.`,
      });
    }
  }

  // 2. Total reconciles with components
  if (outbound && inbound && hotel) {
    const sumOfParts = (outbound.fare_inr ?? 0) + (inbound.fare_inr ?? 0) + (hotel.total_inr ?? 0);
    if (Math.abs(sumOfParts - total) > 1) {
      checks.push({
        id: "total_reconcile",
        category: "sanity",
        severity: "fail",
        label: "Total does not reconcile with components",
        detail: `Components sum to ₹${sumOfParts.toLocaleString("en-IN")} but total stored as ₹${total.toLocaleString("en-IN")}.`,
      });
    } else {
      checks.push({
        id: "total_reconcile",
        category: "sanity",
        severity: "pass",
        label: "Total reconciles with components",
        detail: `Outbound + Inbound + Hotel = ₹${sumOfParts.toLocaleString("en-IN")}.`,
      });
    }
  }

  // 3. Client present
  if (!trip.client) {
    checks.push({
      id: "client_resolved",
      category: "sanity",
      severity: "warn",
      label: "Client not resolved",
      detail: "Trip submitted without a confirmed client — manager should verify trip purpose.",
    });
  } else {
    checks.push({
      id: "client_resolved",
      category: "sanity",
      severity: "pass",
      label: "Client resolved",
      detail: `Client: ${trip.client.name} (${trip.client.city}).`,
    });
  }

  return checks;
}

// ---------- Aggregation ----------

function countSeverities(checks: VerdictCheck[]) {
  return checks.reduce(
    (acc, c) => ({ ...acc, [c.severity]: acc[c.severity] + 1 }),
    { pass: 0, info: 0, warn: 0, fail: 0 }
  );
}

function decideRecommendation(metrics: ReturnType<typeof countSeverities>): VerdictRecommendation {
  if (metrics.fail > 0) return "reject_recommended";
  if (metrics.warn >= 2) return "manual_review_required";
  if (metrics.warn === 1) return "approve_with_review";
  return "approve_recommended";
}

function computeConfidence(
  metrics: ReturnType<typeof countSeverities>,
  checks: VerdictCheck[]
): number {
  // Weighted score: pass = +1.0, info = +0.7, warn = -0.5, fail = -2.0
  // Normalized to 0-100 with floor at 0.
  if (checks.length === 0) return 0;
  const weights = { pass: 1.0, info: 0.7, warn: -0.5, fail: -2.0 };
  const score =
    metrics.pass * weights.pass +
    metrics.info * weights.info +
    metrics.warn * weights.warn +
    metrics.fail * weights.fail;
  const max = checks.length * 1.0;
  const normalized = Math.max(0, Math.min(100, Math.round((score / max) * 100)));
  return normalized;
}

// ---------- Summary (LLM with template fallback) ----------

async function generateSummary(
  trip: any,
  checks: VerdictCheck[],
  recommendation: VerdictRecommendation,
  confidence: number
): Promise<{ text: string; source: "llm" | "template" }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.length > 10) {
    try {
      const text = await llmSummary(trip, checks, recommendation, confidence, apiKey);
      return { text, source: "llm" };
    } catch (err) {
      console.warn("[verdict] LLM summary failed, using template:", (err as Error).message);
    }
  }
  return { text: templateSummary(trip, checks, recommendation, confidence), source: "template" };
}

async function llmSummary(
  trip: any,
  checks: VerdictCheck[],
  recommendation: VerdictRecommendation,
  confidence: number,
  apiKey: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const system = `You write concise verdict summaries for a corporate travel finance approval queue.
Style: 2-3 sentences max. Plain professional English. No emojis. No bullet points.
Audience: a finance team reviewer who has 30 seconds to decide whether to approve.
You will receive: the trip facts and a list of automated checks already done.
Your job: distill the checks into a clear summary that highlights the recommendation
and any items that need human attention.
Do NOT invent facts. Do NOT contradict the recommendation field.`;

  const userPayload = {
    trip: {
      employee: `${trip.employee.name} (band ${trip.employee.band}, ${trip.employee.homeCity})`,
      client: trip.client?.name,
      destination: trip.client?.city,
      mode: trip.policy?.mode,
      total_inr: trip.estimatedTotalInr,
    },
    recommendation,
    confidence,
    checks: checks.map((c) => ({
      severity: c.severity,
      label: c.label,
      detail: c.detail,
    })),
  };

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 250,
    system,
    messages: [
      {
        role: "user",
        content: `Generate a verdict summary for this trip request:\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  });

  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in LLM response");
  return block.text.trim();
}

function templateSummary(
  trip: any,
  checks: VerdictCheck[],
  recommendation: VerdictRecommendation,
  confidence: number
): string {
  const recoText: Record<VerdictRecommendation, string> = {
    approve_recommended: "Approval recommended with no flags.",
    approve_with_review: "Approval recommended after a brief review of the flagged item.",
    reject_recommended: "Rejection recommended — at least one policy or sanity check failed.",
    manual_review_required: "Manual review required — multiple items need human judgment.",
  };

  const failCount = checks.filter((c) => c.severity === "fail").length;
  const warnCount = checks.filter((c) => c.severity === "warn").length;
  const flagsList: string[] = [];
  if (failCount > 0) flagsList.push(`${failCount} failure${failCount === 1 ? "" : "s"}`);
  if (warnCount > 0) flagsList.push(`${warnCount} warning${warnCount === 1 ? "" : "s"}`);

  const parts: string[] = [];
  parts.push(recoText[recommendation]);
  parts.push(`Confidence ${confidence}%.`);
  if (flagsList.length > 0) {
    const firstFailOrWarn = checks.find((c) => c.severity === "fail" || c.severity === "warn");
    parts.push(`Top item: ${firstFailOrWarn?.label}.`);
  } else {
    parts.push(`All ${checks.length} automated checks passed for ${trip.employee?.name} (band ${trip.employee?.band}).`);
  }
  return parts.join(" ");
}
