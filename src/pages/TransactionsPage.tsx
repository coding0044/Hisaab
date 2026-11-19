import {
  ArrowUpDown,
  Download,
  Eye,
  FileSpreadsheet,
  RotateCcw,
  Search,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  type LedgerEntry,
  type PublicMember,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Dialog } from '../components/ui/dialog.tsx';
import { Input, Label, Select } from '../components/ui/input.tsx';
import { TransactionStatusLabel } from '../components/ui/status-label.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { exportTransactionsToExcel, exportTransactionsToPDF } from '../lib/export.ts';
import {
  formatDateDisplay,
  formatPKR,
  formatTransactionTypeLabel,
  generateIdempotencyKey,
} from '../lib/utils.ts';

interface TransactionsPayload {
  members: PublicMember[];
  ledger: LedgerEntry[];
}

export function TransactionsPage() {
  const { user, refreshUnreadCount } = useAuth();
  const [data, setData] = useState<TransactionsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>(
    'date_desc'
  );

  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [reverseTarget, setReverseTarget] = useState<LedgerEntry | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const loadLedger = async () => {
    setLoading(true);
    try {
      const payload = await apiFetch<TransactionsPayload>('/api/transactions');
      setData(payload);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const minPaisa = minAmount ? Math.round(Number(minAmount) * 100) : null;
    const maxPaisa = maxAmount ? Math.round(Number(maxAmount) * 100) : null;

    const list = data.ledger.filter((e) => {
      if (q) {
        const hay =
          `${e.reference_code} ${e.description} ${e.sender_name} ${e.receiver_name} ${e.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (memberFilter !== 'ALL') {
        if (e.sender_id !== memberFilter && e.receiver_id !== memberFilter) return false;
      }
      if (typeFilter !== 'ALL' && e.transaction_type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo) return false;
      if (minPaisa !== null && Number.isFinite(minPaisa) && e.amount_paisa < minPaisa) return false;
      if (maxPaisa !== null && Number.isFinite(maxPaisa) && e.amount_paisa > maxPaisa) return false;
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at);
      }
      if (sortBy === 'date_asc') {
        return a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);
      }
      if (sortBy === 'amount_desc') {
        return b.amount_paisa - a.amount_paisa;
      }
      return a.amount_paisa - b.amount_paisa;
    });

    return list;
  }, [data, search, memberFilter, typeFilter, statusFilter, dateFrom, dateTo, minAmount, maxAmount, sortBy]);

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    setReversing(true);
    try {
      await apiFetch(`/api/transactions/${reverseTarget.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reverseReason,
          idempotency_key: generateIdempotencyKey('rev'),
        }),
      });
      toast.success('Reversal entry recorded. Original history remains preserved.');
      setReverseTarget(null);
      setDetailEntry(null);
      setReverseReason('');
      await loadLedger();
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not reverse transaction.');
    } finally {
      setReversing(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setMemberFilter('ALL');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Transaction History
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Immutable audit ledger. Financial entries are never deleted; corrections use reversal records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportTransactionsToPDF(filteredEntries, user?.full_name ?? 'Member')}
            disabled={filteredEntries.length === 0}
          >
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportTransactionsToExcel(filteredEntries)}
            disabled={filteredEntries.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="search"
                placeholder="Search ID, description, member..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
              <option value="ALL">All Members</option>
              {(data?.members ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </Select>

            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">All Types</option>
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {formatTransactionTypeLabel(t)}
                </option>
              ))}
            </Select>

            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              {TRANSACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
            <div>
              <Label htmlFor="tx-from" className="text-xs">
                Date From
              </Label>
              <Input
                id="tx-from"
                type="date"
                className="font-mono text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tx-to" className="text-xs">
                Date To
              </Label>
              <Input
                id="tx-to"
                type="date"
                className="font-mono text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tx-min" className="text-xs">
                Min PKR
              </Label>
              <Input
                id="tx-min"
                type="number"
                placeholder="0"
                className="font-mono text-xs"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="tx-max" className="text-xs">
                Max PKR
              </Label>
              <Input
                id="tx-max"
                type="number"
                placeholder="Any"
                className="font-mono text-xs"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
              <Select
                aria-label="Sort transactions"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-xs"
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="amount_desc">Highest Amount</option>
                <option value="amount_asc">Lowest Amount</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing <strong className="font-mono">{filteredEntries.length}</strong> entries
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading ledger...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No transactions match your current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">Transaction ID</th>
                    <th className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setSortBy((s) => (s === 'date_desc' ? 'date_asc' : 'date_desc'))
                        }
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <span>Date</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3">Sender</th>
                    <th className="px-4 py-3">Receiver</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setSortBy((s) => (s === 'amount_desc' ? 'amount_asc' : 'amount_desc'))
                        }
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                      >
                        <span>Amount</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right">Status</th>
                    <th className="px-5 py-3 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEntries.map((entry) => (
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
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {entry.sender_name}
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {entry.receiver_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatTransactionTypeLabel(entry.transaction_type)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[220px] truncate">
                        {entry.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        {formatPKR(entry.amount_paisa)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TransactionStatusLabel status={entry.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailEntry(entry)}
                          aria-label={`Inspect ${entry.reference_code}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Modal */}
      <Dialog
        open={Boolean(detailEntry)}
        onClose={() => setDetailEntry(null)}
        title="Transaction Details"
        description={detailEntry ? `Reference ${detailEntry.reference_code}` : undefined}
      >
        {detailEntry && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Record ID</span>
                <span className="font-mono text-xs">{detailEntry.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Date</span>
                <span className="font-mono">{formatDateDisplay(detailEntry.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Type</span>
                <span>{formatTransactionTypeLabel(detailEntry.transaction_type)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Sender / Payer</span>
                <span className="font-medium">{detailEntry.sender_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Receiver</span>
                <span className="font-medium">{detailEntry.receiver_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Amount</span>
                <span className="font-mono font-bold">{formatPKR(detailEntry.amount_paisa)}</span>
              </div>
              {detailEntry.entry_kind === 'TRANSACTION' &&
                detailEntry.transaction_type !== 'REVERSAL' && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Remaining</span>
                    <span className="font-mono font-semibold">
                      {formatPKR(detailEntry.remaining_paisa)}
                    </span>
                  </div>
                )}
              {detailEntry.payment_method && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Payment Method</span>
                  <span>{detailEntry.payment_method}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Status</span>
                <TransactionStatusLabel status={detailEntry.status} />
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 block">Description</span>
                <p className="mt-0.5 text-slate-900 dark:text-slate-100">
                  {detailEntry.description}
                </p>
                {detailEntry.notes && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Notes: {detailEntry.notes}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {detailEntry.entry_kind === 'TRANSACTION' &&
              detailEntry.status !== 'REVERSED' &&
              detailEntry.transaction_type !== 'REVERSAL' &&
              detailEntry.repaid_amount_paisa === 0 &&
              (detailEntry.sender_id === user?.id || detailEntry.receiver_id === user?.id) ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setReverseTarget(detailEntry)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reverse Entry</span>
                </Button>
              ) : (
                <span className="text-xs text-slate-400">
                  Immutable audit entry
                </span>
              )}

              <Button variant="outline" size="sm" onClick={() => setDetailEntry(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Reversal Confirmation Modal */}
      <Dialog
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title="Reverse Financial Entry"
        description="Creates an immutable REVERSAL record instead of deleting history."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleReverse} className="space-y-4">
          <div>
            <Label htmlFor="rev-reason">Reason for Reversal</Label>
            <Input
              id="rev-reason"
              type="text"
              required
              minLength={3}
              placeholder="e.g., Entered wrong amount or duplicate entry"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={() => setReverseTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={reversing}>
              {reversing ? 'Reversing...' : 'Confirm Reversal'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
