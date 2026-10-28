import { describe, expect, it } from "vitest";
import { availableRepaymentAmount, type Repayment, type Txn } from "@/lib/ledger";

const txn: Txn = {
  amount: 100,
  awaiting: 0,
  category: "loan",
  client_request_id: "request",
  created_at: "2026-01-01T00:00:00Z",
  created_by: "faraz",
  description: "Shared expense",
  id: "transaction",
  outstanding: 100,
  owed_by: "mir",
  paid_by: "faraz",
  ref_no: 1,
  repaid: 0,
  status: "pending",
  txn_date: "2026-01-01",
};

function repayment(status: string, amount: number): Repayment {
  return {
    amount,
    client_request_id: `request-${status}-${amount}`,
    created_at: "2026-01-01T00:00:00Z",
    id: `repayment-${status}-${amount}`,
    method: "cash",
    note: null,
    payee: "faraz",
    payer: "mir",
    ref_no: 1,
    review_note: null,
    reviewed_at: null,
    status,
    transaction_id: "transaction",
  };
}

describe("availableRepaymentAmount", () => {
  it("allows partial and full repayments without exceeding the confirmed outstanding balance", () => {
    expect(availableRepaymentAmount(txn, [])).toBe(100);
    expect(availableRepaymentAmount(txn, [repayment("pending", 35)])).toBe(65);
    expect(availableRepaymentAmount(txn, [repayment("pending", 100)])).toBe(0);
  });

  it("does not reserve rejected repayments and excludes unrelated transactions", () => {
    expect(availableRepaymentAmount(txn, [repayment("rejected", 100)])).toBe(100);
    expect(
      availableRepaymentAmount(txn, [{ ...repayment("pending", 75), transaction_id: "another" }]),
    ).toBe(100);
  });

  it("uses the current balance in either debtor direction and never returns a negative amount", () => {
    const reverseDebt = { ...txn, owed_by: "faraz", paid_by: "mir", outstanding: 30 };
    expect(availableRepaymentAmount(reverseDebt, [repayment("pending", 10)])).toBe(20);
    expect(availableRepaymentAmount({ ...reverseDebt, outstanding: 0 }, [])).toBe(0);
  });
});
