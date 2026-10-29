import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizePakistaniWhatsAppNumber } from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hisaab" },
      { name: "description", content: "Change your password." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [phone, setPhone] = useState(profile.whatsapp_phone ?? "");
  const [whatsappOptIn, setWhatsappOptIn] = useState(Boolean(profile.whatsapp_opted_in_at));
  const [busy, setBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: pw,
      current_password: current,
    } as never);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password changed");
    setCurrent("");
    setPw("");
  }
  async function savePhone(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizePakistaniWhatsAppNumber(phone);
    if (!normalized) {
      toast.error("Enter a valid Pakistani WhatsApp number, such as 03332853138");
      return;
    }
    setPhoneBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        whatsapp_phone: normalized,
        whatsapp_opted_in_at: whatsappOptIn ? new Date().toISOString() : null,
      })
      .eq("id", profile.id);
    setPhoneBusy(false);
    if (error) {
      if (error.message.includes("whatsapp_opted_in_at")) {
        toast.error(
          "The WhatsApp database migration is not active yet. Apply drizzle/migrations/0001_whatsapp_notifications.sql, then reload the schema cache.",
        );
        return;
      }
      toast.error(error.message);
      return;
    }
    setPhone(normalized);
    await queryClient.invalidateQueries({ queryKey: ["profiles"] });
    toast.success("WhatsApp number updated");
  }
  return (
    <div className="mx-auto max-w-md space-y-6">
      <form onSubmit={savePhone} className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
        <h1 className="text-2xl font-semibold">WhatsApp contact</h1>
        <p className="text-sm text-muted-foreground">
          Used for debt reminders and repayment notifications. Enter a Pakistani mobile number.
        </p>
        <div className="space-y-2">
          <Label htmlFor="whatsapp-phone">WhatsApp number</Label>
          <Input
            id="whatsapp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="03332853138"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={whatsappOptIn}
            onChange={(e) => setWhatsappOptIn(e.target.checked)}
          />
          <span>
            I agree to receive repayment request notifications on WhatsApp at this number. I can
            withdraw this consent here at any time.
          </span>
        </label>
        <Button type="submit" disabled={phoneBusy}>
          {phoneBusy ? "Saving…" : "Save WhatsApp number"}
        </Button>
      </form>
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6 shadow-card">
        <h2 className="text-2xl font-semibold">Change password</h2>
        <div className="space-y-2">
          <Label htmlFor="c">Current password</Label>
          <Input
            id="c"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="n">New password</Label>
          <Input id="n" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
