import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    if (!profile) {
      // Signed in but not one of the two authorized friends.
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user, profile };
  },
  component: AppShell,
});
