import { ArrowUpRight, CheckCircle2, MessageCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { EnrichedTransaction, MemberPairCardSummary } from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { MemberAvatar } from '../components/ui/member-avatar.tsx';
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

export function GiveMoneyPage() {
  const { user, refreshUnreadCount } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedMember = searchParams.get('member') ?? '';

  const [friends, setFriends] = useState<MemberPairCardSummary[]>([]);
  const [receiverId, setReceiverId] = useState(preselectedMember);
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(todayISODate());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey('give'));
  const [submitting, setSubmitting] = useState(false);
  const [savedTx, setSavedTx] = useState<EnrichedTransaction | null>(null);

  const loadFriends = async () => {
    try {
      const data = await apiFetch<{ other_members: MemberPairCardSummary[] }>('/api/members');
      setFriends(data.other_members);
      if (!receiverId && data.other_members.length > 0) {
        const match = data.other_members.find((m) => m.member.id === preselectedMember);
        setReceiverId(match ? match.member.id : data.other_members[0].member.id);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load members.');
    }
  };

  useEffect(() => {
    loadFriends();
  }, []);

  const selectedFriend = friends.find((f) => f.member.id === receiverId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ transaction: EnrichedTransaction }>('/api/transactions/give', {
        method: 'POST',
        body: JSON.stringify({
          receiver_id: receiverId,
          amount,
          transaction_date: transactionDate,
          description,
          notes,
          idempotency_key: idempotencyKey,
        }),
      });
      setSavedTx(res.transaction);
      toast.success(`Recorded ${formatPKR(res.transaction.amount_paisa)} given to ${res.transaction.receiver_name}`);
      setAmount('');
      setDescription('');
      setNotes('');
      setIdempotencyKey(generateIdempotencyKey('give'));
      await loadFriends();
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappUrl = savedTx
    ? buildClientWhatsAppUrl(
        savedTx.receiver_international_phone,
        `Hello ${savedTx.receiver_name}, ${savedTx.sender_name} has recorded Rs. ${formatPlainPKR(savedTx.amount_paisa)} as money given to you. Please check your Hisaab account.`
      )
    : '';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Give Money
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Send a payment request to a friend. The receiver must approve it before balances change.
        </p>
      </div>

      {savedTx && (
        <Card className="border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/50 dark:bg-emerald-950/30">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Transaction Saved · {formatPKR(savedTx.amount_paisa)} to {savedTx.receiver_name}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {savedTx.description} · {formatDateDisplay(savedTx.transaction_date)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Notify via WhatsApp</span>
              </a>
              <Link to="/transactions">
                <Button variant="outline" size="sm">
                  View Ledger
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Record Lending Entry</CardTitle>
            <CardDescription>
              Creates an immutable PKR lending record between you and the selected recipient
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="give-recipient">Select Recipient</Label>
                <Select
                  id="give-recipient"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  required
                >
                  {friends.map((f) => (
                    <option key={f.member.id} value={f.member.id}>
                      {f.member.full_name} ({f.member.phone_number})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="give-amount">Amount (PKR)</Label>
                  <Input
                    id="give-amount"
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="500"
                    className="font-mono"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="give-date">Transaction Date</Label>
                  <Input
                    id="give-date"
                    type="date"
                    required
                    className="font-mono"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="give-description">Description</Label>
                <Input
                  id="give-description"
                  type="text"
                  required
                  maxLength={240}
                  placeholder="e.g., Dinner split, Fuel advance, Cash loan"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="give-notes">Optional Notes</Label>
                <Textarea
                  id="give-notes"
                  maxLength={500}
                  placeholder="Any additional reference or repayment arrangement..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={submitting || !receiverId}>
                <ArrowUpRight className="w-4 h-4" />
                <span>{submitting ? 'Saving Transaction...' : 'Save Transaction'}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Live Counterparty Context Card */}
        <Card className="lg:col-span-5 h-fit">
          <CardHeader>
            <CardTitle>Current Balance with Recipient</CardTitle>
            <CardDescription>Tracked separately from opposite debts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedFriend ? (
              <>
                <div className="flex items-center gap-3">
                  <MemberAvatar
                    name={selectedFriend.member.full_name}
                    avatarUrl={selectedFriend.member.avatar_url}
                    size="md"
                  />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {selectedFriend.member.full_name}
                    </p>
                    <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {selectedFriend.member.phone_number}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Currently owes you</span>
                    <span className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {formatPKR(selectedFriend.receivable_from_member_paisa)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">You currently owe them</span>
                    <span className="font-mono font-semibold tabular-nums text-red-700 dark:text-red-400">
                      {formatPKR(selectedFriend.payable_to_member_paisa)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading member details...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
