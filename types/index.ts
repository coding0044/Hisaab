export const TRANSACTION_TYPES = [
  'MONEY_GIVEN',
  'MONEY_RECEIVED',
  'REPAYMENT',
  'REVERSAL',
  'ADJUSTMENT',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'PENDING',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PARTIALLY_PAID',
  'PAID',
  'REVERSED',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = [
  'Cash',
  'Bank Transfer',
  'JazzCash',
  'Easypaisa',
  'SadaPay / NayaPay',
  'Other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REMINDER_STATUSES = ['UPCOMING', 'OVERDUE', 'COMPLETED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'MONEY_GIVEN',
  'MONEY_RECEIVED',
  'REPAYMENT',
  'REMINDER',
  'REVERSAL',
  'SECURITY',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface PublicMember {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  international_phone: string;
  avatar_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionRecord {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount_paisa: number;
  repaid_amount_paisa: number;
  currency: 'PKR';
  transaction_type: TransactionType;
  description: string;
  notes?: string;
  transaction_date: string;
  status: TransactionStatus;
  reversed_transaction_id?: string | null;
  idempotency_key: string;
  created_by: string;
  created_at: string;
  approved_at?: string | null;
  rejected_at?: string | null;
  approved_by?: string | null;
  source_transaction_id?: string | null;
}

export interface EnrichedTransaction extends TransactionRecord {
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  sender_international_phone: string;
  receiver_name: string;
  receiver_email: string;
  receiver_phone: string;
  receiver_international_phone: string;
  remaining_paisa: number;
}

export interface RepaymentRecord {
  id: string;
  transaction_id: string;
  payer_id: string;
  receiver_id: string;
  amount_paisa: number;
  repayment_date: string;
  payment_method: PaymentMethod;
  description: string;
  idempotency_key: string;
  receipt_number: string;
  is_reversed: boolean;
  created_by: string;
  created_at: string;
}

export interface EnrichedRepayment extends RepaymentRecord {
  payer_name: string;
  payer_international_phone: string;
  receiver_name: string;
  receiver_international_phone: string;
  transaction_description: string;
  transaction_date: string;
  remaining_on_transaction_paisa: number;
  remaining_between_members_paisa: number;
}

export interface LedgerEntry {
  id: string;
  entry_kind: 'TRANSACTION' | 'REPAYMENT';
  reference_code: string;
  date: string;
  created_at: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_name: string;
  amount_paisa: number;
  repaid_amount_paisa: number;
  remaining_paisa: number;
  transaction_type: TransactionType;
  description: string;
  notes?: string;
  payment_method?: string;
  status: TransactionStatus;
  linked_transaction_id?: string;
}

export interface ReminderRecord {
  id: string;
  created_by: string;
  recipient_id: string;
  title: string;
  amount_paisa: number;
  reminder_date: string;
  reminder_time: string;
  description: string;
  status: 'PENDING' | 'COMPLETED';
  computed_status: ReminderStatus;
  completed_at?: string | null;
  created_at: string;
}

export interface EnrichedReminder extends ReminderRecord {
  creator_name: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_international_phone: string;
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  is_read: boolean;
  related_entity_id?: string | null;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: string;
  created_at: string;
}

export interface DirectionalPairBalance {
  creditor_id: string;
  creditor_name: string;
  debtor_id: string;
  debtor_name: string;
  total_given_paisa: number;
  total_repaid_paisa: number;
  outstanding_paisa: number;
  pending_transactions_count: number;
}

export interface MemberPairCardSummary {
  member: PublicMember;
  /** Money the logged-in user gave to this friend */
  given_to_member_paisa: number;
  /** Repayments this friend made to the logged-in user */
  received_from_member_paisa: number;
  /** Remaining receivable from this friend */
  receivable_from_member_paisa: number;
  /** Money this friend gave to the logged-in user */
  borrowed_from_member_paisa: number;
  /** Repayments the logged-in user made to this friend */
  repaid_to_member_paisa: number;
  /** Remaining payable to this friend */
  payable_to_member_paisa: number;
  /** Aggregate total money this friend has given across the group */
  member_total_given_paisa: number;
  /** Aggregate total repayments this friend has received */
  member_total_received_paisa: number;
  /** Aggregate total repayments this friend has made */
  member_total_repaid_paisa: number;
  /** Net standing for this friend relative to current user (receivable - payable) */
  net_with_member_paisa: number;
}

export interface DashboardMetrics {
  total_given_paisa: number;
  total_borrowed_paisa: number;
  total_received_paisa: number;
  total_repaid_paisa: number;
  total_receivable_paisa: number;
  total_payable_paisa: number;
  net_outstanding_paisa: number;
}

export interface MonthlyActivityPoint {
  month: string;
  label: string;
  given_pkr: number;
  borrowed_pkr: number;
  repayments_received_pkr: number;
  repayments_paid_pkr: number;
}

export interface DashboardPayload {
  current_user: PublicMember;
  metrics: DashboardMetrics;
  member_summaries: MemberPairCardSummary[];
  directional_balances: DirectionalPairBalance[];
  recent_transactions: LedgerEntry[];
  pending_debts: EnrichedTransaction[];
  upcoming_reminders: EnrichedReminder[];
  recent_notifications: NotificationRecord[];
  unread_notifications_count: number;
  monthly_activity: MonthlyActivityPoint[];
}
