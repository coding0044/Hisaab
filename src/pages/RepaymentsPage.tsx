import { CheckCircle2, FileText, MessageCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  type EnrichedRepayment,
  type EnrichedTransaction,
  PAYMENT_METHODS,
  type PaymentMethod,
  type PublicMember,
} from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Dialog } from '../components/ui/dialog.tsx';
import { Input, Label, Select } from '../components/ui/input.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import {
  buildClientWhatsAppUrl,
  formatDateDisplay,
  formatPKR,
  formatPlainPKR,
  generateIdempotencyKey,
  todayISODate,
} from '../lib/utils.ts';

interface RepaymentsPagePayload {
  members: PublicMember[];
  repayments: EnrichedRepayment[];
  my_payables: EnrichedTransaction[];
}

export function RepaymentsPage() {
  const { user, refreshUnreadCount } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedReceiver = searchParams.get('receiver') ?? '';

  const [data, setData] = useState<RepaymentsPagePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [receiverId, setReceiverId] = useState(preselectedReceiver);
  const [allocationMode, setAllocationMode] = useState<'FIFO' | 'SPECIFIC'>('FIFO');
  const [selectedTxId, setSelectedTxId] = useState('');
  const [amount, setAmount] = useState('');
  const [repaymentDate, setRepaymentDate] = useState(todayISODate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [description, setDescription] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey('rep'));
  const [submitting, setSubmitting] = useState(false);

  const [receiptModalData, setReceiptModalData] = useState<{
    receipt_number: string;
    payer_name: string;
    receiver_name: string;
    receiver_intl_phone: string;
    amount_paisa: number;
    remaining_paisa: number;
    date: string;
    method: string;
    description: string;
  } | null>(null);

  const loadRepayments = async () => {
    try {
      const payload = await apiFetch<RepaymentsPagePayload>('/api/repayments');
      setData(payload);

      const otherMembers = payload.members.filter((m) => m.id !== user?.id);
      if (!receiverId && otherMembers.length > 0) {
        const withDebt = otherMembers.find((m) =>
          payload.my_payables.some((tx) => tx.sender_id === m.id)
        );
        setReceiverId(withDebt?.id ?? otherMembers[0].id);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load repayments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepayments();
  }, [user?.id]);

  const otherMembers = (data?.members ?? []).filter((m) => m.id !== user?.id);
  const openDebtsToReceiver = (data?.my_payables ?? [])
    .filter((tx) => tx.sender_id === receiverId)
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  const totalOutstandingToReceiverPaisa = openDebtsToReceiver.reduce(
    (sum, tx) => sum + tx.remaining_paisa,
    0
  );

  const selectedSpecificTx = openDebtsToReceiver.find((tx) => tx.id === selectedTxId);
  const maxPayablePaisa =
    allocationMode === 'SPECIFIC' && selectedSpecificTx
      ? selectedSpecificTx.remaining_paisa
      : totalOutstandingToReceiverPaisa;

  useEffect(() => {
    if (openDebtsToReceiver.length > 0 && !openDebtsToReceiver.some((t) => t.id === selectedTxId)) {
      setSelectedTxId(openDebtsToReceiver[0].id);
    }
    if (openDebtsToReceiver.length <= 1) {
      setAllocationMode('FIFO');
    }
  }, [receiverId, openDebtsToReceiver.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        repayments: EnrichedRepayment[];
        receipt_number: string;
        total_repaid_paisa: number;
        remaining_between_members_paisa: number;
      }>('/api/repayments', {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: receiverId,
          allocation_mode: allocationMode,
          transaction_id: allocationMode === 'SPECIFIC' ? selectedTxId : undefined,
          amount,
          repayment_date: repaymentDate,
          payment_method: paymentMethod,
          description,
          idempotency_key: idempotencyKey,
        }),
      });

      const receiverObj = otherMembers.find((m) => m.id === receiverId);
      setReceiptModalData({
        receipt_number: res.receipt_number,
        payer_name: user?.full_name ?? '',
        receiver_name: receiverObj?.full_name ?? '',
        receiver_intl_phone: receiverObj?.international_phone ?? '',
        amount_paisa: res.total_repaid_paisa,
        remaining_paisa: res.remaining_between_members_paisa,
        date: repaymentDate,
        method: paymentMethod,
        description,
      });

      toast.success(`Repaid ${formatPKR(res.total_repaid_paisa)} to ${receiverObj?.full_name}`);
      setAmount('');
      setDescription('');
      setIdempotencyKey(generateIdempotencyKey('rep'));
      await loadRepayments();
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not record repayment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Repayments
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Settle partial or full debts via FIFO oldest-first allocation or target a specific transaction. Overpayments are strictly blocked.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Repayment Form */}
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Repay Money</CardTitle>
            <CardDescription>Generates an immutable repayment receipt and updates both dashboards</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="rep-receiver">Select Person to Repay</Label>
                <Select
                  id="rep-receiver"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  required
                >
                  {otherMembers.map((m) => {
                    const owed = data.my_payables
                      .filter((tx) => tx.sender_id === m.id)
                      .reduce((s, tx) => s + tx.remaining_paisa, 0);
                    return (
                      <option key={m.id} value={m.id}>
                        {m.full_name} — Outstanding: {formatPKR(owed)}
                      </option>
                    );
                  })}
                </Select>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Your Outstanding Payable
                </span>
                <span
                  className={`font-mono text-lg font-bold tabular-nums ${
                    totalOutstandingToReceiverPaisa > 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatPKR(totalOutstandingToReceiverPaisa)}
                </span>
              </div>

              {openDebtsToReceiver.length > 1 && (
                <div className="space-y-2">
                  <Label>Allocation Method ({openDebtsToReceiver.length} open debts)</Label>
                  <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setAllocationMode('FIFO')}
                      className={`py-2 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        allocationMode === 'FIFO'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      FIFO (Oldest First)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllocationMode('SPECIFIC')}
                      className={`py-2 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                        allocationMode === 'SPECIFIC'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Specific Debt
                    </button>
                  </div>
                </div>
              )}

              {allocationMode === 'SPECIFIC' && openDebtsToReceiver.length > 0 && (
                <div>
                  <Label htmlFor="rep-tx">Select Debt Transaction</Label>
                  <Select
                    id="rep-tx"
                    value={selectedTxId}
                    onChange={(e) => setSelectedTxId(e.target.value)}
                  >
                    {openDebtsToReceiver.map((tx) => (
                      <option key={tx.id} value={tx.id}>
                        {formatDateDisplay(tx.transaction_date)} · {tx.description} (Remaining:{' '}
                        {formatPKR(tx.remaining_paisa)})
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label htmlFor="rep-amount" className="mb-0">
                      Repayment Amount (PKR)
                    </Label>
                    {maxPayablePaisa > 0 && (
                      <button
                        type="button"
                        onClick={() => setAmount(formatPlainPKR(maxPayablePaisa))}
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Pay Full ({formatPKR(maxPayablePaisa)})
                      </button>
                    )}
                  </div>
                  <Input
                    id="rep-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    max={maxPayablePaisa > 0 ? maxPayablePaisa / 100 : undefined}
                    required
                    disabled={totalOutstandingToReceiverPaisa === 0}
                    placeholder="200"
                    className="font-mono"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="rep-date">Repayment Date</Label>
                  <Input
                    id="rep-date"
                    type="date"
                    required
                    className="font-mono"
                    value={repaymentDate}
                    onChange={(e) => setRepaymentDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="rep-method">Payment Method</Label>
                <Select
                  id="rep-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="rep-description">Description</Label>
                <Input
                  id="rep-description"
                  type="text"
                  required
                  maxLength={240}
                  placeholder="e.g., Partial cash repayment, JazzCash transfer"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={submitting || totalOutstandingToReceiverPaisa === 0}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Processing Repayment...'
                    : totalOutstandingToReceiverPaisa === 0
                      ? 'No Pending Debt to Repay'
                      : 'Confirm Repayment'}
                </span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Open Debts Breakdown for Selected Member */}
        <Card className="lg:col-span-5 h-fit">
          <CardHeader>
            <CardTitle>Open Debts Breakdown</CardTitle>
            <CardDescription>
              {allocationMode === 'FIFO'
                ? 'FIFO applies your repayment to the oldest debt first'
                : 'Selected debt will be credited first'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {openDebtsToReceiver.length === 0 ? (
              <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
                You have no pending debts owed to this member.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {openDebtsToReceiver.map((tx, idx) => (
                  <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {idx + 1}. {tx.description}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateDisplay(tx.transaction_date)} · Original{' '}
                        {formatPKR(tx.amount_paisa)}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold tabular-nums text-red-700 dark:text-red-400 shrink-0">
                      {formatPKR(tx.remaining_paisa)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Permanent Repayment History */}
      <Card>
        <CardHeader>
          <CardTitle>Permanent Repayment History</CardTitle>
          <CardDescription>Verified repayment receipts across the circle</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data.repayments.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No repayments have been recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Payer → Receiver</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3 text-right">Repaid</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.repayments.map((rep) => (
                    <tr
                      key={rep.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {rep.receipt_number}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        {formatDateDisplay(rep.repayment_date)}
                      </td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {rep.payer_name} → {rep.receiver_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {rep.payment_method}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 max-w-[220px] truncate">
                        {rep.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatPKR(rep.amount_paisa)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setReceiptModalData({
                              receipt_number: rep.receipt_number,
                              payer_name: rep.payer_name,
                              receiver_name: rep.receiver_name,
                              receiver_intl_phone: rep.receiver_international_phone,
                              amount_paisa: rep.amount_paisa,
                              remaining_paisa: rep.remaining_between_members_paisa,
                              date: rep.repayment_date,
                              method: rep.payment_method,
                              description: rep.description,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Receipt</span>
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

      {/* Repayment Receipt Modal */}
      <Dialog
        open={Boolean(receiptModalData)}
        onClose={() => setReceiptModalData(null)}
        title="Repayment Receipt"
        description="Official Hisaab settlement summary"
      >
        {receiptModalData && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Receipt No.</span>
                <span className="font-mono font-semibold">{receiptModalData.receipt_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Date</span>
                <span className="font-mono">{formatDateDisplay(receiptModalData.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Paid By</span>
                <span className="font-medium">{receiptModalData.payer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Paid To</span>
                <span className="font-medium">{receiptModalData.receiver_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Method</span>
                <span>{receiptModalData.method}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2.5">
                <span className="font-medium">Amount Repaid</span>
                <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                  {formatPKR(receiptModalData.amount_paisa)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Remaining Balance</span>
                <span className="font-mono font-semibold">
                  {formatPKR(receiptModalData.remaining_paisa)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {receiptModalData.receiver_intl_phone && (
                <a
                  href={buildClientWhatsAppUrl(
                    receiptModalData.receiver_intl_phone,
                    `Hello ${receiptModalData.receiver_name}, ${receiptModalData.payer_name} has repaid Rs. ${formatPlainPKR(receiptModalData.amount_paisa)}. Your remaining outstanding balance is Rs. ${formatPlainPKR(receiptModalData.remaining_paisa)}.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Send via WhatsApp</span>
                </a>
              )}
              <Button variant="outline" onClick={() => setReceiptModalData(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
