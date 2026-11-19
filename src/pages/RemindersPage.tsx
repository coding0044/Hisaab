import {
  CalendarClock,
  CheckCircle2,
  Edit3,
  MessageCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { EnrichedReminder, PublicMember } from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Dialog } from '../components/ui/dialog.tsx';
import { Input, Label, Select, Textarea } from '../components/ui/input.tsx';
import { ReminderStatusLabel } from '../components/ui/status-label.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import {
  buildClientWhatsAppUrl,
  formatDateDisplay,
  formatPKR,
  formatPlainPKR,
  todayISODate,
} from '../lib/utils.ts';

interface RemindersPayload {
  reminders: EnrichedReminder[];
  members: PublicMember[];
}

export function RemindersPage() {
  const { user, refreshUnreadCount } = useAuth();
  const [data, setData] = useState<RemindersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'OVERDUE' | 'COMPLETED'>('UPCOMING');

  // Create form state
  const [recipientId, setRecipientId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [reminderDate, setReminderDate] = useState(todayISODate());
  const [reminderTime, setReminderTime] = useState('18:00');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit & Delete modals
  const [editing, setEditing] = useState<EnrichedReminder | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EnrichedReminder | null>(null);

  const loadReminders = async () => {
    try {
      const payload = await apiFetch<RemindersPayload>('/api/reminders');
      setData(payload);
      const others = payload.members.filter((m) => m.id !== user?.id);
      if (!recipientId && others.length > 0) {
        setRecipientId(others[0].id);
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load reminders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, [user?.id]);

  const otherMembers = (data?.members ?? []).filter((m) => m.id !== user?.id);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          recipient_id: recipientId,
          title,
          amount,
          reminder_date: reminderDate,
          reminder_time: reminderTime,
          description,
        }),
      });
      toast.success('Reminder scheduled and notification dispatched.');
      setTitle('');
      setAmount('');
      setDescription('');
      await loadReminders();
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not create reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkCompleted = async (rem: EnrichedReminder) => {
    try {
      await apiFetch(`/api/reminders/${rem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: rem.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED',
        }),
      });
      toast.success(
        rem.status === 'COMPLETED' ? 'Reminder reopened.' : 'Reminder marked completed.'
      );
      await loadReminders();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update reminder.');
    }
  };

  const openEditModal = (rem: EnrichedReminder) => {
    setEditing(rem);
    setEditTitle(rem.title);
    setEditAmount(formatPlainPKR(rem.amount_paisa));
    setEditDate(rem.reminder_date);
    setEditTime(rem.reminder_time);
    setEditDescription(rem.description);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiFetch(`/api/reminders/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTitle,
          amount: editAmount,
          reminder_date: editDate,
          reminder_time: editTime,
          description: editDescription,
        }),
      });
      toast.success('Reminder updated.');
      setEditing(null);
      await loadReminders();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update reminder.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/reminders/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Reminder deleted.');
      setDeleteTarget(null);
      await loadReminders();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not delete reminder.');
    }
  };

  const reminders = data?.reminders ?? [];
  const upcoming = reminders.filter((r) => r.computed_status === 'UPCOMING');
  const overdue = reminders.filter((r) => r.computed_status === 'OVERDUE');
  const completed = reminders.filter((r) => r.computed_status === 'COMPLETED');

  const visibleList =
    activeTab === 'UPCOMING' ? upcoming : activeTab === 'OVERDUE' ? overdue : completed;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Reminders
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Schedule repayment reminders with automatic overdue notifications and direct WhatsApp follow-ups.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Create Reminder Form */}
        <Card className="lg:col-span-5 h-fit">
          <CardHeader>
            <CardTitle>Create Reminder</CardTitle>
            <CardDescription>Notifies the recipient inside Hisaab</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="rem-member">Select Member</Label>
                <Select
                  id="rem-member"
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  required
                >
                  {otherMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.phone_number})
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="rem-title">Reminder Title</Label>
                <Input
                  id="rem-title"
                  type="text"
                  required
                  placeholder="e.g., Dinner loan repayment"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="rem-amount">Amount (PKR)</Label>
                <Input
                  id="rem-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  placeholder="300"
                  className="font-mono"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="rem-date">Date</Label>
                  <Input
                    id="rem-date"
                    type="date"
                    required
                    className="font-mono"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="rem-time">Time (PKT)</Label>
                  <Input
                    id="rem-time"
                    type="time"
                    required
                    className="font-mono"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="rem-desc">Description</Label>
                <Textarea
                  id="rem-desc"
                  placeholder="Optional note for this reminder..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={saving || !recipientId}>
                <Plus className="w-4 h-4" />
                <span>{saving ? 'Scheduling...' : 'Create Reminder'}</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Reminders List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('UPCOMING')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'UPCOMING'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Upcoming ({upcoming.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('OVERDUE')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'OVERDUE'
                  ? 'bg-white dark:bg-slate-900 text-red-700 dark:text-red-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Overdue ({overdue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('COMPLETED')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'COMPLETED'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Completed ({completed.length})
            </button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">Loading reminders...</div>
              ) : visibleList.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <CalendarClock className="w-8 h-8 mx-auto text-slate-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No {activeTab.toLowerCase()} reminders right now.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleList.map((rem) => {
                    const waUrl = buildClientWhatsAppUrl(
                      rem.recipient_international_phone,
                      `Hello ${rem.recipient_name}, this is a friendly reminder that you have Rs. ${formatPlainPKR(rem.amount_paisa)} pending to repay ${rem.creator_name}.`
                    );
                    return (
                      <div key={rem.id} className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                                {rem.title}
                              </h3>
                              <ReminderStatusLabel status={rem.computed_status} />
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              From {rem.creator_name} to {rem.recipient_name} ·{' '}
                              {formatDateDisplay(rem.reminder_date)} at {rem.reminder_time} PKT
                            </p>
                            {rem.description && (
                              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                                {rem.description}
                              </p>
                            )}
                          </div>

                          <p className="font-mono text-lg font-bold tabular-nums shrink-0">
                            {formatPKR(rem.amount_paisa)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {rem.computed_status !== 'COMPLETED' && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>WhatsApp Reminder</span>
                            </a>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkCompleted(rem)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {rem.status === 'COMPLETED' ? 'Reopen' : 'Mark Completed'}
                            </span>
                          </Button>

                          <Button variant="ghost" size="sm" onClick={() => openEditModal(rem)}>
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 dark:text-red-400"
                            onClick={() => setDeleteTarget(rem)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Reminder"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <Label htmlFor="edit-rem-title">Title</Label>
            <Input
              id="edit-rem-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-rem-amount">Amount (PKR)</Label>
            <Input
              id="edit-rem-amount"
              type="number"
              step="0.01"
              min="1"
              className="font-mono"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-rem-date">Date</Label>
              <Input
                id="edit-rem-date"
                type="date"
                className="font-mono"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-rem-time">Time</Label>
              <Input
                id="edit-rem-time"
                type="time"
                className="font-mono"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-rem-desc">Description</Label>
            <Textarea
              id="edit-rem-desc"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Reminder"
        description={deleteTarget ? `Delete "${deleteTarget.title}" permanently?` : undefined}
        maxWidthClass="max-w-sm"
      >
        <div className="flex justify-end gap-2.5 pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
