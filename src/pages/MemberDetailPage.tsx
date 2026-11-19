import { ArrowLeft, ArrowUpRight, CheckCircle2, Mail, MessageCircle, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type {
  DashboardMetrics,
  EnrichedTransaction,
  LedgerEntry,
  MemberPairCardSummary,
} from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { MemberAvatar } from '../components/ui/member-avatar.tsx';
import { TransactionStatusLabel } from '../components/ui/status-label.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import {
  buildClientWhatsAppUrl,
  formatDateDisplay,
  formatPKR,
  formatPlainPKR,
  formatTransactionTypeLabel,
} from '../lib/utils.ts';

interface MemberDetailResponse {
  summary: MemberPairCardSummary;
  member_overall_metrics: DashboardMetrics;
  shared_ledger: LedgerEntry[];
  member_full_ledger: LedgerEntry[];
  open_debts_to_target: EnrichedTransaction[];
  open_debts_from_target: EnrichedTransaction[];
}

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<MemberDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'shared' | 'all'>('shared');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch<MemberDetailResponse>(`/api/members/${id}`)
      .then((res) => {
        setData(res);
        if (user?.id === id) setScope('all');
      })
      .catch((err) => toast.error(err?.message ?? 'Failed to load member profile.'))
      .finally(() => setLoading(false));
  }, [id, user?.id]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  const { summary, member_overall_metrics, shared_ledger, member_full_ledger } = data;
  const target = summary.member;
  const isSelf = user?.id === target.id;
  const activeLedger = scope === 'shared' && !isSelf ? shared_ledger : member_full_ledger;

  const reminderMessage = `Hello ${target.full_name}, this is a friendly reminder that you have Rs. ${formatPlainPKR(summary.receivable_from_member_paisa)} pending to repay ${user?.full_name ?? 'me'}.`;
  const waReminderUrl = buildClientWhatsAppUrl(target.international_phone, reminderMessage);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/members"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Members</span>
        </Link>

        {!isSelf && (
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/give-money?member=${target.id}`}>
              <Button size="sm" variant="primary">
                <ArrowUpRight className="w-4 h-4" />
                <span>Give Money</span>
              </Button>
            </Link>
            {summary.payable_to_member_paisa > 0 && (
              <Link to={`/repayments?receiver=${target.id}`}>
                <Button size="sm" variant="secondary">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Repay {target.full_name}</span>
                </Button>
              </Link>
            )}
            {summary.receivable_from_member_paisa > 0 && (
              <a
                href={waReminderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/40 px-3 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition-colors whitespace-nowrap"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp Reminder</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Member Header Card */}
      <Card>
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <MemberAvatar name={target.full_name} avatarUrl={target.avatar_url} size="lg" />
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                {target.full_name} {isSelf && <span className="text-sm font-normal text-emerald-600">(Your Account)</span>}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {target.email}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <Phone className="w-3.5 h-3.5" />
                  {target.phone_number} (+{target.international_phone})
                </span>
              </div>
            </div>
          </div>

          {!isSelf && (
            <div className="grid grid-cols-2 gap-6 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Receivable from {target.full_name}</p>
                <p className="font-mono text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {formatPKR(summary.receivable_from_member_paisa)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Payable to {target.full_name}</p>
                <p
                  className={`font-mono text-xl font-bold tabular-nums mt-0.5 ${
                    summary.payable_to_member_paisa > 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {formatPKR(summary.payable_to_member_paisa)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overall Member Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Money Given</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">
            {formatPKR(member_overall_metrics.total_given_paisa)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Money Borrowed</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">
            {formatPKR(member_overall_metrics.total_borrowed_paisa)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Money Received</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatPKR(member_overall_metrics.total_received_paisa)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Money Repaid</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">
            {formatPKR(member_overall_metrics.total_repaid_paisa)}
          </p>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader className="flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              {scope === 'shared' && !isSelf
                ? `Transactions directly between you and ${target.full_name}`
                : `All recorded entries involving ${target.full_name}`}
            </CardDescription>
          </div>
          {!isSelf && (
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 self-start">
              <button
                type="button"
                onClick={() => setScope('shared')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  scope === 'shared'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Between Us ({shared_ledger.length})
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  scope === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All Activity ({member_full_ledger.length})
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {activeLedger.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No financial entries found in this view.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">Ref ID</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">From → To</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeLedger.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {entry.reference_code}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        {formatDateDisplay(entry.date)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {formatTransactionTypeLabel(entry.transaction_type)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {entry.sender_name} → {entry.receiver_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[260px] truncate">
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        {formatPKR(entry.amount_paisa)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <TransactionStatusLabel status={entry.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
