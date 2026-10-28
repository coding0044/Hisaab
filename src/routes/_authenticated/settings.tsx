import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Hisaab" }, { name: "description", content: "Change your password." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast.error("New password must be at least 8 characters");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: current } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password changed");
    setCurrent(""); setPw("");
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-card">
      <h1 className="text-2xl font-semibold">Change password</h1>
      <div className="space-y-2"><Label htmlFor="c">Current password</Label><Input id="c" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="n">New password</Label><Input id="n" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
    </form>
  );
}
