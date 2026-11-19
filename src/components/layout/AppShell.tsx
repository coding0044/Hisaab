import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { cn } from '../../lib/utils.ts';
import { Button } from '../ui/button.tsx';
import { Dialog } from '../ui/dialog.tsx';
import { MemberAvatar } from '../ui/member-avatar.tsx';

interface NavItem {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  badgeCount?: number;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/members': 'Members',
  '/give-money': 'Give Money',
  '/receive-money': 'Receive Money',
  '/repayments': 'Repayments',
  '/transactions': 'Transaction History',
  '/reminders': 'Reminders',
  '/reports': 'Reports & Analytics',
  '/notifications': 'Notifications',
  '/profile': 'Profile',
  '/settings': 'Settings',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, unreadCount, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navItems: NavItem[] = [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Members', to: '/members', icon: Users },
    { label: 'Give Money', to: '/give-money', icon: ArrowUpRight },
    { label: 'Receive Money', to: '/receive-money', icon: ArrowDownLeft },
    { label: 'Repayments', to: '/repayments', icon: CheckCircle2 },
    { label: 'Transactions', to: '/transactions', icon: ListOrdered },
    { label: 'Reminders', to: '/reminders', icon: CalendarClock },
    { label: 'Reports', to: '/reports', icon: BarChart3 },
    { label: 'Notifications', to: '/notifications', icon: Bell, badgeCount: unreadCount },
    { label: 'Profile', to: '/profile', icon: UserCircle },
    { label: 'Settings', to: '/settings', icon: Settings },
  ];

  const currentTitle =
    PAGE_TITLES[location.pathname] ??
    (location.pathname.startsWith('/members/') ? 'Member Profile' : 'Hisaab');

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      toast.success('Signed out securely.');
      navigate('/login');
    } catch {
      toast.error('Unable to sign out right now.');
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };

  const SidebarContent = (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex h-14 items-center justify-between px-5 border-b border-slate-100 dark:border-slate-800">
        <Link
          to="/dashboard"
          onClick={() => setMobileMenuOpen(false)}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          Hisaab
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Primary Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                )
              }
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {item.badgeCount}
                </span>
              )}
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            setLogoutConfirmOpen(true);
          }}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </nav>

      {user && (
        <div className="border-t border-slate-100 dark:border-slate-800 p-4">
          <Link
            to="/profile"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            <MemberAvatar name={user.full_name} avatarUrl={user.avatar_url} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.full_name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{SidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Hisaab
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>
              <h1 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Link
              to="/give-money"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Give Money</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>

      <Dialog
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        title="Sign out of Hisaab"
        description="Your active session cookie will be cleared from this browser."
        maxWidthClass="max-w-sm"
      >
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => setLogoutConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmLogout} disabled={loggingOut}>
            {loggingOut ? 'Signing out...' : 'Sign out'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
