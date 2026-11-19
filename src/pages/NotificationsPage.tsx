import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { NotificationRecord } from '../../types/index.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

export function NotificationsPage() {
  const { refreshUnreadCount } = useAuth();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadNotifications = async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationRecord[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const handleMarkOne = async (id: string) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not update notification.');
    }
  };

  const handleMarkAll = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      await refreshUnreadCount();
      toast.success('All notifications marked as read.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not mark notifications read.');
    }
  };

  const handlePaymentAction = async (notificationId: string, transactionId: string, action: 'approve' | 'reject') => {
    setActingId(notificationId);
    try {
      await apiFetch(`/api/transactions/${transactionId}/${action}`, { method: 'POST' });
      toast.success(action === 'approve' ? 'Payment approved and balances updated.' : 'Payment request rejected.');
      await loadNotifications();
      await refreshUnreadCount();
    } catch (err: any) {
      toast.error(err?.message ?? `Could not ${action} payment.`);
    } finally {
      setActingId(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Notifications
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Transaction alerts, repayment receipts, and due payment reminders.
          </p>
        </div>

        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll}>
            <CheckCheck className="w-4 h-4" />
            <span>Mark all read ({unreadCount})</span>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Bell className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You have no notifications yet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-5 py-4 flex items-start justify-between gap-4 ${
                    n.is_read ? '' : 'bg-emerald-50/40 dark:bg-emerald-950/20'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {n.title}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                    <p className="font-mono text-xs text-slate-400 dark:text-slate-500 mt-1">
                      {new Date(n.created_at).toLocaleString('en-GB')}
                    </p>
                  </div>

                  {!n.is_read && (
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      {n.related_entity_id &&
                        (n.notification_type === 'MONEY_GIVEN' || n.title.toLowerCase().includes('recorded')) && (
                        <>
                          <Button
                            size="sm"
                            disabled={actingId === n.id}
                            onClick={() => handlePaymentAction(n.id, n.related_entity_id!, 'approve')}
                          >
                            <Check className="w-4 h-4" />
                            <span>Accept</span>
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={actingId === n.id}
                            onClick={() => handlePaymentAction(n.id, n.related_entity_id!, 'reject')}
                          >
                            <X className="w-4 h-4" />
                            <span>Reject</span>
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleMarkOne(n.id)}>
                        <Check className="w-4 h-4" />
                        <span>Read</span>
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
