import { Download, FileSpreadsheet } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import type {
  DashboardMetrics,
  DirectionalPairBalance,
  EnrichedTransaction,
  MonthlyActivityPoint,
  PublicMember,
} from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { TransactionStatusLabel } from '../components/ui/status-label.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { exportReportsToExcel, exportReportsToPDF } from '../lib/export.ts';
import { formatDateDisplay, formatPKR } from '../lib/utils.ts';

interface ReportsPayload {
  user_metrics: DashboardMetrics;
  group_totals: {
    total_lending_paisa: number;
    total_repayments_paisa: number;
    total_outstanding_paisa: number;
  };
  member_summaries: Array<{
    member: PublicMember;
    metrics: DashboardMetrics;
  }>;
  directional_balances: DirectionalPairBalance[];
  pending_payments: EnrichedTransaction[];
  fully_paid_debts: EnrichedTransaction[];
  monthly_user_series: MonthlyActivityPoint[];
  monthly_group_series: MonthlyActivityPoint[];
}

export function ReportsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<ReportsPayload>('/api/reports')
      .then(setData)
      .catch((err) => toast.error(err?.message ?? 'Could not load financial reports.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const lendingVsRepaymentData = data.member_summaries.map((m) => ({
    name: m.member.full_name.split(' ')[0],
    Lending: Math.round(m.metrics.total_given_paisa / 100),
    Repayments: Math.round(m.metrics.total_repaid_paisa / 100),
  }));

  const memberOutstandingData = data.member_summaries.map((m) => ({
    name: m.member.full_name.split(' ')[0],
    Receivable: Math.round(m.metrics.total_receivable_paisa / 100),
    Payable: Math.round(m.metrics.total_payable_paisa / 100),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Reports & Analytics
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Personal and circle-wide lending, borrowing, repayment trends, and settlement audit reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportReportsToPDF({
                ownerName: user?.full_name ?? 'Member',
                directionalBalances: data.directional_balances,
                memberSummaries: data.member_summaries,
              })
            }
          >
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportReportsToExcel({
                directionalBalances: data.directional_balances,
                memberSummaries: data.member_summaries,
              })
            }
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </Button>
        </div>
      </div>

      {/* 6 Report Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Your Total Lending</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {formatPKR(data.user_metrics.total_given_paisa)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Your Total Borrowing</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {formatPKR(data.user_metrics.total_borrowed_paisa)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Circle Total Repayments</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatPKR(data.group_totals.total_repayments_paisa)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Your Total Receivables</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatPKR(data.user_metrics.total_receivable_paisa)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Your Total Payables</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-red-700 dark:text-red-400">
            {formatPKR(data.user_metrics.total_payable_paisa)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Circle Outstanding Debts</p>
          <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {formatPKR(data.group_totals.total_outstanding_paisa)}
          </p>
        </Card>
      </div>

      {/* 4 Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Lending vs Repayment */}
        <Card>
          <CardHeader>
            <CardTitle>Lending vs Repayment by Member</CardTitle>
            <CardDescription>Total given vs total repaid (PKR)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lendingVsRepaymentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v: any) => `Rs. ${Number(v).toLocaleString('en-PK')}`} />
                  <Legend />
                  <Bar dataKey="Lending" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Repayments" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 2. Monthly Financial Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Financial Activity</CardTitle>
            <CardDescription>Circle-wide monthly lending and repayments (PKR)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthly_group_series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v: any) => `Rs. ${Number(v).toLocaleString('en-PK')}`} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="given_pkr"
                    name="Money Lent"
                    stroke="#059669"
                    fill="#059669"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="repayments_received_pkr"
                    name="Repayments"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 3. Member-wise Outstanding Balances */}
        <Card>
          <CardHeader>
            <CardTitle>Member-wise Outstanding Balances</CardTitle>
            <CardDescription>Separate receivables vs payables per member (PKR)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberOutstandingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v: any) => `Rs. ${Number(v).toLocaleString('en-PK')}`} />
                  <Legend />
                  <Bar dataKey="Receivable" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Payable" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 4. Repayment Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Your Repayment Trends</CardTitle>
            <CardDescription>Monthly repayments received vs paid by you (PKR)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthly_user_series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v: any) => `Rs. ${Number(v).toLocaleString('en-PK')}`} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="repayments_received_pkr"
                    name="Received"
                    stroke="#059669"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="repayments_paid_pkr"
                    name="Paid"
                    stroke="#d97706"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member-wise Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Member-wise Financial Summary</CardTitle>
          <CardDescription>Aggregated lifetime PKR totals across all three accounts</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-3">Member</th>
                  <th className="px-4 py-3 text-right">Given</th>
                  <th className="px-4 py-3 text-right">Borrowed</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Repaid</th>
                  <th className="px-4 py-3 text-right">Receivable</th>
                  <th className="px-5 py-3 text-right">Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.member_summaries.map((m) => (
                  <tr key={m.member.id}>
                    <td className="px-5 py-3 font-medium">{m.member.full_name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatPKR(m.metrics.total_given_paisa)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatPKR(m.metrics.total_borrowed_paisa)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatPKR(m.metrics.total_received_paisa)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {formatPKR(m.metrics.total_repaid_paisa)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatPKR(m.metrics.total_receivable_paisa)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-red-700 dark:text-red-400">
                      {formatPKR(m.metrics.total_payable_paisa)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending Payments & Fully Paid Debts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pending Payments ({data.pending_payments.length})</CardTitle>
            <CardDescription>Open debts with remaining balance</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.pending_payments.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No pending payments.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.pending_payments.map((tx) => (
                  <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tx.sender_name} → {tx.receiver_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {tx.description} · {formatDateDisplay(tx.transaction_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold tabular-nums">
                        {formatPKR(tx.remaining_paisa)}
                      </p>
                      <TransactionStatusLabel status={tx.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fully Paid Debts ({data.fully_paid_debts.length})</CardTitle>
            <CardDescription>Completed lending obligations</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.fully_paid_debts.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No fully settled debts yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.fully_paid_debts.map((tx) => (
                  <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tx.sender_name} → {tx.receiver_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {tx.description} · {formatDateDisplay(tx.transaction_date)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatPKR(tx.amount_paisa)}
                      </p>
                      <TransactionStatusLabel status={tx.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
