import type {
  DashboardMetrics,
  DirectionalPairBalance,
  EnrichedTransaction,
  MemberPairCardSummary,
  MonthlyActivityPoint,
  PublicMember,
  RepaymentRecord,
  TransactionRecord,
} from '../types/index.ts';

/**
 * Parse a PKR monetary input (string or finite number) into exact integer paisa (1 PKR = 100 paisa).
 * Strictly avoids floating-point multiplication errors by parsing decimal digits via string regex.
 */
export function parsePkrToPaisa(input: string | number): number {
  const raw = typeof input === 'number' ? input.toFixed(2) : String(input).trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('Invalid PKR amount format. Enter a positive amount with up to 2 decimal places.');
  }
  const [wholePart, fracPart = ''] = raw.split('.');
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, '0'), 10);
  const paisa = whole * 100 + frac;
  if (!Number.isSafeInteger(paisa) || paisa <= 0) {
    throw new Error('Amount must be greater than Rs. 0.');
  }
  return paisa;
}

/**
 * Convert integer paisa into numeric PKR value strictly for chart plotting (never used for balance math).
 */
export function paisaToChartPkr(paisa: number): number {
  const whole = Math.trunc(paisa / 100);
  const rem = Math.abs(paisa % 100);
  return Number(`${whole}.${String(rem).padStart(2, '0')}`);
}

/**
 * Format integer paisa into PKR currency display (e.g., "Rs. 1,500" or "Rs. 1,500.50").
 * Uses integer division and modulo — zero floating-point inaccuracy.
 */
export function formatPKR(paisa: number, options?: { signed?: boolean; compact?: boolean }): string {
  const safePaisa = Number.isFinite(paisa) ? Math.trunc(paisa) : 0;
  const isNegative = safePaisa < 0;
  const absPaisa = Math.abs(safePaisa);
  const whole = Math.floor(absPaisa / 100);
  const frac = absPaisa % 100;

  if (options?.compact && whole >= 100000) {
    const lacs = Math.floor(whole / 1000) / 100;
    const prefix = isNegative ? '-' : options?.signed && safePaisa > 0 ? '+' : '';
    return `${prefix}Rs. ${lacs.toFixed(1)}L`;
  }

  const formattedWhole = whole.toLocaleString('en-PK');
  const formattedFrac = frac > 0 ? `.${String(frac).padStart(2, '0')}` : '';
  const signPrefix = isNegative ? '-' : options?.signed && safePaisa > 0 ? '+' : '';
  return `${signPrefix}Rs. ${formattedWhole}${formattedFrac}`;
}

/**
 * Format integer paisa without currency prefix (e.g., "500" or "500.50") for WhatsApp & receipts.
 */
export function formatPaisaPlain(paisa: number): string {
  const absPaisa = Math.abs(Math.trunc(paisa));
  const whole = Math.floor(absPaisa / 100);
  const frac = absPaisa % 100;
  const formattedWhole = whole.toLocaleString('en-PK');
  return frac > 0 ? `${formattedWhole}.${String(frac).padStart(2, '0')}` : formattedWhole;
}

/**
 * Determine whether a transaction creates a valid debt obligation from sender -> receiver.
 * Both MONEY_GIVEN and MONEY_RECEIVED (loan inflow) represent sender giving money to receiver.
 */
export function isDebtOriginatingTransaction(tx: TransactionRecord): boolean {
  return (
    (tx.status === 'PENDING' ||
      tx.status === 'APPROVED' ||
      tx.status === 'PAID' ||
      tx.status === 'PARTIALLY_PAID') &&
    (tx.transaction_type === 'MONEY_GIVEN' || tx.transaction_type === 'MONEY_RECEIVED')
  );
}

/**
 * Compute remaining balance on a single transaction in integer paisa.
 */
export function getTransactionRemainingPaisa(
  tx: TransactionRecord,
  repaymentsByTxId: Map<string, number>
): number {
  if (!isDebtOriginatingTransaction(tx)) {
    return 0;
  }
  const repaid = repaymentsByTxId.get(tx.id) ?? tx.repaid_amount_paisa ?? 0;
  return Math.max(0, tx.amount_paisa - repaid);
}

/**
 * Build map of transaction_id -> total valid repaid paisa from verified repayment records.
 */
export function buildRepaidByTransactionMap(repayments: RepaymentRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of repayments) {
    if (r.is_reversed) continue;
    map.set(r.transaction_id, (map.get(r.transaction_id) ?? 0) + r.amount_paisa);
  }
  return map;
}

/**
 * Compute all separate directional pair balances (Creditor -> Debtor).
 * Opposite directions (e.g., Faraz -> Peer Bux vs Peer Bux -> Faraz) are NEVER merged or auto-cancelled.
 */
export function computeDirectionalPairBalances(
  members: PublicMember[],
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[]
): DirectionalPairBalance[] {
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const repaidByTx = buildRepaidByTransactionMap(repayments);
  const pairMap = new Map<string, DirectionalPairBalance>();

  for (const creditor of members) {
    for (const debtor of members) {
      if (creditor.id === debtor.id) continue;
      const key = `${creditor.id}->${debtor.id}`;
      pairMap.set(key, {
        creditor_id: creditor.id,
        creditor_name: creditor.full_name,
        debtor_id: debtor.id,
        debtor_name: debtor.full_name,
        total_given_paisa: 0,
        total_repaid_paisa: 0,
        outstanding_paisa: 0,
        pending_transactions_count: 0,
      });
    }
  }

  for (const tx of transactions) {
    if (tx.status === 'REVERSED') continue;
    const key = `${tx.sender_id}->${tx.receiver_id}`;
    const entry = pairMap.get(key);
    if (!entry) continue;

    if (isDebtOriginatingTransaction(tx)) {
      entry.total_given_paisa += tx.amount_paisa;
      const repaidForTx = repaidByTx.get(tx.id) ?? 0;
      const remainingForTx = Math.max(0, tx.amount_paisa - repaidForTx);
      if (remainingForTx > 0) {
        entry.pending_transactions_count += 1;
      }
    } else if (tx.transaction_type === 'ADJUSTMENT') {
      entry.total_given_paisa += tx.amount_paisa;
    }
  }

  for (const rep of repayments) {
    if (rep.is_reversed) continue;
    // Repayment is paid by debtor (payer_id) to creditor (receiver_id)
    const key = `${rep.receiver_id}->${rep.payer_id}`;
    const entry = pairMap.get(key);
    if (!entry) continue;
    entry.total_repaid_paisa += rep.amount_paisa;
  }

  for (const entry of pairMap.values()) {
    entry.outstanding_paisa = Math.max(0, entry.total_given_paisa - entry.total_repaid_paisa);
  }

  return Array.from(pairMap.values()).filter(
    (p) =>
      memberMap.has(p.creditor_id) &&
      memberMap.has(p.debtor_id) &&
      (p.total_given_paisa > 0 || p.total_repaid_paisa > 0)
  );
}

/**
 * Compute dashboard metrics strictly from verified transactions and repayments for a specific member.
 */
export function computeDashboardMetrics(
  userId: string,
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[]
): DashboardMetrics {
  let total_given_paisa = 0;
  let total_borrowed_paisa = 0;
  let total_received_paisa = 0;
  let total_repaid_paisa = 0;

  for (const tx of transactions) {
    if (tx.status === 'REVERSED') continue;
    if (isDebtOriginatingTransaction(tx) || tx.transaction_type === 'ADJUSTMENT') {
      if (tx.sender_id === userId) {
        total_given_paisa += tx.amount_paisa;
      }
      if (tx.receiver_id === userId) {
        total_borrowed_paisa += tx.amount_paisa;
      }
    }
  }

  for (const rep of repayments) {
    if (rep.is_reversed) continue;
    if (rep.receiver_id === userId) {
      total_received_paisa += rep.amount_paisa;
    }
    if (rep.payer_id === userId) {
      total_repaid_paisa += rep.amount_paisa;
    }
  }

  const total_receivable_paisa = Math.max(0, total_given_paisa - total_received_paisa);
  const total_payable_paisa = Math.max(0, total_borrowed_paisa - total_repaid_paisa);
  const net_outstanding_paisa = total_receivable_paisa - total_payable_paisa;

  return {
    total_given_paisa,
    total_borrowed_paisa,
    total_received_paisa,
    total_repaid_paisa,
    total_receivable_paisa,
    total_payable_paisa,
    net_outstanding_paisa,
  };
}

/**
 * Compute member-by-member summaries relative to the currently authenticated member.
 */
export function computeMemberSummaries(
  currentUserId: string,
  members: PublicMember[],
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[]
): MemberPairCardSummary[] {
  return members.map((member) => {
    const memberMetrics = computeDashboardMetrics(member.id, transactions, repayments);

    let given_to_member_paisa = 0;
    let received_from_member_paisa = 0;
    let borrowed_from_member_paisa = 0;
    let repaid_to_member_paisa = 0;

    for (const tx of transactions) {
      if (tx.status === 'REVERSED') continue;
      if (isDebtOriginatingTransaction(tx) || tx.transaction_type === 'ADJUSTMENT') {
        if (tx.sender_id === currentUserId && tx.receiver_id === member.id) {
          given_to_member_paisa += tx.amount_paisa;
        }
        if (tx.sender_id === member.id && tx.receiver_id === currentUserId) {
          borrowed_from_member_paisa += tx.amount_paisa;
        }
      }
    }

    for (const rep of repayments) {
      if (rep.is_reversed) continue;
      if (rep.receiver_id === currentUserId && rep.payer_id === member.id) {
        received_from_member_paisa += rep.amount_paisa;
      }
      if (rep.payer_id === currentUserId && rep.receiver_id === member.id) {
        repaid_to_member_paisa += rep.amount_paisa;
      }
    }

    const receivable_from_member_paisa = Math.max(
      0,
      given_to_member_paisa - received_from_member_paisa
    );
    const payable_to_member_paisa = Math.max(
      0,
      borrowed_from_member_paisa - repaid_to_member_paisa
    );

    return {
      member,
      given_to_member_paisa,
      received_from_member_paisa,
      receivable_from_member_paisa,
      borrowed_from_member_paisa,
      repaid_to_member_paisa,
      payable_to_member_paisa,
      member_total_given_paisa: memberMetrics.total_given_paisa,
      member_total_received_paisa: memberMetrics.total_received_paisa,
      member_total_repaid_paisa: memberMetrics.total_repaid_paisa,
      net_with_member_paisa: receivable_from_member_paisa - payable_to_member_paisa,
    };
  });
}

/**
 * Compute FIFO repayment allocation across open debt transactions from payer_id to receiver_id.
 */
export function computeFIFOAllocations(
  openTransactions: EnrichedTransaction[],
  repaymentAmountPaisa: number
): Array<{ transaction: EnrichedTransaction; allocated_paisa: number; new_remaining_paisa: number }> {
  // Sort oldest first (transaction_date ASC, created_at ASC)
  const sorted = [...openTransactions]
    .filter((tx) => tx.remaining_paisa > 0)
    .sort((a, b) => {
      const dateCmp = a.transaction_date.localeCompare(b.transaction_date);
      if (dateCmp !== 0) return dateCmp;
      return a.created_at.localeCompare(b.created_at);
    });

  const totalOpenPaisa = sorted.reduce((acc, tx) => acc + tx.remaining_paisa, 0);
  if (repaymentAmountPaisa > totalOpenPaisa) {
    throw new Error(
      `Overpayment not allowed. Maximum payable across open debts is ${formatPKR(totalOpenPaisa)}.`
    );
  }

  let remainingToAllocate = repaymentAmountPaisa;
  const allocations: Array<{
    transaction: EnrichedTransaction;
    allocated_paisa: number;
    new_remaining_paisa: number;
  }> = [];

  for (const tx of sorted) {
    if (remainingToAllocate <= 0) break;
    const alloc = Math.min(tx.remaining_paisa, remainingToAllocate);
    allocations.push({
      transaction: tx,
      allocated_paisa: alloc,
      new_remaining_paisa: tx.remaining_paisa - alloc,
    });
    remainingToAllocate -= alloc;
  }

  return allocations;
}

/**
 * Compute last 6 months activity series for charts.
 */
export function computeMonthlySeries(
  userId: string | null,
  transactions: TransactionRecord[],
  repayments: RepaymentRecord[],
  monthsCount = 6
): MonthlyActivityPoint[] {
  const now = new Date();
  const buckets = new Map<
    string,
    {
      label: string;
      given_paisa: number;
      borrowed_paisa: number;
      rep_received_paisa: number;
      rep_paid_paisa: number;
    }
  >();

  for (let i = monthsCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    buckets.set(key, {
      label,
      given_paisa: 0,
      borrowed_paisa: 0,
      rep_received_paisa: 0,
      rep_paid_paisa: 0,
    });
  }

  for (const tx of transactions) {
    if (tx.status === 'REVERSED' || !isDebtOriginatingTransaction(tx)) continue;
    const key = tx.transaction_date.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (!userId || tx.sender_id === userId) {
      bucket.given_paisa += tx.amount_paisa;
    }
    if (!userId || tx.receiver_id === userId) {
      bucket.borrowed_paisa += tx.amount_paisa;
    }
  }

  for (const rep of repayments) {
    if (rep.is_reversed) continue;
    const key = rep.repayment_date.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (!userId || rep.receiver_id === userId) {
      bucket.rep_received_paisa += rep.amount_paisa;
    }
    if (!userId || rep.payer_id === userId) {
      bucket.rep_paid_paisa += rep.amount_paisa;
    }
  }

  return Array.from(buckets.entries()).map(([month, b]) => ({
    month,
    label: b.label,
    given_pkr: paisaToChartPkr(b.given_paisa),
    borrowed_pkr: paisaToChartPkr(b.borrowed_paisa),
    repayments_received_pkr: paisaToChartPkr(b.rep_received_paisa),
    repayments_paid_pkr: paisaToChartPkr(b.rep_paid_paisa),
  }));
}
