import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, Clock, Plane, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  approveTripRequest, rejectTripRequest, markBooked, getFinanceQueue,
  getTripRequest, type TripRequest,
} from "@/lib/api";

const APPROVER = "finance.team@bank.example";

export default function FinanceView() {
  const [statusFilter, setStatusFilter] = useState("pending_finance_approval");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: ["queue", statusFilter],
    queryFn: () => getFinanceQueue(statusFilter),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Finance queue</CardTitle>
              <CardDescription>Approve, reject, or mark trips as booked.</CardDescription>
            </div>
            <div className="w-56">
              <Label className="text-xs">Filter by status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending_finance_approval">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="needs_client_address">Needs address</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {queueQuery.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          {queueQuery.isError && <p className="text-sm text-destructive">Failed to load queue.</p>}
          {queueQuery.data && queueQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No requests in this status.</p>
          )}
          {queueQuery.data && queueQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Employee</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {queueQuery.data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.employee?.name}</div>
                        <div className="text-xs text-muted-foreground">{r.employee?.band} · {r.employee?.homeCity}</div>
                      </td>
                      <td className="px-3 py-2">{r.client?.name ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{r.policy?.mode ? <ModeIcon mode={r.policy.mode} /> : "—"}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.estimatedTotalInr ? `₹${r.estimatedTotalInr.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(r.id)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <DetailDialog id={selectedId} onClose={() => setSelectedId(null)} approver={APPROVER} />
      )}
    </div>
  );
}

function ModeIcon({ mode }: { mode: string }) {
  if (mode === "flight") return <span className="inline-flex items-center gap-1 text-xs"><Plane className="h-3 w-3" /> flight</span>;
  if (mode === "train")  return <span className="inline-flex items-center gap-1 text-xs"><Ship className="h-3 w-3" /> train</span>;
  return <span className="text-xs">{mode}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: any; label: string; icon: React.ReactNode }> = {
    pending_finance_approval: { variant: "warning", label: "Pending", icon: <Clock className="h-3 w-3" /> },
    approved: { variant: "success", label: "Approved", icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected: { variant: "destructive", label: "Rejected", icon: <XCircle className="h-3 w-3" /> },
    booked:   { variant: "default", label: "Booked", icon: <CheckCircle2 className="h-3 w-3" /> },
    needs_client_address: { variant: "outline", label: "Needs address", icon: <Clock className="h-3 w-3" /> },
  };
  const cfg = map[status] ?? { variant: "outline", label: status, icon: null };
  return <Badge variant={cfg.variant} className="gap-1">{cfg.icon} {cfg.label}</Badge>;
}

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

  const r = detailQuery.data;
  const acting = approve.isPending || reject.isPending || book.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Trip request detail</DialogTitle>
          <DialogDescription>{id}</DialogDescription>
        </DialogHeader>

        {detailQuery.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
        {r && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Inline label="Status"><StatusBadge status={r.status} /></Inline>
              <Inline label="Employee">{r.employee?.name} ({r.employee?.band})</Inline>
              <Inline label="Client">{r.client?.name ?? "—"}</Inline>
              <Inline label="Total">₹{r.estimatedTotalInr?.toLocaleString("en-IN") ?? "—"}</Inline>
            </div>

            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Original request</p>
              <p className="mt-1 italic">"{r.rawText}"</p>
            </div>

            {r.policy && (
              <Section title="Policy rationale">
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {r.policy.rationale.map((line, i) => <li key={i}>• {line}</li>)}
                </ul>
              </Section>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {r.outbound && (
                <Section title="Outbound">
                  <p className="font-medium">{r.outbound.provider}</p>
                  <p className="text-xs text-muted-foreground">{r.outbound.travel_class}</p>
                  <p className="text-xs">Dep: {r.outbound.depart_dt}</p>
                  <p className="text-xs">Arr: {r.outbound.arrive_dt}</p>
                  <p className="mt-1 font-medium">₹{r.outbound.fare_inr.toLocaleString("en-IN")}</p>
                </Section>
              )}
              {r.inbound && (
                <Section title="Return">
                  <p className="font-medium">{r.inbound.provider}</p>
                  <p className="text-xs text-muted-foreground">{r.inbound.travel_class}</p>
                  <p className="text-xs">Dep: {r.inbound.depart_dt}</p>
                  <p className="text-xs">Arr: {r.inbound.arrive_dt}</p>
                  <p className="mt-1 font-medium">₹{r.inbound.fare_inr.toLocaleString("en-IN")}</p>
                </Section>
              )}
              {r.hotel && (
                <Section title="Hotel">
                  <p className="font-medium">{r.hotel.name}</p>
                  <p className="text-xs text-muted-foreground">{r.hotel.address}</p>
                  <p className="mt-1 text-xs">₹{r.hotel.nightly_rate_inr.toLocaleString("en-IN")}/night</p>
                  <p className="font-medium">Total: ₹{r.hotel.total_inr.toLocaleString("en-IN")}</p>
                </Section>
              )}
            </div>

            {r.auditLogs && r.auditLogs.length > 0 && (
              <Section title="Audit log">
                <div className="space-y-1 text-xs">
                  {r.auditLogs.map((a) => (
                    <div key={a.id} className="flex gap-2">
                      <span className="text-muted-foreground">
                        {new Date(a.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{a.event}</Badge>
                      <span className="text-muted-foreground">{a.actor}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {(r.status === "pending_finance_approval" || r.status === "approved") && (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="note">Note (optional)</Label>
                <Input
                  id="note" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for approval/rejection or booking reference"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {r?.status === "pending_finance_approval" && (
            <>
              <Button variant="destructive" disabled={acting} onClick={() => reject.mutate()}>
                {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
              </Button>
              <Button disabled={acting} onClick={() => approve.mutate()}>
                {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
              </Button>
            </>
          )}
          {r?.status === "approved" && (
            <Button disabled={acting} onClick={() => book.mutate()}>
              {book.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark as booked"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Inline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs uppercase text-muted-foreground">{label}: </span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
