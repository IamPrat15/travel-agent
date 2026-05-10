/**
 * FIRST AI design system primitives.
 *
 * These mirror the API shape of FirstAI/src/shared/design-system/* so a
 * future port into the FirstAI app is mostly a swap of import paths.
 *
 * Conventions:
 *   - All components consume tokens (no raw hex)
 *   - No emoji, no decorative chrome
 *   - The Whisper headline is the daily-screen default; Declaration is
 *     reserved for milestone-only moments (we don't use it in this app —
 *     this is a workflow tool, not a recognition page).
 */

import type { ReactNode, HTMLAttributes, ElementType, CSSProperties } from "react";
import { cn } from "@/lib/utils";

/* ---------- PeriodDot ---------- */

export function PeriodDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("dot", className)}
      style={{
        color: "var(--color-text-period-dot)",
        fontStyle: "normal",
        fontWeight: 400,
        marginLeft: "0.05em",
      }}
      aria-hidden
    >
      .
    </span>
  );
}

/* ---------- Headline ---------- */

interface HeadlineProps {
  gesture?: "whisper" | "declaration";
  children: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
  size?: "sm" | "md" | "lg";
}

export function Headline({
  gesture = "whisper",
  children,
  subtitle,
  className,
  as: Tag = "h1",
  size = "md",
}: HeadlineProps) {
  const baseClass = gesture === "whisper" ? "first-whisper" : "first-declaration";
  const fontSize =
    gesture === "whisper"
      ? size === "sm" ? "var(--font-size-title-3)" : size === "lg" ? "var(--font-size-display-2)" : "var(--font-size-title-1)"
      : size === "sm" ? "var(--font-size-title-1)" : size === "lg" ? "var(--font-size-display-1)" : "var(--font-size-display-2)";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Tag
        className={cn(baseClass, "m-0")}
        style={{ fontSize }}
      >
        {children}
        <PeriodDot />
      </Tag>
      {subtitle ? (
        <p
          className="m-0"
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-body-1)",
            lineHeight: "var(--line-height-relaxed)",
            fontFamily:
              gesture === "whisper" ? "var(--font-family-serif)" : "var(--font-family-sans)",
            fontStyle: gesture === "whisper" ? "italic" : "normal",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- Eyebrow ---------- */

interface EyebrowProps {
  children: ReactNode;
  brand?: boolean;
  className?: string;
}

export function Eyebrow({ children, brand, className }: EyebrowProps) {
  return (
    <span
      className={cn("first-eyebrow", className)}
      style={brand ? { color: "var(--color-brand-fg-warmer)" } : undefined}
    >
      {children}
    </span>
  );
}

/* ---------- Surface ---------- */

type SurfaceTone = "surface-1" | "surface-2" | "elevated";
type SurfaceRadius = "lg" | "xl" | "2xl" | "3xl" | "4xl";

interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  padded?: boolean | "tight" | "comfortable" | "roomy";
  children?: ReactNode;
}

const TONE_VAR: Record<SurfaceTone, string> = {
  "surface-1": "var(--color-surface-1)",
  "surface-2": "var(--color-surface-2)",
  elevated: "var(--color-surface-elevated)",
};

const RADIUS_VAR: Record<SurfaceRadius, string> = {
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  "3xl": "var(--radius-3xl)",
  "4xl": "var(--radius-4xl)",
};

export function Surface({
  as,
  tone = "surface-1",
  radius = "3xl",
  padded = true,
  className,
  style,
  children,
  ...rest
}: SurfaceProps) {
  const Tag = (as ?? "div") as ElementType;
  const padValue =
    padded === true ? "var(--space-32)"
    : padded === "tight" ? "var(--space-16)"
    : padded === "comfortable" ? "var(--space-24)"
    : padded === "roomy" ? "var(--space-40)"
    : 0;

  const merged: CSSProperties = {
    backgroundColor: TONE_VAR[tone],
    borderRadius: RADIUS_VAR[radius],
    boxShadow: "var(--shadow-2)",
    padding: padded ? padValue : 0,
    ...style,
  };
  return (
    <Tag className={cn(className)} style={merged} {...rest}>
      {children}
    </Tag>
  );
}

/* ---------- Status ---------- */

type StatusTier = "green" | "amber" | "red" | "info";

export function Status({ tier, children }: { tier: StatusTier; children: ReactNode }) {
  return <span className={`first-status ${tier}`}>{children}</span>;
}

/* ---------- Chip ---------- */

interface ChipProps {
  children: ReactNode;
  className?: string;
}

export function Chip({ children, className }: ChipProps) {
  return <span className={cn("first-chip", className)}>{children}</span>;
}

/* ---------- Brandmark — the F mark ---------- */

interface BrandmarkProps {
  size?: number;
  className?: string;
}

export function Brandmark({ size = 28, className }: BrandmarkProps) {
  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        background: "var(--color-brand-bg-rest)",
        color: "var(--color-brand-fg-on-bg)",
        borderRadius: 8,
        fontFamily: "var(--font-family-sans)",
        fontWeight: 800,
        fontSize: size * 0.5,
        letterSpacing: "-0.04em",
        lineHeight: 1,
      }}
      aria-label="FIRST AI"
    >
      F
    </span>
  );
}

/* ---------- GlassSurface — for sticky nav ---------- */

interface GlassProps extends HTMLAttributes<HTMLElement> {
  weight?: "thin" | "regular" | "thick";
  children?: ReactNode;
}

export function GlassSurface({ weight = "thin", style, className, children, ...rest }: GlassProps) {
  const merged: CSSProperties = {
    background:
      weight === "thin" ? "var(--glass-thin-bg)"
      : weight === "regular" ? "var(--glass-regular-bg)"
      : "var(--glass-thick-bg)",
    backdropFilter:
      weight === "thin" ? "var(--glass-thin-blur)"
      : weight === "regular" ? "var(--glass-regular-blur)"
      : "var(--glass-thick-blur)",
    WebkitBackdropFilter:
      weight === "thin" ? "var(--glass-thin-blur)"
      : weight === "regular" ? "var(--glass-regular-blur)"
      : "var(--glass-thick-blur)",
    border:
      weight === "thin" ? "var(--glass-thin-border)"
      : weight === "regular" ? "var(--glass-regular-border)"
      : "var(--glass-thick-border)",
    boxShadow: "var(--glass-specular)",
    borderRadius: "var(--radius-2xl)",
    ...style,
  };
  return (
    <div className={cn(className)} style={merged} {...rest}>
      {children}
    </div>
  );
}
