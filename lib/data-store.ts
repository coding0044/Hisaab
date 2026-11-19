import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';
import { AuditLogModel } from '../models/AuditLog.ts';
import { NotificationModel } from '../models/Notification.ts';
import { ReminderModel } from '../models/Reminder.ts';
import { RepaymentModel } from '../models/Repayment.ts';
import { TransactionModel } from '../models/Transaction.ts';
import { UserModel } from '../models/User.ts';
import type {
  AuditLogRecord,
  DashboardPayload,
  EnrichedReminder,
  EnrichedRepayment,
  EnrichedTransaction,
  LedgerEntry,
  NotificationRecord,
  NotificationType,
  PaymentMethod,
  PublicMember,
  ReminderRecord,
  ReminderStatus,
  RepaymentRecord,
  TransactionRecord,
  TransactionStatus,
  TransactionType,
} from '../types/index.ts';
import { hashPassword, verifyPassword } from './auth.ts';
import {
  buildRepaidByTransactionMap,
  computeDashboardMetrics,
  computeDirectionalPairBalances,
  computeFIFOAllocations,
  computeMemberSummaries,
  computeMonthlySeries,
  formatPaisaPlain,
  getTransactionRemainingPaisa,
  isDebtOriginatingTransaction,
  parsePkrToPaisa,
} from './financial-calculations.ts';
import {
  connectToDatabase,
  createObjectIdString,
  isMongoConfigured,
  isValidObjectId,
  paisaToDecimal128,
} from './mongodb.ts';
import { assertDistinctMembers, assertUserIsParticipant, assertValidMemberId } from './permissions.ts';
import { REGISTERED_MEMBERS_BLUEPRINT, resolveSeedPassword } from './seed-data.ts';
import { toWhatsAppInternationalNumber } from './whatsapp.ts';

interface StoredUser {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  phone_number: string;
  international_phone: string;
  avatar_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  available_balance_paisa: number;
  fund_sources: Array<{
    source_transaction_id: string;
    original_sender_id: string;
    remaining_paisa: number;
  }>;
}

interface StoredReminderRaw {
  id: string;
  created_by: string;
  recipient_id: string;
  title: string;
  amount_paisa: number;
  reminder_date: string;
  reminder_time: string;
  description: string;
  status: 'PENDING' | 'COMPLETED';
  completed_at?: string | null;
  notified_overdue?: boolean;
  created_at: string;
}

interface LocalDatabaseState {
  users: StoredUser[];
  transactions: TransactionRecord[];
  repayments: RepaymentRecord[];
  reminders: StoredReminderRaw[];
  notifications: NotificationRecord[];
  audit_logs: AuditLogRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'friends_hisaab.json');

let writeLock: Promise<void> = Promise.resolve();
function withLocalWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function readLocalState(): LocalDatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const empty: LocalDatabaseState = {
      users: [],
      transactions: [],
      repayments: [],
      reminders: [],
      notifications: [],
      audit_logs: [],
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(empty, null, 2), 'utf8');
    return empty;
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw) as LocalDatabaseState;
}

function writeLocalState(state: LocalDatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function sanitizeMember(user: StoredUser): PublicMember {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    phone_number: user.phone_number,
    international_phone: user.international_phone,
    avatar_url: user.avatar_url,
    is_active: user.is_active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function mapMongoUser(doc: any): StoredUser {
  return {
    id: String(doc._id),
    full_name: doc.full_name,
    email: doc.email,
    password_hash: doc.password_hash,
    phone_number: doc.phone_number,
    international_phone: doc.international_phone,
    avatar_url: doc.avatar_url || '',
    is_active: Boolean(doc.is_active),
    created_at: new Date(doc.created_at).toISOString(),
    updated_at: new Date(doc.updated_at).toISOString(),
    available_balance_paisa: Number(doc.available_balance_paisa ?? 100000000),
    fund_sources: Array.isArray(doc.fund_sources)
      ? doc.fund_sources.map((source: any) => ({
          source_transaction_id: String(source.source_transaction_id),
          original_sender_id: String(source.original_sender_id),
          remaining_paisa: Number(source.remaining_paisa),
        }))
      : [],
  };
}

function mapMongoTransaction(doc: any): TransactionRecord {
  return {
    id: String(doc._id),
    sender_id: String(doc.sender_id),
    receiver_id: String(doc.receiver_id),
    amount_paisa: Number(doc.amount_paisa),
    repaid_amount_paisa: Number(doc.repaid_amount_paisa ?? 0),
    currency: 'PKR',
    transaction_type: doc.transaction_type as TransactionType,
    description: doc.description,
    notes: doc.notes ?? '',
    transaction_date: doc.transaction_date,
    status: doc.status as TransactionStatus,
    reversed_transaction_id: doc.reversed_transaction_id
      ? String(doc.reversed_transaction_id)
      : null,
    idempotency_key: doc.idempotency_key,
    created_by: String(doc.created_by),
    created_at: new Date(doc.created_at).toISOString(),
    approved_at: doc.approved_at ? new Date(doc.approved_at).toISOString() : null,
    rejected_at: doc.rejected_at ? new Date(doc.rejected_at).toISOString() : null,
    approved_by: doc.approved_by ? String(doc.approved_by) : null,
    source_transaction_id: doc.source_transaction_id ? String(doc.source_transaction_id) : null,
  };
}

function mapMongoRepayment(doc: any): RepaymentRecord {
  return {
    id: String(doc._id),
    transaction_id: String(doc.transaction_id),
    payer_id: String(doc.payer_id),
    receiver_id: String(doc.receiver_id),
    amount_paisa: Number(doc.amount_paisa),
    repayment_date: doc.repayment_date,
    payment_method: doc.payment_method as PaymentMethod,
    description: doc.description,
    idempotency_key: doc.idempotency_key,
    receipt_number: doc.receipt_number,
    is_reversed: Boolean(doc.is_reversed),
    created_by: String(doc.created_by),
    created_at: new Date(doc.created_at).toISOString(),
  };
}

function mapMongoReminder(doc: any): StoredReminderRaw {
  return {
    id: String(doc._id),
    created_by: String(doc.created_by),
    recipient_id: String(doc.recipient_id),
    title: doc.title,
    amount_paisa: Number(doc.amount_paisa),
    reminder_date: doc.reminder_date,
    reminder_time: doc.reminder_time,
    description: doc.description ?? '',
    status: doc.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
    completed_at: doc.completed_at ? new Date(doc.completed_at).toISOString() : null,
    notified_overdue: Boolean(doc.notified_overdue),
    created_at: new Date(doc.created_at).toISOString(),
  };
}

function mapMongoNotification(doc: any): NotificationRecord {
  return {
    id: String(doc._id),
    user_id: String(doc.user_id),
    title: doc.title,
    message: doc.message,
    notification_type: doc.notification_type as NotificationType,
    is_read: Boolean(doc.is_read),
    related_entity_id: doc.related_entity_id ?? null,
    created_at: new Date(doc.created_at).toISOString(),
  };
}

function mapMongoAuditLog(doc: any): AuditLogRecord {
  return {
    id: String(doc._id),
    user_id: String(doc.user_id),
    action: doc.action,
    entity_type: doc.entity_type,
    entity_id: String(doc.entity_id),
    details: doc.details ?? '',
    created_at: new Date(doc.created_at).toISOString(),
  };
}

function getKarachiNowDateTime(): { date: string; time: string } {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const y = dateParts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = dateParts.find((p) => p.type === 'month')?.value ?? '01';
  const d = dateParts.find((p) => p.type === 'day')?.value ?? '01';
  const hh = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = timeParts.find((p) => p.type === 'minute')?.value ?? '00';
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

function computeReminderStatus(raw: StoredReminderRaw): ReminderStatus {
  if (raw.status === 'COMPLETED') return 'COMPLETED';
  const pktNow = getKarachiNowDateTime();
  const dueStamp = `${raw.reminder_date} ${raw.reminder_time}`;
  const nowStamp = `${pktNow.date} ${pktNow.time}`;
  return dueStamp < nowStamp ? 'OVERDUE' : 'UPCOMING';
}

function generateReceiptNumber(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FH-RCP-${ymd}-${rand}`;
}

async function runWithMongoTransaction<T>(
  work: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err: any) {
    // Standalone MongoDB instances without replica set throw code 20 / IllegalOperation on transactions
    const msg = String(err?.message ?? '');
    if (
      msg.includes('Transaction numbers are only allowed on a replica set') ||
      msg.includes('replica set')
    ) {
      return work(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

/**
 * Idempotently initialize the exact 3 registered members in MongoDB Atlas or local store.
 */
export async function ensureSeeded(): Promise<PublicMember[]> {
  if (isMongoConfigured()) {
    await connectToDatabase();
    await Promise.all([
      UserModel.syncIndexes(),
      TransactionModel.syncIndexes(),
      RepaymentModel.syncIndexes(),
      ReminderModel.syncIndexes(),
      NotificationModel.syncIndexes(),
      AuditLogModel.syncIndexes(),
    ]);

    for (const member of REGISTERED_MEMBERS_BLUEPRINT) {
      const existing = await UserModel.findOne({ email: member.email }).lean();
      if (!existing) {
        const password_hash = await hashPassword(resolveSeedPassword(member));
        await UserModel.create({
          full_name: member.full_name,
          email: member.email,
          password_hash,
          phone_number: member.phone_number,
          international_phone: member.international_phone,
          avatar_url: member.avatar_url,
          is_active: true,
        });
      } else {
        const updatePatch: Record<string, any> = {};
        if (
          (await verifyPassword('Hisaab@2026', (existing as any).password_hash)) ||
          (member.email === 'faraz.maju@gmail.com' &&
            (await verifyPassword('Faraz Ahmed', (existing as any).password_hash)))
        ) {
          updatePatch.password_hash = await hashPassword(resolveSeedPassword(member));
        }
        if ((existing as any).avatar_url !== member.avatar_url) {
          updatePatch.avatar_url = member.avatar_url;
        }
        if (Object.keys(updatePatch).length > 0) {
          await UserModel.updateOne({ _id: (existing as any)._id }, { $set: updatePatch });
        }
      }
    }
    const users = await UserModel.find({ is_active: true }).sort({ created_at: 1 }).lean();
    return users.map((u) => sanitizeMember(mapMongoUser(u)));
  }

  return withLocalWriteLock(async () => {
    const state = readLocalState();
    let changed = false;
    for (const member of REGISTERED_MEMBERS_BLUEPRINT) {
      const existing = state.users.find((u) => u.email === member.email);
      if (!existing) {
        const now = new Date().toISOString();
        const password_hash = await hashPassword(resolveSeedPassword(member));
        state.users.push({
          id: createObjectIdString(),
          full_name: member.full_name,
          email: member.email,
          password_hash,
          phone_number: member.phone_number,
          international_phone: member.international_phone,
          avatar_url: member.avatar_url,
          is_active: true,
          available_balance_paisa: 100000000,
          fund_sources: [],
          created_at: now,
          updated_at: now,
        });
        changed = true;
      } else {
        if (
          (await verifyPassword('Hisaab@2026', existing.password_hash)) ||
          (member.email === 'faraz.maju@gmail.com' &&
            (await verifyPassword('Faraz Ahmed', existing.password_hash)))
        ) {
          existing.password_hash = await hashPassword(resolveSeedPassword(member));
          existing.updated_at = new Date().toISOString();
          changed = true;
        }
        if (existing.avatar_url !== member.avatar_url) {
          existing.avatar_url = member.avatar_url;
          existing.updated_at = new Date().toISOString();
          changed = true;
        }
      }
    }
    if (changed) {
      writeLocalState(state);
    }
    return state.users.map(sanitizeMember);
  });
}

export async function findStoredUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = email.trim().toLowerCase();
  if (isMongoConfigured()) {
    await connectToDatabase();
    const doc = await UserModel.findOne({ email: normalized, is_active: true }).lean();
    return doc ? mapMongoUser(doc) : null;
  }
  const state = readLocalState();
  return state.users.find((u) => u.email === normalized && u.is_active) ?? null;
}

export async function findStoredUserById(id: string): Promise<StoredUser | null> {
  if (!isValidObjectId(id)) return null;
  if (isMongoConfigured()) {
    await connectToDatabase();
    const doc = await UserModel.findOne({ _id: id, is_active: true }).lean();
    return doc ? mapMongoUser(doc) : null;
  }
  const state = readLocalState();
  return state.users.find((u) => u.id === id && u.is_active) ?? null;
}

export async function listPublicMembers(): Promise<PublicMember[]> {
  if (isMongoConfigured()) {
    await connectToDatabase();
    const docs = await UserModel.find({ is_active: true }).sort({ created_at: 1 }).lean();
    return docs.map((d) => sanitizeMember(mapMongoUser(d)));
  }
  const state = readLocalState();
  return state.users.filter((u) => u.is_active).map(sanitizeMember);
}

export async function updateMemberPhone(
  userId: string,
  phoneNumber: string
): Promise<PublicMember> {
  assertValidMemberId(userId, 'user ID');
  const intl = toWhatsAppInternationalNumber(phoneNumber);
  if (intl.length < 11) {
    throw new Error('Enter a valid Pakistani mobile number (e.g., 03332853138).');
  }

  if (isMongoConfigured()) {
    await connectToDatabase();
    const updated = await UserModel.findByIdAndUpdate(
      userId,
      { $set: { phone_number: phoneNumber.trim(), international_phone: intl } },
      { new: true }
    ).lean();
    if (!updated) throw new Error('Member not found.');
    await AuditLogModel.create({
      user_id: userId,
      action: 'PROFILE_PHONE_UPDATED',
      entity_type: 'User',
      entity_id: userId,
      details: `Updated WhatsApp number to ${phoneNumber.trim()}`,
    });
    return sanitizeMember(mapMongoUser(updated));
  }

  return withLocalWriteLock(async () => {
    const state = readLocalState();
    const user = state.users.find((u) => u.id === userId);
    if (!user) throw new Error('Member not found.');
    user.phone_number = phoneNumber.trim();
    user.international_phone = intl;
    user.updated_at = new Date().toISOString();
    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: userId,
      action: 'PROFILE_PHONE_UPDATED',
      entity_type: 'User',
      entity_id: userId,
      details: `Updated WhatsApp number to ${user.phone_number}`,
      created_at: new Date().toISOString(),
    });
    writeLocalState(state);
    return sanitizeMember(user);
  });
}

export async function updateMemberPassword(userId: string, newPasswordHash: string): Promise<void> {
  assertValidMemberId(userId, 'user ID');
  if (isMongoConfigured()) {
    await connectToDatabase();
    await UserModel.findByIdAndUpdate(userId, { $set: { password_hash: newPasswordHash } });
    await NotificationModel.create({
      user_id: userId,
      title: 'Password updated',
      message: 'Your Friends Hisaab account password was changed successfully.',
      notification_type: 'SECURITY',
      is_read: false,
      related_entity_id: userId,
    });
    await AuditLogModel.create({
      user_id: userId,
      action: 'PASSWORD_CHANGED',
      entity_type: 'User',
      entity_id: userId,
      details: 'Member updated account password',
    });
    return;
  }

  await withLocalWriteLock(async () => {
    const state = readLocalState();
    const user = state.users.find((u) => u.id === userId);
    if (!user) throw new Error('Member not found.');
    const now = new Date().toISOString();
    user.password_hash = newPasswordHash;
    user.updated_at = now;
    state.notifications.push({
      id: createObjectIdString(),
      user_id: userId,
      title: 'Password updated',
      message: 'Your Friends Hisaab account password was changed successfully.',
      notification_type: 'SECURITY',
      is_read: false,
      related_entity_id: userId,
      created_at: now,
    });
    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: userId,
      action: 'PASSWORD_CHANGED',
      entity_type: 'User',
      entity_id: userId,
      details: 'Member updated account password',
      created_at: now,
    });
    writeLocalState(state);
  });
}

async function loadAllCoreEntities(): Promise<{
  members: PublicMember[];
  transactions: TransactionRecord[];
  repayments: RepaymentRecord[];
  reminders: StoredReminderRaw[];
}> {
  if (isMongoConfigured()) {
    await connectToDatabase();
    const [uDocs, tDocs, rDocs, remDocs] = await Promise.all([
      UserModel.find({ is_active: true }).sort({ created_at: 1 }).lean(),
      TransactionModel.find({}).sort({ transaction_date: -1, created_at: -1 }).lean(),
      RepaymentModel.find({}).sort({ repayment_date: -1, created_at: -1 }).lean(),
      ReminderModel.find({}).sort({ reminder_date: 1, reminder_time: 1 }).lean(),
    ]);
    return {
      members: uDocs.map((d) => sanitizeMember(mapMongoUser(d))),
      transactions: tDocs.map(mapMongoTransaction),
      repayments: rDocs.map(mapMongoRepayment),
      reminders: remDocs.map(mapMongoReminder),
    };
  }

  const state = readLocalState();
  return {
    members: state.users.filter((u) => u.is_active).map(sanitizeMember),
    transactions: [...state.transactions].sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date) || b.created_at.localeCompare(a.created_at)
    ),
    repayments: [...state.repayments].sort((a, b) =>
      b.repayment_date.localeCompare(a.repayment_date) || b.created_at.localeCompare(a.created_at)
    ),
    reminders: [...state.reminders].sort((a, b) =>
      a.reminder_date.localeCompare(b.reminder_date) || a.reminder_time.localeCompare(b.reminder_time)
    ),
  };
}

function enrichTransactions(
  members: PublicMember[],
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[]
): EnrichedTransaction[] {
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const repaidMap = buildRepaidByTransactionMap(repayments);

  return transactions.map((tx) => {
    const sender = memberMap.get(tx.sender_id);
    const receiver = memberMap.get(tx.receiver_id);
    const repaidForTx = repaidMap.get(tx.id) ?? tx.repaid_amount_paisa ?? 0;
    const remaining_paisa = getTransactionRemainingPaisa(tx, repaidMap);
    return {
      ...tx,
      repaid_amount_paisa: repaidForTx,
      sender_name: sender?.full_name ?? 'Unknown',
      sender_email: sender?.email ?? '',
      sender_phone: sender?.phone_number ?? '',
      sender_international_phone: sender?.international_phone ?? '',
      receiver_name: receiver?.full_name ?? 'Unknown',
      receiver_email: receiver?.email ?? '',
      receiver_phone: receiver?.phone_number ?? '',
      receiver_international_phone: receiver?.international_phone ?? '',
      remaining_paisa,
    };
  });
}

function enrichRepayments(
  members: PublicMember[],
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[]
): EnrichedRepayment[] {
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const txMap = new Map(transactions.map((t) => [t.id, t]));
  const repaidMap = buildRepaidByTransactionMap(repayments);
  const pairBalances = computeDirectionalPairBalances(members, transactions, repayments);
  const pairMap = new Map(
    pairBalances.map((p) => [`${p.creditor_id}->${p.debtor_id}`, p.outstanding_paisa])
  );

  return repayments.map((rep) => {
    const payer = memberMap.get(rep.payer_id);
    const receiver = memberMap.get(rep.receiver_id);
    const tx = txMap.get(rep.transaction_id);
    const remaining_on_transaction_paisa = tx ? getTransactionRemainingPaisa(tx, repaidMap) : 0;
    const remaining_between_members_paisa =
      pairMap.get(`${rep.receiver_id}->${rep.payer_id}`) ?? 0;

    return {
      ...rep,
      payer_name: payer?.full_name ?? 'Unknown',
      payer_international_phone: payer?.international_phone ?? '',
      receiver_name: receiver?.full_name ?? 'Unknown',
      receiver_international_phone: receiver?.international_phone ?? '',
      transaction_description: tx?.description ?? 'Debt obligation',
      transaction_date: tx?.transaction_date ?? rep.repayment_date,
      remaining_on_transaction_paisa,
      remaining_between_members_paisa,
    };
  });
}

function enrichReminders(
  members: PublicMember[],
  reminders: StoredReminderRaw[]
): EnrichedReminder[] {
  const memberMap = new Map(members.map((m) => [m.id, m]));
  return reminders.map((r) => {
    const creator = memberMap.get(r.created_by);
    const recipient = memberMap.get(r.recipient_id);
    const computed_status = computeReminderStatus(r);
    return {
      id: r.id,
      created_by: r.created_by,
      recipient_id: r.recipient_id,
      title: r.title,
      amount_paisa: r.amount_paisa,
      reminder_date: r.reminder_date,
      reminder_time: r.reminder_time,
      description: r.description,
      status: r.status,
      computed_status,
      completed_at: r.completed_at ?? null,
      created_at: r.created_at,
      creator_name: creator?.full_name ?? 'Unknown',
      recipient_name: recipient?.full_name ?? 'Unknown',
      recipient_phone: recipient?.phone_number ?? '',
      recipient_international_phone: recipient?.international_phone ?? '',
    };
  });
}

/**
 * Automatically create in-app notifications for newly overdue reminders (idempotent via notified_overdue).
 */
export async function syncDueReminderNotifications(): Promise<void> {
  const pktNow = getKarachiNowDateTime();
  const nowStamp = `${pktNow.date} ${pktNow.time}`;

  if (isMongoConfigured()) {
    await connectToDatabase();
    const pending = await ReminderModel.find({
      status: 'PENDING_APPROVAL',
      approved_at: null,
      rejected_at: null,
      approved_by: null,
      source_transaction_id: null,
      notified_overdue: false,
    }).lean();
    for (const rem of pending) {
      const dueStamp = `${rem.reminder_date} ${rem.reminder_time}`;
      if (dueStamp <= nowStamp) {
        const [creator, recipient] = await Promise.all([
          UserModel.findById(rem.created_by).lean(),
          UserModel.findById(rem.recipient_id).lean(),
        ]);
        const amountStr = formatPaisaPlain(Number(rem.amount_paisa));
        await NotificationModel.create([
          {
            user_id: rem.recipient_id,
            title: `Payment reminder due: ${rem.title}`,
            message: `${(creator as any)?.full_name ?? 'A member'} scheduled a reminder for Rs. ${amountStr} (${rem.reminder_date} ${rem.reminder_time}).`,
            notification_type: 'REMINDER',
            is_read: false,
            related_entity_id: String(rem._id),
          },
          {
            user_id: rem.created_by,
            title: `Reminder reached due time: ${rem.title}`,
            message: `Reminder to ${(recipient as any)?.full_name ?? 'member'} for Rs. ${amountStr} is now due.`,
            notification_type: 'REMINDER',
            is_read: false,
            related_entity_id: String(rem._id),
          },
        ]);
        await ReminderModel.findByIdAndUpdate(rem._id, { $set: { notified_overdue: true } });
      }
    }
    return;
  }

  await withLocalWriteLock(async () => {
    const state = readLocalState();
    let changed = false;
    const memberMap = new Map(state.users.map((u) => [u.id, u]));
    const nowIso = new Date().toISOString();

    for (const rem of state.reminders) {
      if (rem.status !== 'PENDING' || rem.notified_overdue) continue;
      const dueStamp = `${rem.reminder_date} ${rem.reminder_time}`;
      if (dueStamp <= nowStamp) {
        const creator = memberMap.get(rem.created_by);
        const recipient = memberMap.get(rem.recipient_id);
        const amountStr = formatPaisaPlain(rem.amount_paisa);
        state.notifications.push(
          {
            id: createObjectIdString(),
            user_id: rem.recipient_id,
            title: `Payment reminder due: ${rem.title}`,
            message: `${creator?.full_name ?? 'A member'} scheduled a reminder for Rs. ${amountStr} (${rem.reminder_date} ${rem.reminder_time}).`,
            notification_type: 'REMINDER',
            is_read: false,
            related_entity_id: rem.id,
            created_at: nowIso,
          },
          {
            id: createObjectIdString(),
            user_id: rem.created_by,
            title: `Reminder reached due time: ${rem.title}`,
            message: `Reminder to ${recipient?.full_name ?? 'member'} for Rs. ${amountStr} is now due.`,
            notification_type: 'REMINDER',
            is_read: false,
            related_entity_id: rem.id,
            created_at: nowIso,
          }
        );
        rem.notified_overdue = true;
        changed = true;
      }
    }
    if (changed) {
      writeLocalState(state);
    }
  });
}

export async function createMoneyTransaction(params: {
  actorUserId: string;
  senderId: string;
  receiverId: string;
  amountInput: string | number;
  transactionType: 'MONEY_GIVEN' | 'MONEY_RECEIVED';
  transactionDate: string;
  description: string;
  notes?: string;
  idempotencyKey: string;
}): Promise<EnrichedTransaction> {
  assertValidMemberId(params.senderId, 'sender ID');
  assertValidMemberId(params.receiverId, 'receiver ID');
  assertDistinctMembers(params.senderId, params.receiverId);
  assertUserIsParticipant(
    params.actorUserId,
    [params.senderId, params.receiverId],
    'You can only record transactions involving your own account.'
  );

  const amountPaisa = parsePkrToPaisa(params.amountInput);

  if (isMongoConfigured()) {
    await connectToDatabase();
    const existing = await TransactionModel.findOne({
      idempotency_key: params.idempotencyKey,
    }).lean();
    if (existing) {
      const { members, transactions, repayments } = await loadAllCoreEntities();
      const enriched = enrichTransactions(members, transactions, repayments);
      const found = enriched.find((t) => t.id === String((existing as any)._id));
      if (found) return found;
    }

    const [senderDoc, receiverDoc] = await Promise.all([
      UserModel.findOne({ _id: params.senderId, is_active: true }).lean(),
      UserModel.findOne({ _id: params.receiverId, is_active: true }).lean(),
    ]);
    if (!senderDoc || !receiverDoc) {
      throw new Error('Selected member account does not exist.');
    }

    const createdId = await runWithMongoTransaction(async (session) => {
      const opts = session ? { session } : {};
      const [created] = await TransactionModel.create(
        [
          {
            sender_id: params.senderId,
            receiver_id: params.receiverId,
            amount_paisa: amountPaisa,
            amount_decimal: paisaToDecimal128(amountPaisa),
            repaid_amount_paisa: 0,
            currency: 'PKR',
            transaction_type: params.transactionType,
            description: params.description.trim(),
            notes: params.notes?.trim() ?? '',
            transaction_date: params.transactionDate,
            status: 'PENDING_APPROVAL',
            reversed_transaction_id: null,
            idempotency_key: params.idempotencyKey,
            created_by: params.actorUserId,
          },
        ],
        opts
      );

      const amountLabel = formatPaisaPlain(amountPaisa);
      const senderName = (senderDoc as any).full_name;
      const receiverName = (receiverDoc as any).full_name;
      const counterpartyId =
        params.actorUserId === params.senderId ? params.receiverId : params.senderId;

      await NotificationModel.create(
        [
          {
            user_id: counterpartyId,
            title:
              params.transactionType === 'MONEY_GIVEN'
                ? `${senderName} recorded Rs. ${amountLabel} given to you`
                : `${receiverName} recorded Rs. ${amountLabel} received from you`,
            message: `${params.description.trim()} · Date: ${params.transactionDate}`,
            notification_type: params.transactionType,
            is_read: false,
            related_entity_id: String(created._id),
          },
        ],
        opts
      );

      await AuditLogModel.create(
        [
          {
            user_id: params.actorUserId,
            action: `CREATE_${params.transactionType}`,
            entity_type: 'Transaction',
            entity_id: String(created._id),
            details: `${senderName} -> ${receiverName}: Rs. ${amountLabel} (${params.description.trim()})`,
          },
        ],
        opts
      );

      return String(created._id);
    });

    const { members, transactions, repayments } = await loadAllCoreEntities();
    const enriched = enrichTransactions(members, transactions, repayments);
    const match = enriched.find((t) => t.id === createdId);
    if (!match) throw new Error('Transaction saved but could not be loaded.');
    return match;
  }

  const createdId = await withLocalWriteLock(async () => {
    const state = readLocalState();
    const existing = state.transactions.find((t) => t.idempotency_key === params.idempotencyKey);
    if (existing) return existing.id;

    const sender = state.users.find((u) => u.id === params.senderId && u.is_active);
    const receiver = state.users.find((u) => u.id === params.receiverId && u.is_active);
    if (!sender || !receiver) {
      throw new Error('Selected member account does not exist.');
    }

    const now = new Date().toISOString();
    const txId = createObjectIdString();
    state.transactions.push({
      id: txId,
      sender_id: params.senderId,
      receiver_id: params.receiverId,
      amount_paisa: amountPaisa,
      repaid_amount_paisa: 0,
      currency: 'PKR',
      transaction_type: params.transactionType,
      description: params.description.trim(),
      notes: params.notes?.trim() ?? '',
      transaction_date: params.transactionDate,
      status: 'PENDING',
      reversed_transaction_id: null,
      idempotency_key: params.idempotencyKey,
      created_by: params.actorUserId,
      created_at: now,
    });

    const amountLabel = formatPaisaPlain(amountPaisa);
    const counterpartyId =
      params.actorUserId === params.senderId ? params.receiverId : params.senderId;

    state.notifications.push({
      id: createObjectIdString(),
      user_id: counterpartyId,
      title:
        params.transactionType === 'MONEY_GIVEN'
          ? `${sender.full_name} recorded Rs. ${amountLabel} given to you`
          : `${receiver.full_name} recorded Rs. ${amountLabel} received from you`,
      message: `${params.description.trim()} · Date: ${params.transactionDate}`,
      notification_type: params.transactionType,
      is_read: false,
      related_entity_id: txId,
      created_at: now,
    });

    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: params.actorUserId,
      action: `CREATE_${params.transactionType}`,
      entity_type: 'Transaction',
      entity_id: txId,
      details: `${sender.full_name} -> ${receiver.full_name}: Rs. ${amountLabel} (${params.description.trim()})`,
      created_at: now,
    });

    writeLocalState(state);
    return txId;
  });

  const { members, transactions, repayments } = await loadAllCoreEntities();
  const enriched = enrichTransactions(members, transactions, repayments);
  const match = enriched.find((t) => t.id === createdId);
  if (!match) throw new Error('Transaction saved but could not be loaded.');
  return match;
}

/**
 * Record a repayment from payerId -> receiverId.
 * Supports both SPECIFIC debt transaction and FIFO allocation across open debts.
 * Prevents overpayment, duplicate idempotency keys, and updates transaction statuses atomically.
 */
export async function createRepaymentOperation(params: {
  actorUserId: string;
  payerId: string;
  receiverId: string;
  transactionId?: string;
  allocationMode: 'SPECIFIC' | 'FIFO';
  amountInput: string | number;
  repaymentDate: string;
  paymentMethod: PaymentMethod;
  description: string;
  idempotencyKey: string;
}): Promise<{
  repayments: EnrichedRepayment[];
  receipt_number: string;
  total_repaid_paisa: number;
  remaining_between_members_paisa: number;
}> {
  assertValidMemberId(params.payerId, 'payer ID');
  assertValidMemberId(params.receiverId, 'receiver ID');
  assertDistinctMembers(params.payerId, params.receiverId, 'Payer and receiver must be different members.');
  assertUserIsParticipant(
    params.actorUserId,
    [params.payerId, params.receiverId],
    'You can only record repayments for debts involving your account.'
  );

  if (params.transactionId) {
    assertValidMemberId(params.transactionId, 'transaction ID');
  }

  const repaymentAmountPaisa = parsePkrToPaisa(params.amountInput);

  if (isMongoConfigured()) {
    await connectToDatabase();
    const existingBatch = await RepaymentModel.find({
      idempotency_key: { $regex: `^${params.idempotencyKey}(_|$)` },
    }).lean();

    if (existingBatch.length > 0) {
      const { members, transactions, repayments } = await loadAllCoreEntities();
      const enriched = enrichRepayments(members, transactions, repayments);
      const matched = enriched.filter((r) =>
        r.idempotency_key === params.idempotencyKey ||
        r.idempotency_key.startsWith(`${params.idempotencyKey}_`)
      );
      const totalRepaid = matched.reduce((s, r) => s + r.amount_paisa, 0);
      const pairBalances = computeDirectionalPairBalances(members, transactions, repayments);
      const pair = pairBalances.find(
        (p) => p.creditor_id === params.receiverId && p.debtor_id === params.payerId
      );
      return {
        repayments: matched,
        receipt_number: matched[0]?.receipt_number ?? generateReceiptNumber(),
        total_repaid_paisa: totalRepaid,
        remaining_between_members_paisa: pair?.outstanding_paisa ?? 0,
      };
    }

    const { members, transactions, repayments } = await loadAllCoreEntities();
    const payer = members.find((m) => m.id === params.payerId);
    const receiver = members.find((m) => m.id === params.receiverId);
    if (!payer || !receiver) throw new Error('Member account not found.');

    const enrichedTx = enrichTransactions(members, transactions, repayments);
    const openBetweenMembers = enrichedTx.filter(
      (tx) =>
        tx.sender_id === params.receiverId &&
        tx.receiver_id === params.payerId &&
        isDebtOriginatingTransaction(tx) &&
        tx.remaining_paisa > 0
    );

    if (openBetweenMembers.length === 0) {
      throw new Error(`No outstanding debt found from ${payer.full_name} to ${receiver.full_name}.`);
    }

    let allocations: Array<{
      transaction: EnrichedTransaction;
      allocated_paisa: number;
      new_remaining_paisa: number;
    }> = [];

    if (params.allocationMode === 'SPECIFIC' && params.transactionId) {
      const target = openBetweenMembers.find((tx) => tx.id === params.transactionId);
      if (!target) {
        throw new Error('Selected debt transaction is either already paid or does not belong to this relationship.');
      }
      if (repaymentAmountPaisa > target.remaining_paisa) {
        throw new Error(
          `Overpayment not allowed. Remaining balance on this debt is Rs. ${formatPaisaPlain(target.remaining_paisa)}.`
        );
      }
      allocations = [
        {
          transaction: target,
          allocated_paisa: repaymentAmountPaisa,
          new_remaining_paisa: target.remaining_paisa - repaymentAmountPaisa,
        },
      ];
    } else {
      allocations = computeFIFOAllocations(openBetweenMembers, repaymentAmountPaisa);
    }

    const receiptNumber = generateReceiptNumber();
    const createdIds: string[] = [];

    await runWithMongoTransaction(async (session) => {
      const opts = session ? { session } : {};
      for (let idx = 0; idx < allocations.length; idx++) {
        const alloc = allocations[idx];
        const key = allocations.length === 1 ? params.idempotencyKey : `${params.idempotencyKey}_${idx}`;
        const [repDoc] = await RepaymentModel.create(
          [
            {
              transaction_id: alloc.transaction.id,
              payer_id: params.payerId,
              receiver_id: params.receiverId,
              amount_paisa: alloc.allocated_paisa,
              amount_decimal: paisaToDecimal128(alloc.allocated_paisa),
              repayment_date: params.repaymentDate,
              payment_method: params.paymentMethod,
              description: params.description.trim(),
              receipt_number: receiptNumber,
              is_reversed: false,
              idempotency_key: key,
              created_by: params.actorUserId,
            },
          ],
          opts
        );
        createdIds.push(String(repDoc._id));

        const newRepaidTotal = alloc.transaction.repaid_amount_paisa + alloc.allocated_paisa;
        const newStatus: TransactionStatus =
          alloc.new_remaining_paisa === 0 ? 'PAID' : 'PARTIALLY_PAID';

        await TransactionModel.findByIdAndUpdate(
          alloc.transaction.id,
          {
            $set: {
              repaid_amount_paisa: newRepaidTotal,
              status: newStatus,
            },
          },
          opts
        );
      }

      const totalOpenBefore = openBetweenMembers.reduce((s, t) => s + t.remaining_paisa, 0);
      const remainingAfter = Math.max(0, totalOpenBefore - repaymentAmountPaisa);
      const counterpartyId =
        params.actorUserId === params.payerId ? params.receiverId : params.payerId;

      await NotificationModel.create(
        [
          {
            user_id: counterpartyId,
            title: `Repayment recorded: Rs. ${formatPaisaPlain(repaymentAmountPaisa)}`,
            message: `${payer.full_name} repaid Rs. ${formatPaisaPlain(repaymentAmountPaisa)} to ${receiver.full_name} via ${params.paymentMethod}. Remaining balance: Rs. ${formatPaisaPlain(remainingAfter)}.`,
            notification_type: 'REPAYMENT',
            is_read: false,
            related_entity_id: createdIds[0],
          },
        ],
        opts
      );

      await AuditLogModel.create(
        [
          {
            user_id: params.actorUserId,
            action: 'CREATE_REPAYMENT',
            entity_type: 'Repayment',
            entity_id: createdIds[0],
            details: `${payer.full_name} -> ${receiver.full_name}: Rs. ${formatPaisaPlain(repaymentAmountPaisa)} (${receiptNumber})`,
          },
        ],
        opts
      );
    });

    const latest = await loadAllCoreEntities();
    const enrichedReps = enrichRepayments(latest.members, latest.transactions, latest.repayments);
    const matched = enrichedReps.filter((r) => createdIds.includes(r.id));
    const pairBalances = computeDirectionalPairBalances(
      latest.members,
      latest.transactions,
      latest.repayments
    );
    const pair = pairBalances.find(
      (p) => p.creditor_id === params.receiverId && p.debtor_id === params.payerId
    );
    return {
      repayments: matched,
      receipt_number: receiptNumber,
      total_repaid_paisa: repaymentAmountPaisa,
      remaining_between_members_paisa: pair?.outstanding_paisa ?? 0,
    };
  }

  const result = await withLocalWriteLock(async () => {
    const state = readLocalState();
    const existingBatch = state.repayments.filter(
      (r) =>
        r.idempotency_key === params.idempotencyKey ||
        r.idempotency_key.startsWith(`${params.idempotencyKey}_`)
    );
    if (existingBatch.length > 0) {
      return { createdIds: existingBatch.map((r) => r.id), receiptNumber: existingBatch[0].receipt_number };
    }

    const members = state.users.filter((u) => u.is_active).map(sanitizeMember);
    const payer = members.find((m) => m.id === params.payerId);
    const receiver = members.find((m) => m.id === params.receiverId);
    if (!payer || !receiver) throw new Error('Member account not found.');

    const enrichedTx = enrichTransactions(members, state.transactions, state.repayments);
    const openBetweenMembers = enrichedTx.filter(
      (tx) =>
        tx.sender_id === params.receiverId &&
        tx.receiver_id === params.payerId &&
        isDebtOriginatingTransaction(tx) &&
        tx.remaining_paisa > 0
    );

    if (openBetweenMembers.length === 0) {
      throw new Error(`No outstanding debt found from ${payer.full_name} to ${receiver.full_name}.`);
    }

    let allocations: Array<{
      transaction: EnrichedTransaction;
      allocated_paisa: number;
      new_remaining_paisa: number;
    }> = [];

    if (params.allocationMode === 'SPECIFIC' && params.transactionId) {
      const target = openBetweenMembers.find((tx) => tx.id === params.transactionId);
      if (!target) {
        throw new Error('Selected debt transaction is either already paid or does not belong to this relationship.');
      }
      if (repaymentAmountPaisa > target.remaining_paisa) {
        throw new Error(
          `Overpayment not allowed. Remaining balance on this debt is Rs. ${formatPaisaPlain(target.remaining_paisa)}.`
        );
      }
      allocations = [
        {
          transaction: target,
          allocated_paisa: repaymentAmountPaisa,
          new_remaining_paisa: target.remaining_paisa - repaymentAmountPaisa,
        },
      ];
    } else {
      allocations = computeFIFOAllocations(openBetweenMembers, repaymentAmountPaisa);
    }

    const now = new Date().toISOString();
    const receiptNumber = generateReceiptNumber();
    const createdIds: string[] = [];

    for (let idx = 0; idx < allocations.length; idx++) {
      const alloc = allocations[idx];
      const repId = createObjectIdString();
      const key = allocations.length === 1 ? params.idempotencyKey : `${params.idempotencyKey}_${idx}`;
      state.repayments.push({
        id: repId,
        transaction_id: alloc.transaction.id,
        payer_id: params.payerId,
        receiver_id: params.receiverId,
        amount_paisa: alloc.allocated_paisa,
        repayment_date: params.repaymentDate,
        payment_method: params.paymentMethod,
        description: params.description.trim(),
        receipt_number: receiptNumber,
        is_reversed: false,
        idempotency_key: key,
        created_by: params.actorUserId,
        created_at: now,
      });
      createdIds.push(repId);

      const storedTx = state.transactions.find((t) => t.id === alloc.transaction.id);
      if (storedTx) {
        storedTx.repaid_amount_paisa += alloc.allocated_paisa;
        storedTx.status = alloc.new_remaining_paisa === 0 ? 'PAID' : 'PARTIALLY_PAID';
      }
    }

    const totalOpenBefore = openBetweenMembers.reduce((s, t) => s + t.remaining_paisa, 0);
    const remainingAfter = Math.max(0, totalOpenBefore - repaymentAmountPaisa);
    const counterpartyId =
      params.actorUserId === params.payerId ? params.receiverId : params.payerId;

    state.notifications.push({
      id: createObjectIdString(),
      user_id: counterpartyId,
      title: `Repayment recorded: Rs. ${formatPaisaPlain(repaymentAmountPaisa)}`,
      message: `${payer.full_name} repaid Rs. ${formatPaisaPlain(repaymentAmountPaisa)} to ${receiver.full_name} via ${params.paymentMethod}. Remaining balance: Rs. ${formatPaisaPlain(remainingAfter)}.`,
      notification_type: 'REPAYMENT',
      is_read: false,
      related_entity_id: createdIds[0],
      created_at: now,
    });

    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: params.actorUserId,
      action: 'CREATE_REPAYMENT',
      entity_type: 'Repayment',
      entity_id: createdIds[0],
      details: `${payer.full_name} -> ${receiver.full_name}: Rs. ${formatPaisaPlain(repaymentAmountPaisa)} (${receiptNumber})`,
      created_at: now,
    });

    writeLocalState(state);
    return { createdIds, receiptNumber };
  });

  const latest = await loadAllCoreEntities();
  const enrichedReps = enrichRepayments(latest.members, latest.transactions, latest.repayments);
  const matched = enrichedReps.filter((r) => result.createdIds.includes(r.id));
  const pairBalances = computeDirectionalPairBalances(
    latest.members,
    latest.transactions,
    latest.repayments
  );
  const pair = pairBalances.find(
    (p) => p.creditor_id === params.receiverId && p.debtor_id === params.payerId
  );
  return {
    repayments: matched,
    receipt_number: result.receiptNumber,
    total_repaid_paisa: matched.reduce((s, r) => s + r.amount_paisa, 0),
    remaining_between_members_paisa: pair?.outstanding_paisa ?? 0,
  };
}

/**
 * Reverse a transaction using an immutable REVERSAL record instead of deleting financial history.
 */
export async function approvePaymentOperation(params: {
  actorUserId: string;
  transactionId: string;
}): Promise<EnrichedTransaction> {
  assertValidMemberId(params.transactionId, 'transaction ID');

  const approveLocal = async () =>
    withLocalWriteLock(async () => {
      const state = readLocalState();
      const tx = state.transactions.find((item) => item.id === params.transactionId);
      if (!tx) throw new Error('Payment request not found.');
      if (tx.receiver_id !== params.actorUserId) throw new Error('Only the receiver can approve this payment request.');
      if (tx.status !== 'PENDING_APPROVAL') throw new Error('This payment request is no longer pending.');
      if (tx.sender_id === params.actorUserId) throw new Error('A user cannot approve their own payment request.');

      const sender = state.users.find((user) => user.id === tx.sender_id);
      const receiver = state.users.find((user) => user.id === tx.receiver_id);
      if (!sender || !receiver) throw new Error('Member account unavailable.');

      if (sender.fund_sources?.some((source) => source.original_sender_id === tx.receiver_id && source.remaining_paisa > 0)) {
        throw new Error('Circular or return payments to the original sender are not allowed.');
      }

      sender.available_balance_paisa = Number(sender.available_balance_paisa ?? 100000000);
      receiver.available_balance_paisa = Number(receiver.available_balance_paisa ?? 100000000);
      if (sender.available_balance_paisa < tx.amount_paisa) {
        throw new Error(`Insufficient available balance. Maximum available: Rs. ${formatPaisaPlain(sender.available_balance_paisa)}.`);
      }

      const now = new Date().toISOString();
      sender.available_balance_paisa -= tx.amount_paisa;
      receiver.available_balance_paisa += tx.amount_paisa;
      let remainingToConsume = tx.amount_paisa;
      for (const source of sender.fund_sources ?? []) {
        if (remainingToConsume <= 0) break;
        if (source.original_sender_id === tx.receiver_id) continue;
        const consumed = Math.min(source.remaining_paisa, remainingToConsume);
        source.remaining_paisa -= consumed;
        remainingToConsume -= consumed;
      }
      tx.status = 'APPROVED';
      tx.approved_at = now;
      tx.approved_by = params.actorUserId;
      tx.source_transaction_id = tx.id;

      receiver.fund_sources = receiver.fund_sources ?? [];
      receiver.fund_sources.push({
        source_transaction_id: tx.id,
        original_sender_id: tx.sender_id,
        remaining_paisa: tx.amount_paisa,
      });
      sender.updated_at = now;
      receiver.updated_at = now;

      state.notifications.push(
        {
          id: createObjectIdString(),
          user_id: tx.sender_id,
          title: `Payment approved (${formatPaisaPlain(tx.amount_paisa)} PKR)`,
          message: `${receiver.full_name} approved your payment request for Rs. ${formatPaisaPlain(tx.amount_paisa)}. Your balance was updated.`,
          notification_type: 'MONEY_GIVEN',
          is_read: false,
          related_entity_id: tx.id,
          created_at: now,
        },
        {
          id: createObjectIdString(),
          user_id: tx.receiver_id,
          title: `Payment received (${formatPaisaPlain(tx.amount_paisa)} PKR)`,
          message: `You approved payment from ${sender.full_name}: ${tx.description}.`,
          notification_type: 'MONEY_RECEIVED',
          is_read: false,
          related_entity_id: tx.id,
          created_at: now,
        }
      );
      state.audit_logs.push({
        id: createObjectIdString(),
        user_id: params.actorUserId,
        action: 'APPROVE_PAYMENT',
        entity_type: 'Transaction',
        entity_id: tx.id,
        details: `Approved ${tx.id}: Rs. ${formatPaisaPlain(tx.amount_paisa)} from ${sender.full_name} to ${receiver.full_name}`,
        created_at: now,
      });
      writeLocalState(state);
    });

  if (!isMongoConfigured()) {
    await approveLocal();
  } else {
    await connectToDatabase();
    await runWithMongoTransaction(async (session) => {
      const opts = session ? { session } : {};
      const tx = await TransactionModel.findById(params.transactionId).lean();
      if (!tx) throw new Error('Payment request not found.');
      if (String((tx as any).receiver_id) !== params.actorUserId) throw new Error('Only the receiver can approve this payment request.');
      if ((tx as any).status !== 'PENDING_APPROVAL') throw new Error('This payment request is no longer pending.');
      const sender = await UserModel.findById((tx as any).sender_id, null, opts).lean();
      const receiver = await UserModel.findById((tx as any).receiver_id, null, opts).lean();
      if (!sender || !receiver) throw new Error('Member account unavailable.');
      const sources = Array.isArray((receiver as any).fund_sources) ? (receiver as any).fund_sources : [];
      const senderSources = Array.isArray((sender as any).fund_sources) ? (sender as any).fund_sources : [];
      if (senderSources.some((source: any) => String(source.original_sender_id) === String((tx as any).receiver_id) && Number(source.remaining_paisa) > 0)) {
        throw new Error('Circular or return payments to the original sender are not allowed.');
      }
      const senderBalance = Number((sender as any).available_balance_paisa ?? 100000000);
      if (senderBalance < Number((tx as any).amount_paisa)) {
        throw new Error(`Insufficient available balance. Maximum available: Rs. ${formatPaisaPlain(senderBalance)}.`);
      }
      const now = new Date();
      await UserModel.updateOne({ _id: (sender as any)._id }, { $inc: { available_balance_paisa: -Number((tx as any).amount_paisa) } }, opts);
      await UserModel.updateOne(
        { _id: (receiver as any)._id },
        {
          $inc: { available_balance_paisa: Number((tx as any).amount_paisa) },
          $push: {
            fund_sources: {
              source_transaction_id: String((tx as any)._id),
              original_sender_id: String((tx as any).sender_id),
              remaining_paisa: Number((tx as any).amount_paisa),
            },
          },
        },
        opts
      );
      await TransactionModel.updateOne(
        { _id: params.transactionId, status: 'PENDING_APPROVAL' },
        { $set: { status: 'APPROVED', approved_at: now, rejected_at: null, approved_by: params.actorUserId, source_transaction_id: params.transactionId } },
        opts
      );
      await NotificationModel.create([
        { user_id: (tx as any).sender_id, title: 'Payment approved', message: `${(receiver as any).full_name} approved your payment request.`, notification_type: 'MONEY_GIVEN', is_read: false, related_entity_id: params.transactionId },
        { user_id: (tx as any).receiver_id, title: 'Payment received', message: `You approved a payment from ${(sender as any).full_name}.`, notification_type: 'MONEY_RECEIVED', is_read: false, related_entity_id: params.transactionId },
      ], opts);
      await AuditLogModel.create([{ user_id: params.actorUserId, action: 'APPROVE_PAYMENT', entity_type: 'Transaction', entity_id: params.transactionId, details: `Approved Rs. ${formatPaisaPlain(Number((tx as any).amount_paisa))}` }], opts);
    });
  }

  const { members, transactions, repayments } = await loadAllCoreEntities();
  const match = enrichTransactions(members, transactions, repayments).find((item) => item.id === params.transactionId);
  if (!match) throw new Error('Approved payment could not be loaded.');
  return match;
}

export async function rejectPaymentOperation(params: {
  actorUserId: string;
  transactionId: string;
}): Promise<EnrichedTransaction> {
  assertValidMemberId(params.transactionId, 'transaction ID');
  if (!isMongoConfigured()) {
    await withLocalWriteLock(async () => {
      const state = readLocalState();
      const tx = state.transactions.find((item) => item.id === params.transactionId);
      if (!tx) throw new Error('Payment request not found.');
      if (tx.receiver_id !== params.actorUserId) throw new Error('Only the receiver can reject this payment request.');
      if (tx.status !== 'PENDING_APPROVAL') throw new Error('This payment request is no longer pending.');
      const now = new Date().toISOString();
      tx.status = 'REJECTED';
      tx.rejected_at = now;
      const sender = state.users.find((user) => user.id === tx.sender_id);
      const receiver = state.users.find((user) => user.id === tx.receiver_id);
      state.notifications.push({
        id: createObjectIdString(), user_id: tx.sender_id,
        title: `Payment rejected (${formatPaisaPlain(tx.amount_paisa)} PKR)`,
        message: `${receiver?.full_name ?? 'The receiver'} rejected your payment request.`,
        notification_type: 'MONEY_GIVEN', is_read: false, related_entity_id: tx.id, created_at: now,
      });
      state.audit_logs.push({
        id: createObjectIdString(), user_id: params.actorUserId, action: 'REJECT_PAYMENT',
        entity_type: 'Transaction', entity_id: tx.id,
        details: `Rejected Rs. ${formatPaisaPlain(tx.amount_paisa)} from ${sender?.full_name ?? tx.sender_id} to ${receiver?.full_name ?? tx.receiver_id}`,
        created_at: now,
      });
      writeLocalState(state);
    });
  } else {
    await connectToDatabase();
    await runWithMongoTransaction(async (session) => {
      const opts = session ? { session } : {};
      const tx = await TransactionModel.findById(params.transactionId).lean();
      if (!tx) throw new Error('Payment request not found.');
      if (String((tx as any).receiver_id) !== params.actorUserId) throw new Error('Only the receiver can reject this payment request.');
      if ((tx as any).status !== 'PENDING_APPROVAL') throw new Error('This payment request is no longer pending.');
      await TransactionModel.updateOne(
        { _id: params.transactionId, status: 'PENDING_APPROVAL' },
        { $set: { status: 'REJECTED', rejected_at: new Date() } },
        opts
      );
      await NotificationModel.create([{ user_id: (tx as any).sender_id, title: 'Payment rejected', message: 'Your payment request was rejected.', notification_type: 'MONEY_GIVEN', is_read: false, related_entity_id: params.transactionId }], opts);
      await AuditLogModel.create([{ user_id: params.actorUserId, action: 'REJECT_PAYMENT', entity_type: 'Transaction', entity_id: params.transactionId, details: 'Rejected pending payment request' }], opts);
    });
  }
  const { members, transactions, repayments } = await loadAllCoreEntities();
  const match = enrichTransactions(members, transactions, repayments).find((item) => item.id === params.transactionId);
  if (!match) throw new Error('Rejected payment could not be loaded.');
  return match;
}

export async function reverseTransactionOperation(params: {
  actorUserId: string;
  transactionId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<EnrichedTransaction> {
  assertValidMemberId(params.transactionId, 'transaction ID');

  if (isMongoConfigured()) {
    await connectToDatabase();
    const existingRev = await TransactionModel.findOne({
      idempotency_key: params.idempotencyKey,
    }).lean();
    if (existingRev) {
      const { members, transactions, repayments } = await loadAllCoreEntities();
      const match = enrichTransactions(members, transactions, repayments).find(
        (t) => t.id === String((existingRev as any)._id)
      );
      if (match) return match;
    }

    const orig = await TransactionModel.findById(params.transactionId).lean();
    if (!orig) throw new Error('Transaction not found.');
    const o: any = orig;
    assertUserIsParticipant(
      params.actorUserId,
      [String(o.sender_id), String(o.receiver_id)],
      'Only participants of this transaction can reverse it.'
    );
    if (o.status === 'REVERSED' || o.transaction_type === 'REVERSAL') {
      throw new Error('This transaction has already been reversed.');
    }
    const activeRepayments = await RepaymentModel.countDocuments({
      transaction_id: params.transactionId,
      is_reversed: false,
    });
    if (activeRepayments > 0) {
      throw new Error('Cannot reverse a transaction that already has repayments recorded against it.');
    }

    const reversalId = await runWithMongoTransaction(async (session) => {
      const opts = session ? { session } : {};
      await TransactionModel.findByIdAndUpdate(
        params.transactionId,
        { $set: { status: 'REVERSED' } },
        opts
      );

      const [revDoc] = await TransactionModel.create(
        [
          {
            sender_id: o.receiver_id,
            receiver_id: o.sender_id,
            amount_paisa: o.amount_paisa,
            amount_decimal: paisaToDecimal128(Number(o.amount_paisa)),
            repaid_amount_paisa: 0,
            currency: 'PKR',
            transaction_type: 'REVERSAL',
            description: `Reversal of "${o.description}": ${params.reason.trim()}`,
            notes: `Original ID: ${params.transactionId}`,
            transaction_date: new Date().toISOString().slice(0, 10),
            status: 'REVERSED',
            reversed_transaction_id: params.transactionId,
            idempotency_key: params.idempotencyKey,
            created_by: params.actorUserId,
          },
        ],
        opts
      );

      const counterpartyId =
        String(o.sender_id) === params.actorUserId ? String(o.receiver_id) : String(o.sender_id);

      await NotificationModel.create(
        [
          {
            user_id: counterpartyId,
            title: `Transaction reversed (Rs. ${formatPaisaPlain(Number(o.amount_paisa))})`,
            message: `${o.description} was reversed. Reason: ${params.reason.trim()}`,
            notification_type: 'REVERSAL',
            is_read: false,
            related_entity_id: String(revDoc._id),
          },
        ],
        opts
      );

      await AuditLogModel.create(
        [
          {
            user_id: params.actorUserId,
            action: 'REVERSE_TRANSACTION',
            entity_type: 'Transaction',
            entity_id: params.transactionId,
            details: `Reversed transaction ${params.transactionId}. Reason: ${params.reason.trim()}`,
          },
        ],
        opts
      );

      return String(revDoc._id);
    });

    const { members, transactions, repayments } = await loadAllCoreEntities();
    const match = enrichTransactions(members, transactions, repayments).find(
      (t) => t.id === reversalId
    );
    if (!match) throw new Error('Reversal saved but could not be loaded.');
    return match;
  }

  const reversalId = await withLocalWriteLock(async () => {
    const state = readLocalState();
    const existingRev = state.transactions.find((t) => t.idempotency_key === params.idempotencyKey);
    if (existingRev) return existingRev.id;

    const orig = state.transactions.find((t) => t.id === params.transactionId);
    if (!orig) throw new Error('Transaction not found.');
    assertUserIsParticipant(
      params.actorUserId,
      [orig.sender_id, orig.receiver_id],
      'Only participants of this transaction can reverse it.'
    );
    if (orig.status === 'REVERSED' || orig.transaction_type === 'REVERSAL') {
      throw new Error('This transaction has already been reversed.');
    }
    const hasRepayments = state.repayments.some(
      (r) => r.transaction_id === params.transactionId && !r.is_reversed
    );
    if (hasRepayments) {
      throw new Error('Cannot reverse a transaction that already has repayments recorded against it.');
    }

    const now = new Date().toISOString();
    orig.status = 'REVERSED';

    const revId = createObjectIdString();
    state.transactions.push({
      id: revId,
      sender_id: orig.receiver_id,
      receiver_id: orig.sender_id,
      amount_paisa: orig.amount_paisa,
      repaid_amount_paisa: 0,
      currency: 'PKR',
      transaction_type: 'REVERSAL',
      description: `Reversal of "${orig.description}": ${params.reason.trim()}`,
      notes: `Original ID: ${orig.id}`,
      transaction_date: now.slice(0, 10),
      status: 'REVERSED',
      reversed_transaction_id: orig.id,
      idempotency_key: params.idempotencyKey,
      created_by: params.actorUserId,
      created_at: now,
    });

    const counterpartyId =
      orig.sender_id === params.actorUserId ? orig.receiver_id : orig.sender_id;

    state.notifications.push({
      id: createObjectIdString(),
      user_id: counterpartyId,
      title: `Transaction reversed (Rs. ${formatPaisaPlain(orig.amount_paisa)})`,
      message: `${orig.description} was reversed. Reason: ${params.reason.trim()}`,
      notification_type: 'REVERSAL',
      is_read: false,
      related_entity_id: revId,
      created_at: now,
    });

    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: params.actorUserId,
      action: 'REVERSE_TRANSACTION',
      entity_type: 'Transaction',
      entity_id: orig.id,
      details: `Reversed transaction ${orig.id}. Reason: ${params.reason.trim()}`,
      created_at: now,
    });

    writeLocalState(state);
    return revId;
  });

  const { members, transactions, repayments } = await loadAllCoreEntities();
  const match = enrichTransactions(members, transactions, repayments).find(
    (t) => t.id === reversalId
  );
  if (!match) throw new Error('Reversal saved but could not be loaded.');
  return match;
}

export async function buildUnifiedLedger(
  members: PublicMember[],
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[]
): Promise<LedgerEntry[]> {
  const enrichedTx = enrichTransactions(members, transactions, repayments);
  const enrichedRep = enrichRepayments(members, transactions, repayments);

  const txEntries: LedgerEntry[] = enrichedTx.map((tx) => ({
    id: tx.id,
    entry_kind: 'TRANSACTION',
    reference_code: `TX-${tx.id.slice(-6).toUpperCase()}`,
    date: tx.transaction_date,
    created_at: tx.created_at,
    sender_id: tx.sender_id,
    sender_name: tx.sender_name,
    receiver_id: tx.receiver_id,
    receiver_name: tx.receiver_name,
    amount_paisa: tx.amount_paisa,
    repaid_amount_paisa: tx.repaid_amount_paisa,
    remaining_paisa: tx.remaining_paisa,
    transaction_type: tx.transaction_type,
    description: tx.description,
    notes: tx.notes,
    status: tx.status,
    linked_transaction_id: tx.reversed_transaction_id ?? undefined,
  }));

  const repEntries: LedgerEntry[] = enrichedRep.map((rep) => ({
    id: rep.id,
    entry_kind: 'REPAYMENT',
    reference_code: rep.receipt_number,
    date: rep.repayment_date,
    created_at: rep.created_at,
    sender_id: rep.payer_id,
    sender_name: rep.payer_name,
    receiver_id: rep.receiver_id,
    receiver_name: rep.receiver_name,
    amount_paisa: rep.amount_paisa,
    repaid_amount_paisa: rep.amount_paisa,
    remaining_paisa: rep.remaining_on_transaction_paisa,
    transaction_type: 'REPAYMENT',
    description: rep.description,
    payment_method: rep.payment_method,
    status: rep.is_reversed ? 'REVERSED' : 'PAID',
    linked_transaction_id: rep.transaction_id,
  }));

  return [...txEntries, ...repEntries].sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.created_at.localeCompare(a.created_at);
  });
}

export async function listNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
  if (isMongoConfigured()) {
    await connectToDatabase();
    const docs = await NotificationModel.find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(50)
      .lean();
    return docs.map(mapMongoNotification);
  }
  const state = readLocalState();
  return state.notifications
    .filter((n) => n.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  assertValidMemberId(notificationId, 'notification ID');
  if (isMongoConfigured()) {
    await connectToDatabase();
    await NotificationModel.findOneAndUpdate(
      { _id: notificationId, user_id: userId },
      { $set: { is_read: true } }
    );
    return;
  }
  await withLocalWriteLock(async () => {
    const state = readLocalState();
    const item = state.notifications.find((n) => n.id === notificationId && n.user_id === userId);
    if (item) {
      item.is_read = true;
      writeLocalState(state);
    }
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (isMongoConfigured()) {
    await connectToDatabase();
    await NotificationModel.updateMany({ user_id: userId, is_read: false }, { $set: { is_read: true } });
    return;
  }
  await withLocalWriteLock(async () => {
    const state = readLocalState();
    let changed = false;
    for (const n of state.notifications) {
      if (n.user_id === userId && !n.is_read) {
        n.is_read = true;
        changed = true;
      }
    }
    if (changed) writeLocalState(state);
  });
}

export async function getDashboardPayload(userId: string): Promise<DashboardPayload> {
  await syncDueReminderNotifications();
  const [{ members, transactions, repayments, reminders }, notifications] = await Promise.all([
    loadAllCoreEntities(),
    listNotificationsForUser(userId),
  ]);

  const currentUser = members.find((m) => m.id === userId);
  if (!currentUser) throw new Error('Authenticated user not found.');

  const metrics = computeDashboardMetrics(userId, transactions, repayments);
  const otherMembers = members.filter((m) => m.id !== userId);
  const member_summaries = computeMemberSummaries(userId, otherMembers, transactions, repayments);
  const directional_balances = computeDirectionalPairBalances(members, transactions, repayments);
  const ledger = await buildUnifiedLedger(members, transactions, repayments);
  const recent_transactions = ledger.filter(
    (e) => e.sender_id === userId || e.receiver_id === userId
  ).slice(0, 8);

  const enrichedTx = enrichTransactions(members, transactions, repayments);
  const pending_debts = enrichedTx.filter(
    (tx) =>
      (tx.sender_id === userId || tx.receiver_id === userId) &&
      isDebtOriginatingTransaction(tx) &&
      tx.remaining_paisa > 0
  );

  const enrichedReminders = enrichReminders(members, reminders).filter(
    (r) =>
      (r.created_by === userId || r.recipient_id === userId) &&
      r.computed_status !== 'COMPLETED'
  );

  const monthly_activity = computeMonthlySeries(userId, transactions, repayments, 6);

  return {
    current_user: currentUser,
    metrics,
    member_summaries,
    directional_balances,
    recent_transactions,
    pending_debts,
    upcoming_reminders: enrichedReminders.slice(0, 5),
    recent_notifications: notifications.slice(0, 5),
    unread_notifications_count: notifications.filter((n) => !n.is_read).length,
    monthly_activity,
  };
}

export async function getMembersDirectoryPayload(userId: string) {
  const { members, transactions, repayments } = await loadAllCoreEntities();
  const summaries = computeMemberSummaries(userId, members, transactions, repayments);
  const directional_balances = computeDirectionalPairBalances(members, transactions, repayments);
  return {
    other_members: summaries.filter((s) => s.member.id !== userId),
    all_members: summaries,
    directional_balances,
  };
}

export async function getMemberDetailPayload(currentUserId: string, targetMemberId: string) {
  assertValidMemberId(targetMemberId, 'member ID');
  const { members, transactions, repayments } = await loadAllCoreEntities();
  const target = members.find((m) => m.id === targetMemberId);
  if (!target) throw new Error('Member not found.');

  const [summary] = computeMemberSummaries(currentUserId, [target], transactions, repayments);
  const memberOverallMetrics = computeDashboardMetrics(targetMemberId, transactions, repayments);
  const ledger = await buildUnifiedLedger(members, transactions, repayments);
  const sharedLedger = ledger.filter(
    (e) =>
      (e.sender_id === currentUserId && e.receiver_id === targetMemberId) ||
      (e.sender_id === targetMemberId && e.receiver_id === currentUserId)
  );
  const memberFullLedger = ledger.filter(
    (e) => e.sender_id === targetMemberId || e.receiver_id === targetMemberId
  );

  const enrichedTx = enrichTransactions(members, transactions, repayments);
  const openDebtsToTarget = enrichedTx.filter(
    (tx) =>
      tx.sender_id === targetMemberId &&
      tx.receiver_id === currentUserId &&
      isDebtOriginatingTransaction(tx) &&
      tx.remaining_paisa > 0
  );
  const openDebtsFromTarget = enrichedTx.filter(
    (tx) =>
      tx.sender_id === currentUserId &&
      tx.receiver_id === targetMemberId &&
      isDebtOriginatingTransaction(tx) &&
      tx.remaining_paisa > 0
  );

  return {
    summary,
    member_overall_metrics: memberOverallMetrics,
    shared_ledger: sharedLedger,
    member_full_ledger: memberFullLedger,
    open_debts_to_target: openDebtsToTarget,
    open_debts_from_target: openDebtsFromTarget,
  };
}

export async function getLedgerAndPendingDebts(userId: string) {
  const { members, transactions, repayments } = await loadAllCoreEntities();
  const ledger = await buildUnifiedLedger(members, transactions, repayments);
  const enrichedTx = enrichTransactions(members, transactions, repayments);
  const enrichedRep = enrichRepayments(members, transactions, repayments);
  const directional_balances = computeDirectionalPairBalances(members, transactions, repayments);

  return {
    members,
    ledger,
    transactions: enrichedTx,
    repayments: enrichedRep,
    directional_balances,
    my_payables: enrichedTx.filter(
      (tx) =>
        tx.receiver_id === userId &&
        isDebtOriginatingTransaction(tx) &&
        tx.remaining_paisa > 0
    ),
    my_receivables: enrichedTx.filter(
      (tx) =>
        tx.sender_id === userId &&
        isDebtOriginatingTransaction(tx) &&
        tx.remaining_paisa > 0
    ),
  };
}

export async function listRemindersForUser(userId: string): Promise<EnrichedReminder[]> {
  await syncDueReminderNotifications();
  const { members, reminders } = await loadAllCoreEntities();
  return enrichReminders(members, reminders).filter(
    (r) => r.created_by === userId || r.recipient_id === userId
  );
}

export async function createReminderOperation(params: {
  actorUserId: string;
  recipientId: string;
  title: string;
  amountInput: string | number;
  reminderDate: string;
  reminderTime: string;
  description?: string;
}): Promise<EnrichedReminder> {
  assertValidMemberId(params.recipientId, 'recipient ID');
  assertDistinctMembers(
    params.actorUserId,
    params.recipientId,
    'Select one of the other two members as the reminder recipient.'
  );

  const amountPaisa = parsePkrToPaisa(params.amountInput);

  if (isMongoConfigured()) {
    await connectToDatabase();
    const [creator, recipient] = await Promise.all([
      UserModel.findOne({ _id: params.actorUserId, is_active: true }).lean(),
      UserModel.findOne({ _id: params.recipientId, is_active: true }).lean(),
    ]);
    if (!creator || !recipient) throw new Error('Member not found.');

    const doc = await ReminderModel.create({
      created_by: params.actorUserId,
      recipient_id: params.recipientId,
      title: params.title.trim(),
      amount_paisa: amountPaisa,
      amount_decimal: paisaToDecimal128(amountPaisa),
      reminder_date: params.reminderDate,
      reminder_time: params.reminderTime,
      description: params.description?.trim() ?? '',
      status: 'PENDING',
    });

    await NotificationModel.create({
      user_id: params.recipientId,
      title: `New payment reminder: ${params.title.trim()}`,
      message: `${(creator as any).full_name} set a reminder for Rs. ${formatPaisaPlain(amountPaisa)} on ${params.reminderDate} at ${params.reminderTime}.`,
      notification_type: 'REMINDER',
      is_read: false,
      related_entity_id: String(doc._id),
    });

    await AuditLogModel.create({
      user_id: params.actorUserId,
      action: 'CREATE_REMINDER',
      entity_type: 'Reminder',
      entity_id: String(doc._id),
      details: `${params.title.trim()} · Rs. ${formatPaisaPlain(amountPaisa)}`,
    });

    const members = await listPublicMembers();
    return enrichReminders(members, [mapMongoReminder(doc)])[0];
  }

  const createdRaw = await withLocalWriteLock(async () => {
    const state = readLocalState();
    const creator = state.users.find((u) => u.id === params.actorUserId && u.is_active);
    const recipient = state.users.find((u) => u.id === params.recipientId && u.is_active);
    if (!creator || !recipient) throw new Error('Member not found.');

    const now = new Date().toISOString();
    const raw: StoredReminderRaw = {
      id: createObjectIdString(),
      created_by: params.actorUserId,
      recipient_id: params.recipientId,
      title: params.title.trim(),
      amount_paisa: amountPaisa,
      reminder_date: params.reminderDate,
      reminder_time: params.reminderTime,
      description: params.description?.trim() ?? '',
      status: 'PENDING',
      completed_at: null,
      notified_overdue: false,
      created_at: now,
    };
    state.reminders.push(raw);

    state.notifications.push({
      id: createObjectIdString(),
      user_id: params.recipientId,
      title: `New payment reminder: ${raw.title}`,
      message: `${creator.full_name} set a reminder for Rs. ${formatPaisaPlain(amountPaisa)} on ${raw.reminder_date} at ${raw.reminder_time}.`,
      notification_type: 'REMINDER',
      is_read: false,
      related_entity_id: raw.id,
      created_at: now,
    });

    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: params.actorUserId,
      action: 'CREATE_REMINDER',
      entity_type: 'Reminder',
      entity_id: raw.id,
      details: `${raw.title} · Rs. ${formatPaisaPlain(amountPaisa)}`,
      created_at: now,
    });

    writeLocalState(state);
    return raw;
  });

  const members = await listPublicMembers();
  return enrichReminders(members, [createdRaw])[0];
}

export async function updateReminderOperation(params: {
  actorUserId: string;
  reminderId: string;
  updates: {
    recipient_id?: string;
    title?: string;
    amount?: string | number;
    reminder_date?: string;
    reminder_time?: string;
    description?: string;
    status?: 'PENDING' | 'COMPLETED';
  };
}): Promise<EnrichedReminder> {
  assertValidMemberId(params.reminderId, 'reminder ID');

  if (params.updates.recipient_id) {
    assertValidMemberId(params.updates.recipient_id, 'recipient ID');
    assertDistinctMembers(params.actorUserId, params.updates.recipient_id);
  }

  const amountPaisa =
    params.updates.amount !== undefined ? parsePkrToPaisa(params.updates.amount) : undefined;

  if (isMongoConfigured()) {
    await connectToDatabase();
    const existing = await ReminderModel.findById(params.reminderId).lean();
    if (!existing) throw new Error('Reminder not found.');
    const r: any = existing;
    assertUserIsParticipant(params.actorUserId, [String(r.created_by), String(r.recipient_id)]);

    const patch: Record<string, any> = {};
    if (params.updates.recipient_id) patch.recipient_id = params.updates.recipient_id;
    if (params.updates.title) patch.title = params.updates.title.trim();
    if (amountPaisa !== undefined) {
      patch.amount_paisa = amountPaisa;
      patch.amount_decimal = paisaToDecimal128(amountPaisa);
    }
    if (params.updates.reminder_date) {
      patch.reminder_date = params.updates.reminder_date;
      patch.notified_overdue = false;
    }
    if (params.updates.reminder_time) {
      patch.reminder_time = params.updates.reminder_time;
      patch.notified_overdue = false;
    }
    if (params.updates.description !== undefined) patch.description = params.updates.description.trim();
    if (params.updates.status) {
      patch.status = params.updates.status;
      patch.completed_at = params.updates.status === 'COMPLETED' ? new Date() : null;
    }

    const updated = await ReminderModel.findByIdAndUpdate(
      params.reminderId,
      { $set: patch },
      { new: true }
    ).lean();
    await AuditLogModel.create({
      user_id: params.actorUserId,
      action: 'UPDATE_REMINDER',
      entity_type: 'Reminder',
      entity_id: params.reminderId,
      details: `Updated reminder (${params.updates.status ?? 'edited'})`,
    });

    const members = await listPublicMembers();
    return enrichReminders(members, [mapMongoReminder(updated)])[0];
  }

  const updatedRaw = await withLocalWriteLock(async () => {
    const state = readLocalState();
    const item = state.reminders.find((r) => r.id === params.reminderId);
    if (!item) throw new Error('Reminder not found.');
    assertUserIsParticipant(params.actorUserId, [item.created_by, item.recipient_id]);

    if (params.updates.recipient_id) item.recipient_id = params.updates.recipient_id;
    if (params.updates.title) item.title = params.updates.title.trim();
    if (amountPaisa !== undefined) item.amount_paisa = amountPaisa;
    if (params.updates.reminder_date) {
      item.reminder_date = params.updates.reminder_date;
      item.notified_overdue = false;
    }
    if (params.updates.reminder_time) {
      item.reminder_time = params.updates.reminder_time;
      item.notified_overdue = false;
    }
    if (params.updates.description !== undefined) {
      item.description = params.updates.description.trim();
    }
    if (params.updates.status) {
      item.status = params.updates.status;
      item.completed_at = params.updates.status === 'COMPLETED' ? new Date().toISOString() : null;
    }

    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: params.actorUserId,
      action: 'UPDATE_REMINDER',
      entity_type: 'Reminder',
      entity_id: item.id,
      details: `Updated reminder (${params.updates.status ?? 'edited'})`,
      created_at: new Date().toISOString(),
    });
    writeLocalState(state);
    return item;
  });

  const members = await listPublicMembers();
  return enrichReminders(members, [updatedRaw])[0];
}

export async function deleteReminderOperation(params: {
  actorUserId: string;
  reminderId: string;
}): Promise<void> {
  assertValidMemberId(params.reminderId, 'reminder ID');

  if (isMongoConfigured()) {
    await connectToDatabase();
    const existing = await ReminderModel.findById(params.reminderId).lean();
    if (!existing) throw new Error('Reminder not found.');
    const r: any = existing;
    assertUserIsParticipant(params.actorUserId, [String(r.created_by), String(r.recipient_id)]);
    await ReminderModel.findByIdAndDelete(params.reminderId);
    await AuditLogModel.create({
      user_id: params.actorUserId,
      action: 'DELETE_REMINDER',
      entity_type: 'Reminder',
      entity_id: params.reminderId,
      details: `Deleted reminder "${r.title}"`,
    });
    return;
  }

  await withLocalWriteLock(async () => {
    const state = readLocalState();
    const idx = state.reminders.findIndex((r) => r.id === params.reminderId);
    if (idx === -1) throw new Error('Reminder not found.');
    const item = state.reminders[idx];
    assertUserIsParticipant(params.actorUserId, [item.created_by, item.recipient_id]);
    state.reminders.splice(idx, 1);
    state.audit_logs.push({
      id: createObjectIdString(),
      user_id: params.actorUserId,
      action: 'DELETE_REMINDER',
      entity_type: 'Reminder',
      entity_id: item.id,
      details: `Deleted reminder "${item.title}"`,
      created_at: new Date().toISOString(),
    });
    writeLocalState(state);
  });
}

export async function getReportsPayload(userId: string) {
  const { members, transactions, repayments } = await loadAllCoreEntities();
  const userMetrics = computeDashboardMetrics(userId, transactions, repayments);
  const directional_balances = computeDirectionalPairBalances(members, transactions, repayments);
  const enrichedTx = enrichTransactions(members, transactions, repayments);
  const enrichedRep = enrichRepayments(members, transactions, repayments);

  const memberSummaries = members.map((m) => ({
    member: m,
    metrics: computeDashboardMetrics(m.id, transactions, repayments),
  }));

  const pendingPayments = enrichedTx.filter(
    (tx) => isDebtOriginatingTransaction(tx) && tx.remaining_paisa > 0
  );
  const paidDebts = enrichedTx.filter(
    (tx) => isDebtOriginatingTransaction(tx) && tx.status === 'PAID'
  );

  const myMonthly = computeMonthlySeries(userId, transactions, repayments, 6);
  const groupMonthly = computeMonthlySeries(null, transactions, repayments, 6);

  // Group totals across all 3 friends
  let groupTotalLendingPaisa = 0;
  for (const tx of transactions) {
    if (tx.status !== 'REVERSED' && isDebtOriginatingTransaction(tx)) {
      groupTotalLendingPaisa += tx.amount_paisa;
    }
  }
  let groupTotalRepaymentsPaisa = 0;
  for (const rep of repayments) {
    if (!rep.is_reversed) groupTotalRepaymentsPaisa += rep.amount_paisa;
  }

  return {
    user_metrics: userMetrics,
    group_totals: {
      total_lending_paisa: groupTotalLendingPaisa,
      total_repayments_paisa: groupTotalRepaymentsPaisa,
      total_outstanding_paisa: Math.max(0, groupTotalLendingPaisa - groupTotalRepaymentsPaisa),
    },
    member_summaries: memberSummaries,
    directional_balances,
    pending_payments: pendingPayments,
    fully_paid_debts: paidDebts,
    monthly_user_series: myMonthly,
    monthly_group_series: groupMonthly,
    recent_repayments: enrichedRep.slice(0, 20),
  };
}
