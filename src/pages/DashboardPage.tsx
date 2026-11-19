import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCircle2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import type { DashboardPayload } from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { MemberAvatar } from '../components/ui/member-avatar.tsx';
import { ReminderStatusLabel, TransactionStatusLabel } from '../components/ui/status-label.tsx';
import { apiFetch } from '../lib/api.ts';
import {
  formatDateDisplay,
  formatPKR,
  formatTransactionTypeLabel,
} from '../lib/utils.ts';

export function DashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<DashboardPayload>('/api/dashboard');
      setData(payload);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
        <div className="h-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  const { metrics, current_user } = data;

  const kpiCards = [
    {
      label: 'Total Money Given',
      value: formatPKR(metrics.total_given_paisa),
      sub: 'Total lent to friends',
      tone: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: 'Total Money Borrowed',
      value: formatPKR(metrics.total_borrowed_paisa),
      sub: 'Total taken from friends',
      tone: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: 'Total Money Received',
      value: formatPKR(metrics.total_received_paisa),
      sub: 'Repayments collected',
      tone: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Total Money Repaid',
      value: formatPKR(metrics.total_repaid_paisa),
      sub: 'Repayments you sent',
      tone: 'text-slate-900 dark:text-slate-100',
    },
    {
      label: 'Total Receivable',
      value: formatPKR(metrics.total_receivable_paisa),
      sub: 'Pending to collect',
      tone: 'text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Total Payable',
      value: formatPKR(metrics.total_payable_paisa),
      sub: 'Pending to repay',
      tone:
        metrics.total_payable_paisa > 0
          ? 'text-red-700 dark:text-red-400'
          : 'text-slate-900 dark:text-slate-100',
    },
    {
      label: 'Outstanding Balance',
      value: formatPKR(metrics.net_outstanding_paisa, { signed: true }),
      sub:
        metrics.net_outstanding_paisa >= 0
          ? 'Net receivable position'
          : 'Net payable position',
      tone:
        metrics.net_outstanding_paisa > 0
          ? 'text-emerald-700 dark:text-emerald-400'
          : metrics.net_outstanding_paisa < 0
            ? 'text-red-700 dark:text-red-400'
            : 'text-slate-900 dark:text-slate-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome & Quick Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome, {current_user.full_name}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Live PKR financial position · Directional balances are tracked separately per member.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/give-money">
            <Button variant="primary" size="sm">
              <ArrowUpRight className="w-4 h-4" />
              <span>Give Money</span>
            </Button>
          </Link>
          <Link to="/receive-money">
            <Button variant="outline" size="sm">
              <ArrowDownLeft className="w-4 h-4" />
              <span>Receive Money</span>
            </Button>
          </Link>
          <Link to="/repayments">
            <Button variant="secondary" size="sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Repay Debt</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 7 Financial KPIs */}
      <section aria-label="Financial Overview" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Card key={card.label} className="p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
            <p className={`mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight ${card.tone}`}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.sub}</p>
          </Card>
        ))}
      </section>

      {/* Member-Wise Separate Balances & Monthly Activity Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Member-wise Balances (5 cols) */}
        <Card className="lg:col-span-5 flex flex-col">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Member-wise Balances</CardTitle>
              <CardDescription>Separate receivables & payables per friend</CardDescription>
            </div>
            <Link
              to="/members"
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="flex-1 divide-y divide-slate-100 dark:divide-slate-800 p-0">
            {data.member_summaries.map((item) => (
              <Link
                key={item.member.id}
                to={`/members/${item.member.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MemberAvatar
                    name={item.member.full_name}
                    avatarUrl={item.member.avatar_url}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {item.member.full_name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {item.member.phone_number}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <p className="font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400">
                    Receivable: {formatPKR(item.receivable_from_member_paisa)}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-red-700 dark:text-red-400">
                    Payable: {formatPKR(item.payable_to_member_paisa)}
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Monthly Activity Chart (7 cols) */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Monthly Financial Activity</CardTitle>
              <CardDescription>Lending, borrowing, and repayments over the last 6 months (PKR)</CardDescription>
            </div>
            <Link
              to="/reports"
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              Full reports
            </Link>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthly_activity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(value: any) => `Rs. ${Number(value).toLocaleString('en-PK')}`}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="given_pkr" name="Given" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="borrowed_pkr" name="Borrowed" fill="#0f172a" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="repayments_received_pkr"
                    name="Repayments In"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions + Pending Payments + Reminders + Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Transactions (7 cols) */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest lending, borrowing, and repayment entries</CardDescription>
            </div>
            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              <span>All history</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {data.recent_transactions.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No transactions recorded yet. Record money given or received to start your ledger.
                </p>
                <Link to="/give-money">
                  <Button size="sm">Record First Transaction</Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-4 py-3">Parties</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-5 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.recent_transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDateDisplay(tx.date)}
                        </td>
                        <td className="px-4 py-3 min-w-[160px]">
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {tx.sender_name} → {tx.receiver_name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                            {tx.description}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatTransactionTypeLabel(tx.transaction_type)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                          {formatPKR(tx.amount_paisa)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <TransactionStatusLabel status={tx.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Stack: Pending Payments, Upcoming Reminders, Recent Notifications (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Pending Payments */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Pending Payments</CardTitle>
                <CardDescription>Open obligations awaiting settlement</CardDescription>
              </div>
              <Link
                to="/repayments"
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Settle
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {data.pending_debts.length === 0 ? (
                <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
                  All debts involving your account are settled.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.pending_debts.slice(0, 4).map((debt) => {
                    const isReceivable = debt.sender_id === current_user.id;
                    return (
                      <div
                        key={debt.id}
                        className="flex items-center justify-between gap-3 px-5 py-3.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {isReceivable
                              ? `${debt.receiver_name} owes you`
                              : `You owe ${debt.sender_name}`}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {debt.description} · {formatDateDisplay(debt.transaction_date)}
                          </p>
                        </div>
                        <span
                          className={`font-mono text-sm font-semibold tabular-nums shrink-0 ${
                            isReceivable
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {formatPKR(debt.remaining_paisa)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Reminders */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-slate-500" />
                <CardTitle>Upcoming Reminders</CardTitle>
              </div>
              <Link
                to="/reminders"
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Manage
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {data.upcoming_reminders.length === 0 ? (
                <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
                  No upcoming or overdue payment reminders.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.upcoming_reminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="flex items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {rem.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {rem.recipient_name} · {formatDateDisplay(rem.reminder_date)} {rem.reminder_time}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-sm font-semibold tabular-nums">
                          {formatPKR(rem.amount_paisa)}
                        </p>
                        <ReminderStatusLabel status={rem.computed_status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Notifications */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-500" />
                <CardTitle>Recent Notifications</CardTitle>
              </div>
              <Link
                to="/notifications"
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Inbox
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {data.recent_notifications.length === 0 ? (
                <p className="p-5 text-sm text-slate-500 dark:text-slate-400">
                  No notifications yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recent_notifications.map((n) => (
                    <div key={n.id} className="px-5 py-3.5">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {n.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {n.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
