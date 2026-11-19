import { AlertTriangle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import type { ReminderStatus, TransactionStatus } from '../../../types/index.ts';
import { formatStatusLabel } from '../../lib/utils.ts';

/**
 * Semantic status indicator paired with icon + text (never color alone, never candy pill capsules).
 */
export function TransactionStatusLabel({ status }: { status: TransactionStatus }) {
  const config: Record<
    TransactionStatus,
    { icon: typeof CheckCircle2; textClass: string }
  > = {
    PAID: {
      icon: CheckCircle2,
      textClass: 'text-emerald-700 dark:text-emerald-400',
    },
    PARTIALLY_PAID: {
      icon: Clock,
      textClass: 'text-amber-700 dark:text-amber-400',
    },
    PENDING: {
      icon: Clock,
      textClass: 'text-slate-600 dark:text-slate-300',
    },
    PENDING_APPROVAL: {
      icon: Clock,
      textClass: 'text-amber-700 dark:text-amber-400',
    },
    APPROVED: {
      icon: CheckCircle2,
      textClass: 'text-emerald-700 dark:text-emerald-400',
    },
    REJECTED: {
      icon: AlertTriangle,
      textClass: 'text-red-700 dark:text-red-400',
    },
    REVERSED: {
      icon: RotateCcw,
      textClass: 'text-red-700 dark:text-red-400',
    },
  };

  const { icon: Icon, textClass } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{formatStatusLabel(status)}</span>
    </span>
  );
}

export function ReminderStatusLabel({ status }: { status: ReminderStatus }) {
  if (status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Completed</span>
      </span>
    );
  }
  if (status === 'OVERDUE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Overdue</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Upcoming</span>
    </span>
  );
}
