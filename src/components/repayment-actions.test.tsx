import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RepayNowButton, RepaymentReviewActions } from "@/components/repayment-actions";
import type { Repayment, Txn } from "@/lib/ledger";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));

const transaction: Txn = {
  amount: 100,
  awaiting: 0,
  category: "loan",
  client_request_id: "transaction-request",
  created_at: "2026-01-01T00:00:00Z",
  created_by: "faraz",
  description: "Shared expense",
  id: "transaction-id",
  outstanding: 100,
  owed_by: "mir",
  paid_by: "faraz",
  ref_no: 1,
  repaid: 0,
  status: "pending",
  txn_date: "2026-01-01",
};

const repayment: Repayment = {
  amount: 25,
  client_request_id: "repayment-request",
  created_at: "2026-01-01T00:00:00Z",
  id: "repayment-id",
  method: "cash",
  note: null,
  payee: "faraz",
  payer: "mir",
  ref_no: 1,
  review_note: null,
  reviewed_at: null,
  status: "pending",
  transaction_id: "transaction-id",
};

function renderWithQueryClient(element: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

describe("repayment actions", () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: "repayment-id", error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows repayment actions only to the current debtor in either direction", () => {
    const reverseTransaction = { ...transaction, owed_by: "faraz", paid_by: "mir" };
    renderWithQueryClient(
      <>
        <RepayNowButton transaction={transaction} currentUserId="mir" recipientName="Faraz Ahmed" repayments={[]} />
        <RepayNowButton transaction={transaction} currentUserId="faraz" recipientName="Faraz Ahmed" repayments={[]} />
        <RepayNowButton transaction={reverseTransaction} currentUserId="faraz" recipientName="Mir Hassan" repayments={[]} />
      </>,
    );

    expect(screen.getAllByRole("button", { name: "Repay Now" })).toHaveLength(2);
  });

  it("submits a repayment using the existing RPC", async () => {
    renderWithQueryClient(
      <RepayNowButton transaction={transaction} currentUserId="mir" recipientName="Faraz Ahmed" repayments={[]} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Repay Now" }));
    fireEvent.change(await screen.findByLabelText("Amount to repay (PKR)"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Payment method"), { target: { value: "cash" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Repayment" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        "submit_repayment",
        expect.objectContaining({
          _transaction_id: "transaction-id",
          _amount: 100,
          _method: "cash",
          _note: "",
        }),
      ),
    );
  });

  it("allows only the receiving person to confirm or reject a pending repayment", async () => {
    renderWithQueryClient(
      <>
        <RepaymentReviewActions repayment={repayment} currentUserId="faraz" />
        <RepaymentReviewActions repayment={repayment} currentUserId="mir" />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm Received" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("review_repayment", {
        _repayment_id: "repayment-id",
        _decision: "confirmed",
      }),
    );

    rpc.mockClear();
    cleanup();
    renderWithQueryClient(<RepaymentReviewActions repayment={repayment} currentUserId="faraz" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject Payment" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("review_repayment", {
        _repayment_id: "repayment-id",
        _decision: "rejected",
      }),
    );
  });
});
