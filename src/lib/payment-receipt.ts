import { formatPKR, type Repayment, type Txn } from "@/lib/ledger";

export type ReceiptTotals = {
  totalAmount: number;
  previouslyPaid: number;
  outstanding: number;
};

export function calculateReceiptTotals(
  transactions: Pick<Txn, "id" | "amount">[],
  repayments: Pick<Repayment, "transaction_id" | "amount" | "status">[],
): ReceiptTotals {
  const amountsByTransaction = new Map(
    transactions.map((transaction) => [transaction.id, Number(transaction.amount ?? 0)]),
  );
  const totalAmount = [...amountsByTransaction.values()].reduce((sum, amount) => sum + amount, 0);
  const previouslyPaid = repayments
    .filter(
      (repayment) =>
        repayment.status === "confirmed" && amountsByTransaction.has(repayment.transaction_id),
    )
    .reduce((sum, repayment) => sum + Number(repayment.amount), 0);

  return {
    totalAmount,
    previouslyPaid,
    outstanding: Math.max(0, totalAmount - previouslyPaid),
  };
}

export function paymentReceiptMessage({
  creditor,
  debtor,
  totals,
}: {
  creditor: string;
  debtor: string;
  totals: ReceiptTotals;
}): string {
  return `Assalam-o-Alaikum ${debtor}! 👋

I hope you're doing well. 😊

💰 PAYMENT REMINDER
Here's your current payment summary:

━━━━━━━━━━━━━━━━
🧾 PAYMENT SUMMARY

👤 From: ${creditor}
👥 To: ${debtor}

💵 Total Amount: ${formatPKR(totals.totalAmount).replace(/^Rs\.\s*/, "PKR ")}
✅ Previously Paid: ${formatPKR(totals.previouslyPaid).replace(/^Rs\.\s*/, "PKR ")}
🔔 Remaining Balance: ${formatPKR(totals.outstanding).replace(/^Rs\.\s*/, "PKR ")}

📌 Payment Status: ${totals.outstanding > 0 ? "Pending" : "Settled"}
━━━━━━━━━━━━━━━━

Kindly settle the remaining balance whenever possible.

Once you've made the payment, please submit your repayment request through our website so the payment can be verified and your outstanding balance updated.

Thank you for your cooperation! 🙏

— ${creditor}`;
}

export function receiptReference(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `HIS-${date}-${suffix}`;
}
