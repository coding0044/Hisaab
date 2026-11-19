import { ArrowDownLeft, CheckCircle2, MessageCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type EnrichedRepayment,
  type EnrichedTransaction,
  type MemberPairCardSummary,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
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

export function ReceiveMoneyPage() {
  const { user, refreshUnreadCount } = useAuth();
  const [friends, setFriends] = useState<MemberPairCardSummary[]>([]);
  const [myReceivables, setMyReceivables] = useState<EnrichedTransaction[]>([]);
  const [senderId, setSenderId] = useState('');
  const [isRepayment, setIsRepayment] = useState(true);
  const [selectedTxId, setSelectedTxId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey('recv'));
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    mode: 'REPAYMENT' | 'LOAN_RECEIVED';
    senderName: string;
    senderIntlPhone: string;
    amountPaisa: number;
    remainingPaisa?: number;
    receiptNumber?: string;
  } | null>(null);

  const loadData = async () => {
    try {
      const [mData, txData] = await Promise.all([
        apiFetch<{ other_members: MemberPairCardSummary[] }>('/api/members'),
        apiFetch<{ my_receivables: EnrichedTransaction[] }>('/api/transactions'),
      ]);
      setFriends(mData.other_members);
      setMyReceivables(txData.my_receivables);
      if (!senderId && mData.other_members.length > 0) {
        setSenderId(mData.other_members[0].member.id);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load members and receivables.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openDebtsFromSender = myReceivables.filter((tx) => tx.receiver_id === senderId);
  const maxReceivableFromSenderPaisa = openDebtsFromSender.reduce(
    (sum, tx) => sum + tx.remaining_paisa,
    0
  );

  // If sender currently owes nothing, default mode cleanly to New Borrowing
  useEffect(() => {
    if (senderId && openDebtsFromSender.length === 0) {
      setIsRepayment(false);
    } else if (senderId && openDebtsFromSender.length > 0) {
      setIsRepayment(true);
    }
    setSelectedTxId('');
  }, [senderId, openDebtsFromSender.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<any>('/api/transactions/receive', {
        method: 'POST',
        body: JSON.stringify({
          sender_id: senderId,
          amount,
          transaction_date: date,
          description,
          notes,
          is_repayment: isRepayment,
          transaction_id: isRepayment && selectedTxId ? selectedTxId : undefined,
          payment_method: paymentMethod,
          idempotency_key: idempotencyKey,
        }),
      });

      const senderObj = friends.find((f) => f.member.id === senderId)?.member;

      if (res.mode === 'REPAYMENT') {
        const rep: EnrichedRepayment | undefined = res.repayments?.[0];
        setConfirmation({
          mode: 'REPAYMENT',
          senderName: senderObj?.full_name ?? 'Member',
          senderIntlPhone: senderObj?.international_phone ?? '',
          amountPaisa: res.total_repaid_paisa,
          remainingPaisa: res.remaining_between_members_paisa,
          receiptNumber: res.receipt_number ?? rep?.receipt_number,
        });
        toast.success(`Repayment of ${formatPKR(res.total_repaid_paisa)} recorded (Receipt ${res.receipt_number}).`);
      } else {
        setConfirmation({
          mode: 'LOAN_RECEIVED',
          senderName: senderObj?.full_name ?? 'Member',
          senderIntlPhone: senderObj?.international_phone ?? '',
          amountPaisa: res.transaction.amount_paisa,
        });
        toast.success(`Recorded ${formatPKR(res.transaction.amount_paisa)} borrowed from ${senderObj?.full_name}.`);
      }

      setAmount('');
      setDescription('');
      setNotes('');
      setIdempotencyKey(generateIdempotencyKey('recv'));
      await loadData();
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not record received money.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Receive Money
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Request or repay funds through the secure approval ledger. Payments are finalized only after the authorized receiver approves.
        </p>
      </div>

      {confirmation && (
        <Card className="border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/50 dark:bg-emerald-950/30">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {confirmation.mode === 'REPAYMENT'
                    ? `Repayment Received · ${formatPKR(confirmation.amountPaisa)} from ${confirmation.senderName}`
                    : `Borrowing Recorded · ${formatPKR(confirmation.amountPaisa)} from ${confirmation.senderName}`}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {confirmation.mode === 'REPAYMENT'
                    ? `Receipt: ${confirmation.receiptNumber} · Remaining balance: ${formatPKR(confirmation.remainingPaisa ?? 0)}`
                    : `Added as a payable debt owed to ${confirmation.senderName}.`}
                </p>
              </div>
            </div>

            {confirmation.mode === 'REPAYMENT' && confirmation.senderIntlPhone && (
              <a
                href={buildClientWhatsAppUrl(
                  confirmation.senderIntlPhone,
                  `Hello ${user?.full_name ?? ''}, ${confirmation.senderName} has repaid Rs. ${formatPlainPKR(confirmation.amountPaisa)}. Remaining outstanding balance is Rs. ${formatPlainPKR(confirmation.remainingPaisa ?? 0)}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Share Receipt via WhatsApp</span>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Record Money Received</CardTitle>
          <CardDescription>
            Choose whether this inflow settles an existing receivable or creates a new borrowing obligation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="recv-sender">Select Sender</Label>
              <Select
                id="recv-sender"
                value={senderId}
                onChange={(e) => setSenderId(e.target.value)}
                required
              >
                {friends.map((f) => (
                  <option key={f.member.id} value={f.member.id}>
                    {f.member.full_name} (Currently owes you {formatPKR(f.receivable_from_member_paisa)})
                  </option>
                ))}
              </Select>
            </div>

            {/* Mode Selection */}
            <div className="space-y-2">
              <Label>Classification</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={openDebtsFromSender.length === 0}
                  onClick={() => setIsRepayment(true)}
                  className={`rounded-xl border p-4 text-left transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRepayment
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Repayment of Existing Debt
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {openDebtsFromSender.length > 0
                      ? `Open receivable: ${formatPKR(maxReceivableFromSenderPaisa)} (${openDebtsFromSender.length} debt${openDebtsFromSender.length > 1 ? 's' : ''})`
                      : 'No open debt from this member'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRepayment(false)}
                  className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                    !isRepayment
                      ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    New Borrowing (Loan Received)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Records a new payable owed by you to this sender
                  </p>
                </button>
              </div>
            </div>

            {isRepayment && openDebtsFromSender.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="recv-debt">Target Debt Transaction</Label>
                  <Select
                    id="recv-debt"
                    value={selectedTxId}
                    onChange={(e) => setSelectedTxId(e.target.value)}
                  >
                    <option value="">Auto-allocate oldest first (FIFO)</option>
                    {openDebtsFromSender.map((tx) => (
                      <option key={tx.id} value={tx.id}>
                        {formatDateDisplay(tx.transaction_date)} · {tx.description} (Rem:{' '}
                        {formatPKR(tx.remaining_paisa)})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="recv-method">Payment Method</Label>
                  <Select
                    id="recv-method"
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
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="recv-amount">Amount (PKR)</Label>
                <Input
                  id="recv-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  placeholder="200"
                  className="font-mono"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="recv-date">Date</Label>
                <Input
                  id="recv-date"
                  type="date"
                  required
                  className="font-mono"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="recv-description">Description</Label>
              <Input
                id="recv-description"
                type="text"
                required
                maxLength={240}
                placeholder={
                  isRepayment ? 'e.g., Partial cash repayment' : 'e.g., Borrowed for urgent expense'
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {!isRepayment && (
              <div>
                <Label htmlFor="recv-notes">Optional Notes</Label>
                <Textarea
                  id="recv-notes"
                  maxLength={500}
                  placeholder="Optional reference details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={submitting || !senderId}>
              <ArrowDownLeft className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Confirming...'
                  : isRepayment
                    ? 'Confirm Repayment Received'
                    : 'Confirm Money Received'}
              </span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
