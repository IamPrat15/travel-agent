import { Surface, Eyebrow, Chip } from "./first";
import type { RouteMeta, CabFareBreakdown } from "@/lib/api";

interface RouteMapProps {
  route?: RouteMeta;
  cabFare?: CabFareBreakdown | null;
  originLabel?: string;
  destinationLabel?: string;
}

/**
 * Route map + cab fare breakdown.
 *
 * FIRST AI conventions:
 *   - Single Surface card, large radius, soft shadow
 *   - Eyebrow lines for section labels (Mono caps tracked)
 *   - Chip for cab class (with bullet-dot prefix)
 *   - Tabular figures on every amount + distance + duration
 *   - No bright shadcn badges; data source label is mono caps tertiary
 */
export function RouteMap({ route, cabFare, originLabel, destinationLabel }: RouteMapProps) {
  const hasMap = route?.static_map_url;
  const hasCab = cabFare !== undefined && cabFare !== null;
  if (!hasMap && !hasCab && !route) return null;

  return (
    <Surface tone="surface-1" radius="2xl" padded={false}>
      {/* Map preview, if Google Maps is configured */}
      {hasMap && route?.static_map_url ? (
        <div style={{ position: "relative", borderRadius: "var(--radius-2xl) var(--radius-2xl) 0 0", overflow: "hidden" }}>
          <img
            src={route.static_map_url}
            alt={`Route from ${originLabel ?? "origin"} to ${destinationLabel ?? "destination"}`}
            loading="lazy"
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              objectFit: "cover",
              background: "var(--color-surface-2)",
              display: "block",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "var(--space-12)",
              left: "var(--space-12)",
            }}
          >
            <Chip>Google Maps</Chip>
          </div>
        </div>
      ) : null}

      {/* Distance + duration row */}
      {route && (
        <div
          style={{
            padding: "var(--space-16) var(--space-24)",
            borderBottom: "1px solid var(--color-stroke-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-16)",
            flexWrap: "wrap",
          }}
        >
          <div className="flex items-center" style={{ gap: "var(--space-32)" }}>
            <Metric label="Distance" value={`${route.distance_km.toFixed(1)} km`} />
            {route.duration_min > 0 && (
              <Metric
                label="Drive time"
                value={`${Math.floor(route.duration_min / 60)}h ${String(route.duration_min % 60).padStart(2, "0")}m`}
              />
            )}
          </div>
          <span
            style={{
              fontFamily: "var(--font-family-mono)",
              fontSize: "var(--font-size-cap-2)",
              textTransform: "uppercase",
              letterSpacing: "var(--letter-spacing-eyebrow)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {route.data_source === "google_maps" ? "Real road route" : "Straight-line est."}
          </span>
        </div>
      )}

      {/* Cab fare breakdown */}
      {hasCab && cabFare && (
        <div style={{ padding: "var(--space-24)" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-12)" }}>
            <Eyebrow>Cab fare breakdown</Eyebrow>
            <Chip>{cabFare.cab_class}</Chip>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
            <FareRow
              label={`Base fare (${cabFare.distance_km} km × ₹${cabFare.rate_per_km_inr}/km × ${cabFare.legs} leg${cabFare.legs === 1 ? "" : "s"})`}
              amount={cabFare.base_fare_inr_total}
            />
            {cabFare.toll_estimate_inr_total > 0 && (
              <FareRow
                label={`Toll estimate (${cabFare.legs} leg${cabFare.legs === 1 ? "" : "s"})`}
                amount={cabFare.toll_estimate_inr_total}
              />
            )}

            <div
              style={{
                marginTop: "var(--space-8)",
                paddingTop: "var(--space-12)",
                borderTop: "1px solid var(--color-stroke-subtle)",
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-family-sans)",
                  fontSize: "var(--font-size-body-1)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-text-primary)",
                }}
              >
                Total
              </span>
              <span
                style={{
                  fontFamily: "var(--font-family-sans)",
                  fontSize: "var(--font-size-sub-1)",
                  fontWeight: "var(--font-weight-bold)",
                  color: "var(--color-text-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ₹{cabFare.total_inr.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          <p
            style={{
              marginTop: "var(--space-12)",
              marginBottom: 0,
              fontFamily: "var(--font-family-sans)",
              fontStyle: "italic",
              fontSize: "var(--font-size-cap-1)",
              color: "var(--color-text-tertiary)",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            Indicative fare based on corporate fleet tariff. Actual booking via
            Ola Corporate / Uber for Business handled by finance team.
          </p>
        </div>
      )}
    </Surface>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p
        style={{
          margin: "var(--space-4) 0 0",
          fontFamily: "var(--font-family-sans)",
          fontSize: "var(--font-size-sub-1)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function FareRow({ label, amount, hint }: { label: string; amount: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: "var(--space-12)" }}>
      <span
        style={{
          flex: 1,
          fontFamily: "var(--font-family-sans)",
          fontSize: "var(--font-size-body-2)",
          color: "var(--color-text-secondary)",
        }}
      >
        {label}
        {hint && (
          <span
            style={{
              marginLeft: "var(--space-8)",
              fontFamily: "var(--font-family-mono)",
              fontSize: "var(--font-size-cap-2)",
              textTransform: "uppercase",
              letterSpacing: "var(--letter-spacing-eyebrow)",
              color: "var(--color-text-tertiary)",
            }}
          >
            · {hint}
          </span>
        )}
      </span>
      <span
        style={{
          fontFamily: "var(--font-family-sans)",
          fontSize: "var(--font-size-body-1)",
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ₹{amount.toLocaleString("en-IN")}
      </span>
    </div>
  );
}
