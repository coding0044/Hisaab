import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { TransactionStatus, TransactionType } from '../../types/index.ts';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPKR(paisa: number, options?: { signed?: boolean }): string {
  const safePaisa = Number.isFinite(paisa) ? Math.trunc(paisa) : 0;
  const isNegative = safePaisa < 0;
  const absPaisa = Math.abs(safePaisa);
  const whole = Math.floor(absPaisa / 100);
  const frac = absPaisa % 100;
  const formattedWhole = whole.toLocaleString('en-PK');
  const formattedFrac = frac > 0 ? `.${String(frac).padStart(2, '0')}` : '';
  const signPrefix = isNegative ? '-' : options?.signed && safePaisa > 0 ? '+' : '';
  return `${signPrefix}Rs. ${formattedWhole}${formattedFrac}`;
}

export function formatPlainPKR(paisa: number): string {
  const absPaisa = Math.abs(Math.trunc(paisa || 0));
  const whole = Math.floor(absPaisa / 100);
  const frac = absPaisa % 100;
  return frac > 0 ? `${whole}.${String(frac).padStart(2, '0')}` : String(whole);
}

export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function generateIdempotencyKey(prefix = 'fh'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatTransactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case 'MONEY_GIVEN':
      return 'Money Given';
    case 'MONEY_RECEIVED':
      return 'Money Received';
    case 'REPAYMENT':
      return 'Repayment';
    case 'REVERSAL':
      return 'Reversal';
    case 'ADJUSTMENT':
      return 'Adjustment';
  }
}

export function formatStatusLabel(status: TransactionStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'PENDING_APPROVAL':
      return 'Pending Approval';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'PARTIALLY_PAID':
      return 'Partially Paid';
    case 'PAID':
      return 'Paid';
    case 'REVERSED':
      return 'Reversed';
  }
}

export function buildClientWhatsAppUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('92')
    ? digits
    : digits.startsWith('0')
      ? `92${digits.slice(1)}`
      : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
