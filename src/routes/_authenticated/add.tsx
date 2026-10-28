import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePick } from "@/components/ledger-ui";
import { CATEGORIES, errorMessage, profilesQuery, uploadProof } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/add")({
  head: () => ({ meta: [{ title: "Add transaction — Hisaab" }, { name: "description", content: "Record an expense or loan." }] }),
  component: AddPage,
});

function AddPage() {
  const { profile } = Route.useRouteContext();
  const { data: profiles = [] } = useQuery(profilesQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reqId = useRef(crypto.randomUUID());
  const [paidBy, setPaidBy] = useState(profile.id);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("other");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const other = profiles.find((p) => p.id !== paidBy);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0) || Math.round(amt * 100) !== amt * 100) return toast.error("Enter a valid amount");
    if (!desc.trim()) return toast.error("Add a description");
    if (!other) return toast.error("Other friend not found");
    setBusy(true);
    try {
      const proof = file ? await uploadProof(profile.id, file) : null;
      const { error } = await supabase.rpc("create_transaction", {
        _paid_by: paidBy, _owed_by: other.id, _amount: amt, _txn_date: date, _description: desc.slice(0, 500),
        _category: cat, _client_request_id: reqId.current,
        _proof_path: proof?.path, _proof_name: proof?.name, _proof_mime: proof?.mime,
      });
      if (error) throw error;
      toast.success("Transaction recorded");
      qc.invalidateQueries({ queryKey: ["ledger"] });
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-6 shadow-card">
      <h1 className="text-2xl font-semibold">Add expense or loan</h1>
      <div className="space-y-2">
        <Label>Paid by</Label>
        <select className="h-10 w-full rounded-md border bg-background px-3" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <p className="text-sm text-muted-foreground">Owed by: <b>{other?.display_name ?? "—"}</b></p>
      </div>
      <div className="space-y-2"><Label htmlFor="amt">Amount (PKR)</Label><Input id="amt" inputMode="decimal" type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="d">Date</Label><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="desc">Description</Label><Input id="desc" maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Category</Label>
        <select className="h-10 w-full rounded-md border bg-background px-3" value={cat} onChange={(e) => setCat(e.target.value)}>
          {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor="f">Receipt (optional)</Label><FilePick id="f" file={file} onChange={setFile} /></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Submit"}</Button>
    </form>
  );
}
