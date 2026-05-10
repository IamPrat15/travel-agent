import { useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, Sparkles } from "lucide-react";
import { Surface, Eyebrow, PeriodDot } from "./first";
import { cn } from "@/lib/utils";
import type {
  AiVerdict,
  VerdictRecommendation,
  CheckSeverity,
  VerdictCheck,
} from "@/lib/api";

interface VerdictCardProps {
  verdict: AiVerdict;
  /** Optional: callback for the regenerate button. If absent, button is hidden. */
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Compact mode: just summary line + recommendation, no checks. */
  compact?: boolean;
}

/**
 * AI Verdict — the audit-review summary shown to finance.
 *
 * FIRST AI conventions applied:
 *   - Surface (cream-4) instead of bright-bg banners
 *   - Severity rendered as status dots (Status tier), never as colored
 *     banners or bright Tailwind chips
 *   - Eyebrow line for "AI VERDICT" label, mono caps tracked
 *   - Confidence shown as a thin meter strip, not a colored pill
 *   - Whisper-style sentence summary in serif italic
 */
export function VerdictCard({ verdict, onRegenerate, regenerating, compact }: VerdictCardProps) {
  const [expanded, setExpanded] = useState(!compact);

  return (
    <Surface tone="surface-1" radius="2xl" padded="comfortable">
      {/* Header row: eyebrow + recommendation + refresh */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5 min-w-0">
          <Eyebrow>AI Verdict</Eyebrow>
          <p
            style={{
              fontFamily: "var(--font-family-sans)",
              fontSize: "var(--font-size-sub-1)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text-primary)",
              lineHeight: "var(--line-height-snug)",
              margin: 0,
            }}
          >
            {recommendationLabel(verdict.recommendation)}
            <PeriodDot />
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {verdict.llm_used && (
            <span
              className="inline-flex items-center gap-1"
              style={{
                fontFamily: "var(--font-family-mono)",
                fontSize: "var(--font-size-cap-2)",
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "var(--letter-spacing-eyebrow)",
              }}
              title="Summary written by Claude"
            >
              <Sparkles className="h-3 w-3" />
              LLM
            </span>
          )}
          <ConfidenceMeter value={verdict.confidence} />
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              aria-label="Regenerate verdict"
              style={{
                background: "transparent",
                border: "none",
                cursor: regenerating ? "default" : "pointer",
                color: "var(--color-text-tertiary)",
                padding: "var(--space-6)",
                borderRadius: "var(--radius-pill)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
            </button>
          )}
        </div>
      </div>

      {/* Summary — sentence, in slightly larger body voice */}
      <p
        style={{
          marginTop: "var(--space-16)",
          marginBottom: 0,
          fontFamily: "var(--font-family-sans)",
          fontSize: "var(--font-size-body-1)",
          lineHeight: "var(--line-height-relaxed)",
          color: "var(--color-text-secondary)",
        }}
      >
        {verdict.summary}
      </p>

      {/* Counter row — small status dots reflecting check tally */}
      <div
        className="flex items-center flex-wrap"
        style={{
          marginTop: "var(--space-16)",
          gap: "var(--space-16)",
        }}
      >
        <CounterDot tier="green" count={verdict.metrics.pass} label="passed" />
        <CounterDot tier="info"  count={verdict.metrics.info} label="noted" />
        <CounterDot tier="amber" count={verdict.metrics.warn} label="warned" />
        <CounterDot tier="red"   count={verdict.metrics.fail} label="failed" />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-4)",
            fontFamily: "var(--font-family-mono)",
            fontSize: "var(--font-size-cap-2)",
            textTransform: "uppercase",
            letterSpacing: "var(--letter-spacing-eyebrow)",
            color: "var(--color-text-secondary)",
            padding: 0,
          }}
        >
          {expanded ? (
            <>Hide checks <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>Show all {verdict.checks.length} checks <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      </div>

      {/* Detailed checks — sorted by severity, fail first */}
      {expanded && (
        <div
          style={{
            marginTop: "var(--space-16)",
            paddingTop: "var(--space-16)",
            borderTop: "1px solid var(--color-stroke-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-12)",
          }}
        >
          {(["fail", "warn", "info", "pass"] as CheckSeverity[]).map((sev) =>
            verdict.checks
              .filter((c) => c.severity === sev)
              .map((check) => <CheckRow key={check.id + check.category} check={check} />)
          )}
        </div>
      )}
    </Surface>
  );
}

// ----- Sub-components -----

function ConfidenceMeter({ value }: { value: number }) {
  // Map to FIRST AI status palette — these are warm-tuned, not bright Tailwind.
  const dotColor =
    value >= 80 ? "var(--color-status-green)"
    : value >= 60 ? "var(--color-status-info)"
    : value >= 40 ? "var(--color-status-amber)"
    : "var(--color-status-red)";

  return (
    <div className="inline-flex items-center" style={{ gap: "var(--space-8)" }} title={`Confidence: ${value}%`}>
      <span
        style={{
          fontFamily: "var(--font-family-mono)",
          fontSize: "var(--font-size-body-2)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}%
      </span>
      <div
        style={{
          width: 56,
          height: 4,
          borderRadius: "var(--radius-pill)",
          background: "var(--color-stroke-subtle)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${value}%`,
            background: dotColor,
            transition: "width var(--duration-normal) var(--curve-easy-ease)",
          }}
        />
      </div>
    </div>
  );
}

function CounterDot({ tier, count, label }: { tier: CheckSeverity | "info" | "amber" | "red" | "green"; count: number; label: string }) {
  if (count === 0) return null;
  const tierStyle = severityTier(tier as CheckSeverity);
  return (
    <span className={`first-status ${tierStyle}`}>
      {count} {label}
    </span>
  );
}

function CheckRow({ check }: { check: VerdictCheck }) {
  const tier = severityTier(check.severity);
  return (
    <div className="flex items-start" style={{ gap: "var(--space-12)" }}>
      <span
        aria-hidden
        style={{
          marginTop: 6,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: severityDotColor(check.severity),
          flexShrink: 0,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center" style={{ gap: "var(--space-8)" }}>
          <span
            style={{
              fontFamily: "var(--font-family-sans)",
              fontSize: "var(--font-size-body-2)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text-primary)",
            }}
          >
            {check.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-family-mono)",
              fontSize: "var(--font-size-cap-2)",
              textTransform: "uppercase",
              letterSpacing: "var(--letter-spacing-eyebrow)",
              color: "var(--color-text-tertiary)",
            }}
          >
            · {check.category}
          </span>
        </div>
        <p
          style={{
            margin: "var(--space-4) 0 0",
            fontFamily: "var(--font-family-sans)",
            fontSize: "var(--font-size-body-2)",
            color: "var(--color-text-secondary)",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          {check.detail}
        </p>
      </div>
      {/* Suppress unused-tier warning */}
      <span hidden>{tier}</span>
    </div>
  );
}

// ----- helpers -----

function recommendationLabel(reco: VerdictRecommendation): string {
  switch (reco) {
    case "approve_recommended":      return "Approval recommended";
    case "approve_with_review":      return "Approve after brief review";
    case "manual_review_required":   return "Manual review required";
    case "reject_recommended":       return "Rejection recommended";
  }
}

function severityTier(s: CheckSeverity): "green" | "amber" | "red" | "info" {
  switch (s) {
    case "pass": return "green";
    case "info": return "info";
    case "warn": return "amber";
    case "fail": return "red";
  }
}

function severityDotColor(s: CheckSeverity): string {
  switch (s) {
    case "pass": return "var(--color-status-green)";
    case "info": return "var(--color-status-info)";
    case "warn": return "var(--color-status-amber)";
    case "fail": return "var(--color-status-red)";
  }
}

/**
 * Compact one-line variant for queue rows.
 * Renders as a status dot pattern, never a banner.
 */
export function VerdictBadge({ verdict }: { verdict: AiVerdict | null | undefined }) {
  if (!verdict) {
    return (
      <span
        style={{
          fontFamily: "var(--font-family-mono)",
          fontSize: "var(--font-size-cap-2)",
          textTransform: "uppercase",
          letterSpacing: "var(--letter-spacing-eyebrow)",
          color: "var(--color-text-tertiary)",
        }}
      >
        —
      </span>
    );
  }
  const tier =
    verdict.recommendation === "approve_recommended" ? "green"
    : verdict.recommendation === "approve_with_review" ? "info"
    : verdict.recommendation === "manual_review_required" ? "amber"
    : "red";
  const short =
    verdict.recommendation === "approve_recommended" ? "Approve"
    : verdict.recommendation === "approve_with_review" ? "Review"
    : verdict.recommendation === "manual_review_required" ? "Review"
    : "Reject";
  return (
    <span className={`first-status ${tier}`} title={verdict.summary}>
      {short} · {verdict.confidence}%
    </span>
  );
}
