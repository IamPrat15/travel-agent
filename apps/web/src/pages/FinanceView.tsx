import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plane, Train, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  approveTripRequest, rejectTripRequest, markBooked, getFinanceQueue,
  getTripRequest, regenerateVerdict, type TripRequest,
} from "@/lib/api";
import { VerdictCard, VerdictBadge } from "@/components/VerdictCard";
import { RouteMap } from "@/components/RouteMap";
import { Surface, Eyebrow, Headline, Status, Chip, PeriodDot } from "@/components/first";

const APPROVER = "finance.team@bank.example";

function todayInIst(): string {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return formatter.format(new Date());
}

export default function FinanceView() {
  const [statusFilter, setStatusFilter] = useState("pending_finance_approval");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: ["queue", statusFilter],
    queryFn: () => getFinanceQueue(statusFilter),
  });

  const pendingCount = queueQuery.data?.length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-32)" }}>
      {/* Eyebrow + Whisper headline */}
      <div>
        <Eyebrow>{`${todayInIst()} · Finance review`}</Eyebrow>
        <div style={{ marginTop: "var(--space-12)" }}>
          <Headline
            gesture="whisper"
            as="h1"
            subtitle={
              statusFilter === "pending_finance_approval"
                ? `${pendingCount} ${pendingCount === 1 ? "request" : "requests"} awaiting your review.`
                : `Browsing requests with status "${statusFilter}".`
            }
          >
            {pendingCount > 0
              ? `Trips ready for your sign-off`
              : `Inbox, already triaged`}
          </Headline>
        </div>
      </div>

      <Surface tone="surface-1" radius="3xl" padded>
        <div className="flex items-center justify-between flex-wrap" style={{ gap: "var(--space-16)", marginBottom: "var(--space-20)" }}>
          <Eyebrow>Queue</Eyebrow>
          <div className="flex items-center" style={{ gap: "var(--space-8)" }}>
            <Label htmlFor="status" style={labelStyle}>Filter</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="status" style={{ width: 240 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_finance_approval">Pending approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {queueQuery.isLoading && (
          <div style={{ padding: "var(--space-32)", textAlign: "center", color: "var(--color-text-tertiary)" }}>
            <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          </div>
        )}

        {queueQuery.data && queueQuery.data.length === 0 && (
          <p style={{ padding: "var(--space-32)", textAlign: "center", color: "var(--color-text-tertiary)", fontStyle: "italic", fontFamily: "var(--font-family-serif)" }}>
            Nothing to review<PeriodDot />
          </p>
        )}

        {queueQuery.data && queueQuery.data.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-family-sans)", fontSize: "var(--font-size-body-2)" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-stroke-subtle)" }}>
                  <Th>Created</Th>
                  <Th>Employee</Th>
                  <Th>Client</Th>
                  <Th>Mode</Th>
                  <Th right>Total</Th>
                  <Th>AI Verdict</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {queueQuery.data.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--color-stroke-subtle)" }}
                  >
                    <Td muted>
                      {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </Td>
                    <Td>
                      <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-primary)" }}>{r.employee?.name}</div>
                      <div style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-2)", color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-eyebrow)" }}>
                        {r.employee?.band} · {r.employee?.homeCity}
                      </div>
                    </Td>
                    <Td>{r.client?.name ?? <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}</Td>
                    <Td>{r.policy?.mode ? <ModeChip mode={r.policy.mode} /> : "—"}</Td>
                    <Td right>
                      <span style={{ fontWeight: "var(--font-weight-semibold)", fontVariantNumeric: "tabular-nums" }}>
                        {r.estimatedTotalInr ? `₹${r.estimatedTotalInr.toLocaleString("en-IN")}` : "—"}
                      </span>
                    </Td>
                    <Td><VerdictBadge verdict={r.verdict} /></Td>
                    <Td><StatusDot status={r.status} /></Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedId(r.id)}
                        style={{ borderRadius: "var(--radius-pill)", fontWeight: "var(--font-weight-semibold)" }}
                      >
                        View
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {selectedId && (
        <DetailDialog id={selectedId} onClose={() => setSelectedId(null)} approver={APPROVER} />
      )}
    </div>
  );
}

// ----- helpers and small parts --------------------------------------------

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-family-mono)",
  fontSize: "var(--font-size-cap-2)",
  textTransform: "uppercase",
  letterSpacing: "var(--letter-spacing-eyebrow)",
  color: "var(--color-text-tertiary)",
  fontWeight: "var(--font-weight-medium)",
  margin: 0,
};

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      style={{
        padding: "var(--space-12) var(--space-16)",
        textAlign: right ? "right" : "left",
        fontFamily: "var(--font-family-mono)",
        fontSize: "var(--font-size-cap-2)",
        textTransform: "uppercase",
        letterSpacing: "var(--letter-spacing-eyebrow)",
        color: "var(--color-text-tertiary)",
        fontWeight: "var(--font-weight-medium)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children?: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td
      style={{
        padding: "var(--space-12) var(--space-16)",
        textAlign: right ? "right" : "left",
        verticalAlign: "top",
        color: muted ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
        fontSize: muted ? "var(--font-size-cap-1)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

function ModeChip({ mode }: { mode: string }) {
  const Icon = mode === "flight" ? Plane : mode === "train" ? Train : Car;
  return (
    <span className="first-chip">
      <Icon className="h-3 w-3" style={{ marginRight: -2 }} />
      {mode}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  switch (status) {
    case "pending_finance_approval": return <Status tier="amber">Pending</Status>;
    case "approved":                 return <Status tier="green">Approved</Status>;
    case "booked":                   return <Status tier="green">Booked</Status>;
    case "rejected":                 return <Status tier="red">Rejected</Status>;
    case "needs_client_address":    return <Status tier="info">Needs address</Status>;
    default:                         return <Status tier="info">{status}</Status>;
  }
}

// ----- DetailDialog -------------------------------------------------------

function DetailDialog({ id, onClose, approver }: { id: string; onClose: () => void; approver: string }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const detailQuery = useQuery({ queryKey: ["trip", id], queryFn: () => getTripRequest(id) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["queue"] });
    qc.invalidateQueries({ queryKey: ["trip", id] });
  };

  const approve = useMutation({
    mutationFn: () => approveTripRequest(id, approver, note || undefined),
    onSuccess: () => { refresh(); setNote(""); },
  });
  const reject = useMutation({
    mutationFn: () => rejectTripRequest(id, approver, note || undefined),
    onSuccess: () => { refresh(); setNote(""); },
  });
  const book = useMutation({
    mutationFn: () => markBooked(id, approver, note || undefined),
    onSuccess: () => { refresh(); setNote(""); },
  });
  const regenMutation = useMutation({
    mutationFn: () => regenerateVerdict(id),
    onSuccess: () => { refresh(); },
  });

  const r = detailQuery.data;
  const acting = approve.isPending || reject.isPending || book.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        style={{
          background: "var(--color-surface-1)",
          borderRadius: "var(--radius-3xl)",
          border: "none",
          boxShadow: "var(--shadow-5)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-family-serif)", fontStyle: "italic", fontWeight: 400, fontSize: "var(--font-size-title-2)", color: "var(--color-text-primary)", letterSpacing: "var(--letter-spacing-title)" }}>
            Trip request<PeriodDot />
          </DialogTitle>
          <DialogDescription style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-2)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-eyebrow)", color: "var(--color-text-tertiary)" }}>
            {id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}

        {r && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-20)" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "var(--space-16)",
              }}
            >
              <Inline label="Status"><StatusDot status={r.status} /></Inline>
              <Inline label="Employee">{`${r.employee?.name ?? "—"} · ${r.employee?.band ?? ""}`}</Inline>
              <Inline label="Client">{r.client?.name ?? "—"}</Inline>
              <Inline label="Total">
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "var(--font-weight-semibold)" }}>
                  ₹{r.estimatedTotalInr?.toLocaleString("en-IN") ?? "—"}
                </span>
              </Inline>
            </div>

            {/* AI Verdict — most-read element for finance reviewer */}
            {r.verdict && (
              <VerdictCard
                verdict={r.verdict}
                onRegenerate={() => regenMutation.mutate()}
                regenerating={regenMutation.isPending}
              />
            )}
            {!r.verdict && (
              <Surface tone="surface-2" radius="lg" padded="tight">
                <div className="flex items-center justify-between" style={{ gap: "var(--space-12)" }}>
                  <div className="flex items-center" style={{ gap: "var(--space-8)" }}>
                    <Status tier="info">No verdict yet</Status>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => regenMutation.mutate()}
                    disabled={regenMutation.isPending}
                    style={{ borderRadius: "var(--radius-pill)" }}
                  >
                    {regenMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Generate"}
                  </Button>
                </div>
              </Surface>
            )}

            {/* Original request */}
            <Surface tone="surface-2" radius="lg" padded="tight">
              <Eyebrow>Original request</Eyebrow>
              <p
                style={{
                  margin: "var(--space-8) 0 0",
                  fontFamily: "var(--font-family-serif)",
                  fontStyle: "italic",
                  fontSize: "var(--font-size-body-1)",
                  color: "var(--color-text-primary)",
                  lineHeight: "var(--line-height-relaxed)",
                }}
              >
                "{r.rawText}"
              </p>
            </Surface>

            {r.policy && (
              <Section title="Policy rationale">
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                  {r.policy.rationale.map((line, i) => (
                    <li
                      key={i}
                      style={{
                        fontFamily: "var(--font-family-sans)",
                        fontSize: "var(--font-size-body-2)",
                        color: "var(--color-text-secondary)",
                        paddingLeft: "var(--space-16)",
                        position: "relative",
                      }}
                    >
                      <span aria-hidden style={{ position: "absolute", left: 0, color: "var(--color-text-tertiary)" }}>—</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Route map + cab fare breakdown */}
            {r.policy && (r.policy.route || r.policy.cab_fare_breakdown) && (
              <RouteMap
                route={r.policy.route}
                cabFare={r.policy.cab_fare_breakdown}
                originLabel={r.employee?.homeCity}
                destinationLabel={r.client?.city}
              />
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "var(--space-12)",
              }}
            >
              {r.outbound && (
                <Section title="Outbound">
                  <SegmentDetail o={r.outbound} />
                </Section>
              )}
              {r.inbound && (
                <Section title="Return">
                  <SegmentDetail o={r.inbound} />
                </Section>
              )}
              {r.hotel && (
                <Section title="Hotel">
                  <HotelDetail h={r.hotel} />
                </Section>
              )}
            </div>

            {r.auditLogs && r.auditLogs.length > 0 && (
              <Section title="Audit log">
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
                  {r.auditLogs.map((a) => (
                    <div key={a.id} className="flex" style={{ gap: "var(--space-8)", fontSize: "var(--font-size-cap-1)" }}>
                      <span style={{ fontFamily: "var(--font-family-mono)", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {new Date(a.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span style={{ fontFamily: "var(--font-family-mono)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-eyebrow)", color: "var(--color-text-secondary)" }}>
                        {a.event}
                      </span>
                      <span style={{ color: "var(--color-text-tertiary)" }}>· {a.actor}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Action area */}
            {r.status === "pending_finance_approval" && (
              <Surface tone="surface-2" radius="lg" padded="comfortable">
                <Label htmlFor="note" style={labelStyle}>Note (optional)</Label>
                <Input
                  id="note"
                  className="mt-2"
                  placeholder="Reason / context for the decision"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ borderRadius: "var(--radius-lg)" }}
                />
              </Surface>
            )}
          </div>
        )}

        <DialogFooter style={{ gap: "var(--space-8)" }}>
          {r?.status === "pending_finance_approval" && (
            <>
              <Button
                variant="outline"
                onClick={() => reject.mutate()}
                disabled={acting}
                style={{ borderRadius: "var(--radius-pill)", fontWeight: "var(--font-weight-semibold)" }}
              >
                {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
              </Button>
              <Button
                onClick={() => approve.mutate()}
                disabled={acting}
                style={{
                  background: "var(--color-text-primary)",
                  color: "var(--color-text-on-brand)",
                  borderRadius: "var(--radius-pill)",
                  fontWeight: "var(--font-weight-semibold)",
                  border: "none",
                }}
              >
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
              </Button>
            </>
          )}
          {r?.status === "approved" && (
            <Button
              onClick={() => book.mutate()}
              disabled={acting}
              style={{
                background: "var(--color-brand-bg-rest)",
                color: "var(--color-brand-fg-on-bg)",
                borderRadius: "var(--radius-pill)",
                fontWeight: "var(--font-weight-semibold)",
                border: "none",
              }}
            >
              {book.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark booked"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Section + small bits -----------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Surface tone="surface-2" radius="lg" padded="tight">
      <Eyebrow>{title}</Eyebrow>
      <div style={{ marginTop: "var(--space-8)" }}>{children}</div>
    </Surface>
  );
}

function Inline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: "var(--space-4)",
          fontSize: "var(--font-size-body-1)",
          color: "var(--color-text-primary)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SegmentDetail({ o }: { o: NonNullable<TripRequest["outbound"]> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <p style={{ margin: 0, fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-primary)" }}>{o.provider}</p>
      <p style={{ margin: 0, fontSize: "var(--font-size-cap-1)", color: "var(--color-text-secondary)" }}>{o.travel_class}</p>
      <p style={{ margin: 0, fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-1)", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        Dep {o.depart_dt}
      </p>
      <p style={{ margin: 0, fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-1)", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        Arr {o.arrive_dt}
      </p>
      {o.duration_min && (
        <p style={{ margin: 0, fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-1)", color: "var(--color-text-tertiary)" }}>
          {Math.floor(o.duration_min / 60)}h {String(o.duration_min % 60).padStart(2, "0")}m
        </p>
      )}
      <p style={{ margin: "var(--space-6) 0 0", fontWeight: "var(--font-weight-bold)", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
        ₹{o.fare_inr.toLocaleString("en-IN")}
      </p>
    </div>
  );
}

function HotelDetail({ h }: { h: NonNullable<TripRequest["hotel"]> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {h.photo_urls && h.photo_urls[0] && (
        <img
          src={h.photo_urls[0]}
          alt={h.name}
          loading="lazy"
          style={{
            aspectRatio: "3 / 2",
            width: "100%",
            objectFit: "cover",
            borderRadius: "var(--radius-md)",
            background: "var(--color-surface-2)",
            marginBottom: "var(--space-6)",
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
      <p style={{ margin: 0, fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-primary)" }}>{h.name}</p>
      <p style={{ margin: 0, fontSize: "var(--font-size-cap-1)", color: "var(--color-text-secondary)" }}>{h.address}</p>
      {h.guest_rating !== undefined && (
        <p style={{ margin: 0, fontSize: "var(--font-size-cap-1)" }}>
          <span style={{ fontFamily: "var(--font-family-mono)", color: "var(--color-status-green)", fontWeight: "var(--font-weight-semibold)" }}>{h.guest_rating.toFixed(1)}</span>
          {h.reviews_count !== undefined && (
            <span style={{ marginLeft: "var(--space-6)", color: "var(--color-text-tertiary)" }}>· {h.reviews_count.toLocaleString("en-IN")} reviews</span>
          )}
        </p>
      )}
      <p style={{ margin: "var(--space-4) 0 0", fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-1)", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        ₹{h.nightly_rate_inr.toLocaleString("en-IN")} / night
      </p>
      <p style={{ margin: 0, fontWeight: "var(--font-weight-bold)", color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
        Total ₹{h.total_inr.toLocaleString("en-IN")}
      </p>
    </div>
  );
}
