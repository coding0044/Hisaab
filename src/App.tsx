import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/layout/AppShell.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { GiveMoneyPage } from './pages/GiveMoneyPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { MemberDetailPage } from './pages/MemberDetailPage.tsx';
import { MembersPage } from './pages/MembersPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ReceiveMoneyPage } from './pages/ReceiveMoneyPage.tsx';
import { RemindersPage } from './pages/RemindersPage.tsx';
import { RepaymentsPage } from './pages/RepaymentsPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TransactionsPage } from './pages/TransactionsPage.tsx';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

function PublicOnlyLoginRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <LoadingScreen />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-right" theme={theme} richColors closeButton />;
}

function LoadingScreen() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 100) return 100;
        const step = current < 70 ? 2 : 1;
        return Math.min(100, current + step);
      });
    }, 55);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f8f6] dark:bg-slate-950 flex items-center justify-center px-6">
      <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,rgba(16,185,129,.14),transparent_28%),radial-gradient(circle_at_80%_80%,rgba(14,116,144,.10),transparent_30%)]" />
      <div className="relative w-[290px] text-center" role="status" aria-label={`Loading ${progress}%`}>
        <div className="hisaab-loader mx-auto mb-7 h-20 w-20 rounded-[24px] bg-emerald-600 text-white flex items-center justify-center text-4xl font-black shadow-[0_18px_50px_rgba(5,150,105,.28)]">
          <span className="hisaab-loader-letter">H</span>
        </div>
        <p className="mb-5 text-[28px] font-bold tracking-tight text-slate-900 dark:text-slate-100">Hisaab</p>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          <span>Preparing your ledger</span>
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ThemedToaster />
          <Routes>
            <Route path="/login" element={<PublicOnlyLoginRoute />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/members"
              element={
                <ProtectedRoute>
                  <MembersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/members/:id"
              element={
                <ProtectedRoute>
                  <MemberDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/give-money"
              element={
                <ProtectedRoute>
                  <GiveMoneyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/receive-money"
              element={
                <ProtectedRoute>
                  <ReceiveMoneyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/repayments"
              element={
                <ProtectedRoute>
                  <RepaymentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <ProtectedRoute>
                  <TransactionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reminders"
              element={
                <ProtectedRoute>
                  <RemindersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
