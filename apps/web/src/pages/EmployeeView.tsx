import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getEmployees, parseTravel, submitTravel,
  type ParseResponse, type TripOption, type HotelOption,
} from "@/lib/api";
import { VerdictCard } from "@/components/VerdictCard";
import { RouteMap } from "@/components/RouteMap";
import { Surface, Eyebrow, Headline, Status, Chip, PeriodDot } from "@/components/first";

const SAMPLES = [
  "I need to be in Pune Tuesday afternoon, back Wednesday evening for client Bajaj Finance",
  "Mumbai office, 10 AM Monday, day trip, meeting Persistent Systems",
  "Travel to Tata Capital tomorrow morning, return same day evening",
];

function todayInIst(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return formatter.format(now);
}

export default function EmployeeView() {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [text, setText] = useState<string>(SAMPLES[0]);
  const [response, setResponse] = useState<ParseResponse | null>(null);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees });

  useEffect(() => {
    if (!employeeId && employeesQuery.data && employeesQuery.data.length > 0) {
      setEmployeeId(employeesQuery.data[0].id);
    }
  }, [employeesQuery.data, employeeId]);

  const submitMutation = useMutation({
    mutationFn: submitTravel,
    onSuccess: (data) => {
      setResponse(data);
      setError(null);
      if (data.status === "needs_client_address") {
        setClientName(data.intent.client_name ?? "");
        setShowAddressDialog(true);
      }
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? err.message ?? "Submission failed");
    },
  });

  const resubmitWithClient = () => {
    submitMutation.mutate({
      employee_id: employeeId,
      text,
      user_supplied_client: { client_name: clientName, address, pincode },
    });
    setShowAddressDialog(false);
  };

  const onSubmit = () => {
    setResponse(null);
    setError(null);
    submitMutation.mutate({ employee_id: employeeId, text });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-32)" }}>
      {/* Eyebrow + Whisper headline */}
      <div>
        <Eyebrow>{`${todayInIst()} · Travel request`}</Eyebrow>
        <div style={{ marginTop: "var(--space-12)" }}>
          <Headline gesture="whisper" as="h1" subtitle="Describe the trip in one line. Policy is computed; finance approves.">
            Where do you need to be, and when
          </Headline>
        </div>
      </div>

      {/* The submit form */}
      <Surface tone="surface-1" radius="3xl" padded>
        <Eyebrow>New request</Eyebrow>

        <div style={{ marginTop: "var(--space-20)", display: "flex", flexDirection: "column", gap: "var(--space-16)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) 1fr", gap: "var(--space-16)", alignItems: "start" }} className="emp-grid">
            <div>
              <Label htmlFor="employee" style={labelStyle}>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="employee" className="mt-1.5">
                  <SelectValue placeholder="Choose employee" />
                </SelectTrigger>
                <SelectContent>
                  {employeesQuery.data?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} · {e.band}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="text" style={labelStyle}>Request</Label>
              <Textarea
                id="text"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. I need to be in Pune Tuesday afternoon, back Wednesday evening"
                className="mt-1.5"
                style={{
                  background: "var(--color-surface-2)",
                  borderColor: "var(--color-stroke-default)",
                  fontFamily: "var(--font-family-sans)",
                  fontSize: "var(--font-size-body-1)",
                  borderRadius: "var(--radius-lg)",
                }}
              />

              <div style={{ marginTop: "var(--space-12)", display: "flex", flexWrap: "wrap", gap: "var(--space-8)" }}>
                {SAMPLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setText(s)}
                    className="first-chip"
                    style={{ cursor: "pointer", border: "none" }}
                  >
                    {s.length > 56 ? s.slice(0, 53) + "…" : s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-12)", flexWrap: "wrap" }}>
            <Button
              onClick={onSubmit}
              disabled={!employeeId || !text.trim() || submitMutation.isPending}
              style={{
                background: "var(--color-text-primary)",
                color: "var(--color-text-on-brand)",
                borderRadius: "var(--radius-pill)",
                paddingInline: "var(--space-24)",
                height: "var(--btn-height-md)",
                fontWeight: "var(--font-weight-semibold)",
                border: "none",
              }}
            >
              {submitMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…</>
              ) : (
                "Submit to finance"
              )}
            </Button>
          </div>
        </div>
      </Surface>

      {/* Error */}
      {error && (
        <Surface tone="surface-1" radius="2xl" padded="comfortable">
          <div className="flex items-start" style={{ gap: "var(--space-12)" }}>
            <AlertCircle style={{ width: 18, height: 18, color: "var(--color-status-red)", marginTop: 2, flexShrink: 0 }} />
            <div>
              <Status tier="red">Submission failed</Status>
              <p style={{ marginTop: "var(--space-8)", marginBottom: 0, fontSize: "var(--font-size-body-2)", color: "var(--color-text-secondary)" }}>{error}</p>
            </div>
          </div>
        </Surface>
      )}

      {/* Result */}
      {response && response.status === "submitted_to_finance" && (
        <ResultCard response={response} />
      )}

      {/* Pincode dialog when client wasn't auto-resolved */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client not in directory</DialogTitle>
            <DialogDescription>
              Provide the client office address and pincode so we can compute distance and route.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-12)" }}>
            <div>
              <Label htmlFor="cn" style={labelStyle}>Client name</Label>
              <Input id="cn" value={clientName} onChange={(e) => setClientName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="addr" style={labelStyle}>Address</Label>
              <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="pin" style={labelStyle}>Pincode</Label>
              <Input
                id="pin" value={pincode} onChange={(e) => setPincode(e.target.value)}
                className="mt-1.5" maxLength={6} placeholder="6-digit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddressDialog(false)}>Cancel</Button>
            <Button onClick={resubmitWithClient} disabled={!clientName.trim() || !address.trim() || pincode.length !== 6}>
              Resolve and submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-family-mono)",
  fontSize: "var(--font-size-cap-2)",
  textTransform: "uppercase",
  letterSpacing: "var(--letter-spacing-eyebrow)",
  color: "var(--color-text-tertiary)",
  fontWeight: "var(--font-weight-medium)",
};

// ----- ResultCard ---------------------------------------------------------

function ResultCard({ response }: { response: Extract<ParseResponse, { status: "submitted_to_finance" }> }) {
  const r = response.payload;
  const verdict = response.verdict ?? r.verdict ?? null;
  const totalInr = r.estimatedTotalInr;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-24)" }}>
      {/* Success header — status dot, not banner */}
      <Surface tone="surface-1" radius="3xl" padded>
        <div className="flex items-start justify-between flex-wrap" style={{ gap: "var(--space-16)" }}>
          <div>
            <Status tier="green">Submitted to finance</Status>
            <h2
              className="first-whisper"
              style={{
                margin: "var(--space-12) 0 0",
                fontSize: "var(--font-size-title-2)",
              }}
            >
              {response.next_step.split(".")[0]}
              <PeriodDot />
            </h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <Eyebrow>Total estimate</Eyebrow>
            <p
              className="first-declaration"
              style={{
                margin: "var(--space-4) 0 0",
                fontSize: "var(--font-size-title-2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ₹{totalInr?.toLocaleString("en-IN") ?? "—"}
            </p>
          </div>
        </div>

        {/* Quick facts row */}
        <div
          style={{
            marginTop: "var(--space-24)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--space-16)",
          }}
        >
          <Fact label="Trip ID" value={<span style={{ fontFamily: "var(--font-family-mono)" }}>{r.id.slice(0, 8)}</span>} />
          <Fact label="Employee" value={`${r.employee?.name ?? "—"} · ${r.employee?.band ?? ""}`} />
          <Fact label="Client" value={r.client?.name ?? "—"} />
          <Fact label="Destination" value={r.client?.city ?? "—"} />
        </div>
      </Surface>

      {/* AI Verdict */}
      {verdict && <VerdictCard verdict={verdict} compact />}

      {/* Policy decision */}
      {r.policy && (
        <Surface tone="surface-1" radius="2xl" padded="comfortable">
          <Eyebrow>Policy decision</Eyebrow>
          <div
            style={{
              marginTop: "var(--space-12)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--space-16)",
            }}
          >
            <Fact label="Mode" value={<Chip>{r.policy.mode}</Chip>} />
            <Fact label="Class" value={r.policy.travel_class} />
            <Fact label="Hotel" value={`${r.policy.hotel_category}-star`} />
            <Fact label="Distance" value={`${r.policy.distance_km} km`} />
          </div>
          {r.policy.rationale.length > 0 && (
            <ul
              style={{
                marginTop: "var(--space-16)",
                marginBottom: 0,
                paddingLeft: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-6)",
              }}
            >
              {r.policy.rationale.map((line, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: "var(--font-family-sans)",
                    fontSize: "var(--font-size-body-2)",
                    color: "var(--color-text-secondary)",
                    fontStyle: "italic",
                    paddingLeft: "var(--space-16)",
                    position: "relative",
                  }}
                >
                  <span aria-hidden style={{ position: "absolute", left: 0, color: "var(--color-text-tertiary)" }}>—</span>
                  {line}
                </li>
              ))}
            </ul>
          )}
        </Surface>
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

      {/* Itinerary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--space-16)",
        }}
      >
        {r.outbound && <SegmentCard title="Outbound" o={r.outbound} />}
        {r.inbound  && <SegmentCard title="Return"   o={r.inbound} />}
        {r.hotel    && <HotelCard h={r.hotel} />}
      </div>

      {/* Demo data disclosure */}
      {(r.outbound?.data_source === "demo_stub" ||
        r.inbound?.data_source === "demo_stub" ||
        r.hotel?.data_source === "demo_stub") && (
        <Surface tone="surface-2" radius="lg" padded="tight">
          <p style={{ margin: 0, fontFamily: "var(--font-family-sans)", fontSize: "var(--font-size-cap-1)", color: "var(--color-text-tertiary)", lineHeight: "var(--line-height-relaxed)" }}>
            <span style={{ fontFamily: "var(--font-family-mono)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-eyebrow)", marginRight: "var(--space-8)" }}>
              Demo data
            </span>
            Flight, train and hotel options shown are illustrative. Production sources live inventory from licensed booking partners.
          </p>
        </Surface>
      )}
    </div>
  );
}

// ----- SegmentCard --------------------------------------------------------

function SegmentCard({ title, o }: { title: string; o: TripOption }) {
  const minutes = o.duration_min ?? 0;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const duration = minutes ? `${hours}h ${String(mins).padStart(2, "0")}m` : null;

  return (
    <Surface tone="surface-1" radius="2xl" padded="comfortable">
      <div className="flex items-center justify-between" style={{ gap: "var(--space-8)" }}>
        <Eyebrow>{title}</Eyebrow>
        <Chip>{o.mode}</Chip>
      </div>

      <p
        style={{
          margin: "var(--space-12) 0 0",
          fontFamily: "var(--font-family-sans)",
          fontSize: "var(--font-size-body-1)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text-primary)",
        }}
      >
        {o.provider}
      </p>
      <p style={{ margin: 0, fontSize: "var(--font-size-body-2)", color: "var(--color-text-secondary)" }}>
        {o.travel_class}
      </p>

      <div
        style={{
          marginTop: "var(--space-12)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
          fontFamily: "var(--font-family-mono)",
          fontSize: "var(--font-size-body-2)",
          color: "var(--color-text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ color: "var(--color-text-primary)", fontWeight: "var(--font-weight-semibold)" }}>{formatTime(o.depart_dt)}</span>
        <span aria-hidden>→</span>
        <span style={{ color: "var(--color-text-primary)", fontWeight: "var(--font-weight-semibold)" }}>{formatTime(o.arrive_dt)}</span>
        {duration && <span>· {duration}</span>}
      </div>

      <div className="flex items-baseline justify-between" style={{ marginTop: "var(--space-16)" }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-family-sans)",
            fontSize: "var(--font-size-sub-1)",
            fontWeight: "var(--font-weight-bold)",
            color: "var(--color-text-primary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          ₹{o.fare_inr.toLocaleString("en-IN")}
        </p>
        {o.refundable !== undefined && (
          <span style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-2)", textTransform: "uppercase", letterSpacing: "var(--letter-spacing-eyebrow)", color: "var(--color-text-tertiary)" }}>
            {o.refundable ? "Refundable" : "Non-refundable"}
          </span>
        )}
      </div>

      {o.baggage_kg && (
        <p style={{ marginTop: "var(--space-6)", marginBottom: 0, fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-2)", color: "var(--color-text-tertiary)" }}>
          Baggage {o.baggage_kg} kg incl.
        </p>
      )}
    </Surface>
  );
}

// ----- HotelCard ----------------------------------------------------------

function HotelCard({ h }: { h: HotelOption }) {
  const photo = h.photo_urls?.[0];
  return (
    <Surface tone="surface-1" radius="2xl" padded={false}>
      {photo && (
        <div style={{ position: "relative", borderRadius: "var(--radius-2xl) var(--radius-2xl) 0 0", overflow: "hidden" }}>
          <img
            src={photo}
            alt={h.name}
            loading="lazy"
            style={{
              width: "100%",
              aspectRatio: "3 / 2",
              objectFit: "cover",
              background: "var(--color-surface-2)",
              display: "block",
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div style={{ position: "absolute", top: "var(--space-12)", right: "var(--space-12)" }}>
            <Chip>★ {h.category_stars}</Chip>
          </div>
        </div>
      )}

      <div style={{ padding: "var(--space-16) var(--space-20)" }}>
        <Eyebrow>Hotel</Eyebrow>

        <p
          style={{
            margin: "var(--space-8) 0 0",
            fontFamily: "var(--font-family-sans)",
            fontSize: "var(--font-size-body-1)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text-primary)",
            lineHeight: "var(--line-height-snug)",
          }}
        >
          {h.name}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "var(--font-size-body-2)",
            color: "var(--color-text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {h.address}
        </p>

        {h.guest_rating !== undefined && (
          <div className="flex items-center" style={{ marginTop: "var(--space-8)", gap: "var(--space-8)" }}>
            <span
              style={{
                fontFamily: "var(--font-family-mono)",
                fontSize: "var(--font-size-cap-1)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-status-green)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {h.guest_rating.toFixed(1)}
            </span>
            {h.reviews_count !== undefined && (
              <span style={{ fontFamily: "var(--font-family-sans)", fontSize: "var(--font-size-cap-1)", color: "var(--color-text-tertiary)" }}>
                {h.reviews_count.toLocaleString("en-IN")} reviews
              </span>
            )}
          </div>
        )}

        {h.amenities && h.amenities.length > 0 && (
          <div style={{ marginTop: "var(--space-12)", display: "flex", flexWrap: "wrap", gap: "var(--space-6)" }}>
            {h.amenities.slice(0, 3).map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
            {h.amenities.length > 3 && (
              <span style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-2)", color: "var(--color-text-tertiary)", alignSelf: "center" }}>
                +{h.amenities.length - 3} more
              </span>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between" style={{ marginTop: "var(--space-16)" }}>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-family-sans)",
              fontSize: "var(--font-size-sub-1)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            ₹{h.nightly_rate_inr.toLocaleString("en-IN")}
            <span style={{ fontSize: "var(--font-size-body-2)", fontWeight: "var(--font-weight-regular)", color: "var(--color-text-tertiary)" }}>
              /night
            </span>
          </p>
          <span style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-cap-2)", color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            ₹{h.total_inr.toLocaleString("en-IN")} total
          </span>
        </div>

        <p
          style={{
            margin: "var(--space-8) 0 0",
            fontFamily: "var(--font-family-mono)",
            fontSize: "var(--font-size-cap-2)",
            color: "var(--color-text-tertiary)",
          }}
        >
          {h.distance_km_from_client.toFixed(1)} km from client
        </p>
      </div>
    </Surface>
  );
}

// ----- helpers ------------------------------------------------------------

function formatTime(dt: string): string {
  // dt comes as "YYYY-MM-DD HH:MM"
  const parts = dt.split(" ");
  return parts.length >= 2 ? parts[1] : dt;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: "var(--space-4)",
          fontFamily: "var(--font-family-sans)",
          fontSize: "var(--font-size-body-1)",
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
