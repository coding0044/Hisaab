import { describe, expect, it } from "vitest";
import type { Repayment, Txn } from "@/lib/ledger";
import {
  calculateReceiptTotals,
  paymentReceiptMessage,
  receiptReference,
} from "@/lib/payment-receipt";

const transactions = [
  { id: "txn-1", amount: 800 },
  { id: "txn-2", amount: 500 },
] as Txn[];

const repayments = [
  { transaction_id: "txn-1", amount: 300, status: "confirmed" },
  { transaction_id: "txn-1", amount: 100, status: "pending" },
  { transaction_id: "txn-2", amount: 100, status: "rejected" },
  { transaction_id: "other", amount: 900, status: "confirmed" },
] as Repayment[];

describe("payment reminder receipt", () => {
  it("counts only confirmed repayments for the included debts", () => {
    expect(calculateReceiptTotals(transactions, repayments)).toEqual({
      totalAmount: 1300,
      previouslyPaid: 300,
      outstanding: 1000,
    });
  });

  it("formats a friendly WhatsApp message from dynamic totals", () => {
    const message = paymentReceiptMessage({
      creditor: "Faraz Ahmed",
      debtor: "Mir Hassan",
      totals: { totalAmount: 1000, previouslyPaid: 300, outstanding: 700 },
    });
    expect(message).toContain("Assalam-o-Alaikum Mir Hassan!");
    expect(message).toContain("💵 Total Amount: PKR 1,000");
    expect(message).toContain("✅ Previously Paid: PKR 300");
    expect(message).toContain("🔔 Remaining Balance: PKR 700");
    expect(message).toContain("📌 Payment Status: Pending");
  });

  it("generates a unique receipt reference with the supplied date", () => {
    const reference = receiptReference(new Date("2026-10-30T00:00:00.000Z"));
    expect(reference).toMatch(/^HIS-20261030-[A-F0-9]{8}$/);
  });
});
