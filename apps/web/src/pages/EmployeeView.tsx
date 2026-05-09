import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getEmployees, parseTravel, submitTravel, type ParseResponse } from "@/lib/api";

const SAMPLES = [
  "I need to be in Pune Tuesday afternoon, back Wednesday evening for client Bajaj Finance",
  "Need to fly to Bengaluru Monday morning, back Tuesday evening for client Acme Capital",
  "Going to Mumbai Thursday morning, back Friday evening for client Tata Capital",
];

export default function EmployeeView() {
  const employeesQuery = useQuery({ queryKey: ["employees"], queryFn: getEmployees });
  const [employeeId, setEmployeeId] = useState("");
  const [text, setText] = useState(SAMPLES[0]);
  const [response, setResponse] = useState<ParseResponse | null>(null);

  // Address dialog state
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({ client_name: "", address: "", pincode: "" });

  useEffect(() => {
    if (!employeeId && employeesQuery.data && employeesQuery.data.length > 0) {
      setEmployeeId(employeesQuery.data[0].id);
    }
  }, [employeesQuery.data, employeeId]);

  const parseMutation = useMutation({
    mutationFn: parseTravel,
    onSuccess: (data) => {
      setResponse(data);
      if (data.status === "needs_client_address") {
        setAddressForm((f) => ({ ...f, client_name: data.intent.client_name ?? "" }));
        setAddressOpen(true);
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: submitTravel,
    onSuccess: (data) => { setResponse(data); setAddressOpen(false); },
  });

  function handleSubmit() {
    if (!employeeId || !text.trim()) return;
    setResponse(null);
    parseMutation.mutate({ employee_id: employeeId, text });
  }

  function handleSubmitAddress() {
    submitMutation.mutate({
      employee_id: employeeId,
      text,
      user_supplied_client: {
        client_name: addressForm.client_name,
        address: addressForm.address,
        pincode: addressForm.pincode,
      },
    });
  }

  const loading = parseMutation.isPending || submitMutation.isPending;
  const error = parseMutation.error || submitMutation.error;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New travel request</CardTitle>
          <CardDescription>
            Describe your trip in one line. The agent will parse it, apply policy, and route to finance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="employee">Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="employee" className="mt-1.5">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(employeesQuery.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.id} — {e.name} ({e.band}, {e.homeCity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Try a sample</Label>
              <Select onValueChange={(v) => setText(v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick a sample request..." />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLES.map((s, i) => (
                    <SelectItem key={i} value={s}>{s.slice(0, 60)}{s.length > 60 ? "..." : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="text">Travel request</Label>
            <Textarea
              id="text"
              className="mt-1.5"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g., I need to be in Pune Tuesday afternoon, back Wednesday evening for client Bajaj Finance"
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>) : "Submit"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-2 pt-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Request failed</p>
              <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {response?.status === "submitted_to_finance" && (
        <ResultCard response={response} />
      )}

      {/* Client address dialog */}
      <Dialog open={addressOpen} onOpenChange={setAddressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client address required</DialogTitle>
            <DialogDescription>
              {response?.status === "needs_client_address" ? response.message : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cn">Client name</Label>
              <Input id="cn" value={addressForm.client_name}
                onChange={(e) => setAddressForm({ ...addressForm, client_name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ca">Address</Label>
              <Input id="ca" value={addressForm.address}
                onChange={(e) => setAddressForm({ ...addressForm, address: e.target.value })}
                placeholder="Office address (street, building, etc.)" />
            </div>
            <div>
              <Label htmlFor="cpin">Pincode</Label>
              <Input id="cpin" inputMode="numeric" maxLength={6} value={addressForm.pincode}
                onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value.replace(/\D/g, "") })}
                placeholder="6-digit Indian pincode (e.g. 411014)" />
              <p className="mt-1 text-xs text-muted-foreground">
                We'll resolve city and coordinates automatically.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddressOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitAddress} disabled={submitMutation.isPending}>
              {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit with address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultCard({ response }: { response: Extract<ParseResponse, { status: "submitted_to_finance" }> }) {
  const r = response.payload;
  return (
    <Card className="border-green-200 bg-green-50/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <CardTitle>Submitted to finance</CardTitle>
          </div>
          <Badge variant="success">{r.status}</Badge>
        </div>
        <CardDescription>{response.next_step}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Field label="Trip request ID" value={r.id} mono />
          <Field label="Employee" value={`${r.employee?.name} (${r.employee?.band})`} />
          <Field label="Client" value={r.client?.name ?? "-"} />
          <Field label="Total est." value={`₹${r.estimatedTotalInr?.toLocaleString("en-IN")}`} />
        </div>

        {r.policy && (
          <div className="rounded-lg border bg-white p-4">
            <p className="mb-2 text-sm font-semibold">Policy decision</p>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Field label="Mode" value={<Badge variant="secondary">{r.policy.mode}</Badge>} />
              <Field label="Class" value={r.policy.travel_class} />
              <Field label="Hotel" value={`${r.policy.hotel_category}-star`} />
              <Field label="Distance" value={`${r.policy.distance_km} km`} />
            </div>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {r.policy.rationale.map((line, i) => <li key={i}>• {line}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {r.outbound && <SegmentCard title="Outbound" o={r.outbound} />}
          {r.inbound  && <SegmentCard title="Return"   o={r.inbound} />}
          {r.hotel && (
            <div className="rounded-lg border bg-white p-3 text-sm">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Hotel</p>
              <p className="mt-1 font-medium">{r.hotel.name}</p>
              <p className="text-xs text-muted-foreground">{r.hotel.address}</p>
              <p className="mt-2 text-sm">₹{r.hotel.nightly_rate_inr.toLocaleString("en-IN")}/night</p>
              <p className="text-xs text-muted-foreground">Total: ₹{r.hotel.total_inr.toLocaleString("en-IN")}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SegmentCard({ title, o }: { title: string; o: any }) {
  return (
    <div className="rounded-lg border bg-white p-3 text-sm">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      <p className="mt-1 font-medium">{o.provider}</p>
      <p className="text-xs text-muted-foreground">{o.travel_class}</p>
      <p className="mt-2 text-xs">Dep: {o.depart_dt}</p>
      <p className="text-xs">Arr: {o.arrive_dt}</p>
      <p className="mt-2 text-sm">₹{o.fare_inr.toLocaleString("en-IN")}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs" : "text-sm"}>{value}</p>
    </div>
  );
}
