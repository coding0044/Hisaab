import { Eye, EyeOff, Lock, Moon, Sun } from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Input, Label } from '../components/ui/input.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useTheme } from '../context/ThemeContext.tsx';
import { ArrowRight, ShieldCheck, TrendingUp } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password, rememberMe);
      toast.success(`Welcome back, ${user.full_name}`);
      navigate('/dashboard');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f8f6] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_12%_18%,rgba(16,185,129,.12),transparent_24%),radial-gradient(circle_at_88%_82%,rgba(14,116,144,.09),transparent_28%)]" />
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-[13px] bg-emerald-600 text-white flex items-center justify-center text-xl font-black shadow-lg shadow-emerald-600/20">H</div>
          <span className="font-display text-xl font-bold tracking-tight">Hisaab</span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-6 sm:py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-10 items-center">
          <div className="hidden lg:block pr-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-slate-900/70 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Private shared ledger · PKR
            </div>
            <h1 className="mt-7 max-w-xl text-5xl font-black leading-[1.08] tracking-tight text-slate-950 dark:text-white">
              Every rupee,<br />
              <span className="text-emerald-600">clearly accounted.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 dark:text-slate-400">
              A simple, transparent way for friends to manage lending, repayments, and balances.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 text-sm font-bold">Clear balances</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <p className="mt-3 text-sm font-bold">Member protected</p>
              </div>
            </div>
          </div>

          <div className="w-full">
            <Card className="mx-auto max-w-md overflow-hidden border-white/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,.12)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
              <CardContent className="p-6 sm:p-8 space-y-6">
                <div className="space-y-1">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 mb-2">
                    <Lock className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                    Member Sign In
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Access is restricted to the three registered member accounts.
                  </p>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm text-red-700 dark:text-red-300"
                  >
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="login-email">Email Address</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="faraz.maju@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        placeholder="Enter your password"
                        className="pr-11"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-600"
                      />
                      <span>Remember me for 30 days</span>
                    </label>
                  </div>

                  <Button type="submit" className="w-full h-11" disabled={submitting}>
                    {submitting ? 'Signing in...' : 'Sign In to Hisaab'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
