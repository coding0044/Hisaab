import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Hisaab" },
      { name: "description", content: "Private sign-in for Faraz Ahmed and Mir Hassan." },
      { property: "og:title", content: "Sign in — Hisaab" },
      { property: "og:description", content: "Private sign-in for the shared ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const ALLOWED = ["faraz.maju@gmail.com", "mirhassan@gmail.com"];
const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(200),
});

function authErrorMessage(error: { message: string; name?: string }) {
  if (error.name === "AuthRetryableFetchError" || error.message.toLowerCase().includes("fetch")) {
    return "Unable to reach the sign-in service. Check your internet connection and try again.";
  }
  return error.message;
}

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError) throw sessionError;
        if (!sessionData.session) {
          setCheckingSession(false);
          return;
        }

        const { data, error: userError } = await supabase.auth.getUser();
        if (!active) return;
        if (userError) {
          setError(authErrorMessage(userError));
          setCheckingSession(false);
          return;
        }
        if (data.user) {
          await navigate({ to: "/dashboard", replace: true });
          return;
        }
        setCheckingSession(false);
      } catch (sessionError: unknown) {
        if (!active) return;
        setError(
          sessionError instanceof Error
            ? authErrorMessage(sessionError)
            : "Unable to check your sign-in status.",
        );
        setCheckingSession(false);
      }
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your details");
    if (!ALLOWED.includes(parsed.data.email))
      return setError("This ledger is private. Only Faraz and Mir can sign in.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Wrong email or password."
            : authErrorMessage(error),
        );
        return;
      }
      await navigate({ to: "/dashboard", replace: true });
    } catch (loginError: unknown) {
      setError(
        loginError instanceof Error
          ? authErrorMessage(loginError)
          : "Sign-in failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Checking your sign-in…
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-hero relative hidden flex-col justify-between p-12 text-navy-foreground lg:flex">
        <div className="font-display text-2xl font-bold">Hisaab</div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Every rupee between friends, clearly settled.
          </h1>
          <p className="mt-4 max-w-md text-navy-foreground/75">
            Record who paid, return money in cash or by transfer, and confirm it — nothing counts as
            paid until the other person says so.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-navy-foreground/70">
          <ShieldCheck className="h-4 w-4" /> Private to Faraz Ahmed & Mir Hassan
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6" noValidate>
          <div>
            <div className="mb-6 font-display text-2xl font-bold lg:hidden">Hisaab</div>
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the email and password set up for you.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}{" "}
            Sign in
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            There is no public sign-up. Accounts are limited to the two friends.
          </p>
        </form>
      </div>
    </div>
  );
}
