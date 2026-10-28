import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { RepayNowButton, RepaymentReviewActions } from "@/components/repayment-actions";
import { ProofPreview, StatusBadge } from "@/components/ledger-ui";
import {
  formatPKR,
  methodLabel,
  profilesQuery,
  proofsQuery,
  repCode,
  repaymentsQuery,
  transactionsQuery,
  txnCode,
  categoryLabel,
} from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/history")({
  validateSearch: z.object({ txn: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "History — Hisaab" },
      { name: "description", content: "Full transaction history." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { txn } = Route.useSearch();
  const { profile } = Route.useRouteContext();
  const { data: txns = [] } = useQuery(transactionsQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const { data: repayments = [] } = useQuery(repaymentsQuery);
  const { data: proofs = [] } = useQuery(proofsQuery);
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "—";
  const selected = txns.find((t) => t.id === txn);
  const selectedRepayments = repayments.filter((r) => r.transaction_id === selected?.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Transaction history</h1>
      {selected && (
        <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {txnCode(selected.ref_no)} · {selected.txn_date}
              </p>
              <h2 className="mt-1 text-lg font-semibold">{selected.description}</h2>
              <p className="text-sm text-muted-foreground">
                {name(selected.paid_by)} paid {formatPKR(selected.amount)} ·{" "}
                {name(selected.owed_by)} owes {formatPKR(selected.outstanding)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={selected.status} />
              <RepayNowButton
                transaction={selected}
                currentUserId={profile.id}
                recipientName={name(selected.paid_by)}
                repayments={repayments}
              />
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-medium">Repayment history</h3>
            {selectedRepayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repayments recorded.</p>
            ) : (
              <div className="divide-y">
                {selectedRepayments.map((r) => {
                  const proof = proofs.find((p) => p.repayment_id === r.id);
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {repCode(r.ref_no)} · {formatPKR(r.amount)} · {name(r.payer)} paid{" "}
                          {name(r.payee)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()} · {methodLabel(r.method)}
                          {r.note ? ` · ${r.note}` : ""}
                        </p>
                        {r.review_note && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Review note: {r.review_note}
                          </p>
                        )}
                        {proof && (
                          <div className="mt-2">
                            <ProofPreview proof={proof} />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={r.status} />
                        <RepaymentReviewActions repayment={r} currentUserId={profile.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {[
                "ID",
                "Date",
                "Paid by",
                "Owed by",
                "Amount",
                "Repaid",
                "Outstanding",
                "Category",
                "Status",
                "Action",
              ].map((h) => (
                <th key={h} className="px-3 py-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id} className={t.id === txn ? "bg-primary/10" : "border-t"}>
                <td className="px-3 py-2 num">
                  <Link
                    to="/history"
                    search={{ txn: t.id ?? undefined }}
                    className="text-primary hover:underline"
                  >
                    {txnCode(t.ref_no)}
                  </Link>
                </td>
                <td className="px-3 py-2">{t.txn_date}</td>
                <td className="px-3 py-2">{name(t.paid_by)}</td>
                <td className="px-3 py-2">{name(t.owed_by)}</td>
                <td className="px-3 py-2 num">{formatPKR(t.amount)}</td>
                <td className="px-3 py-2 num">{formatPKR(t.repaid)}</td>
                <td className="px-3 py-2 num">{formatPKR(t.outstanding)}</td>
                <td className="px-3 py-2">{categoryLabel(t.category ?? "")}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-3 py-2">
                  <RepayNowButton
                    transaction={t}
                    currentUserId={profile.id}
                    recipientName={name(t.paid_by)}
                    repayments={repayments}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {txns.length === 0 && (
          <p className="p-6 text-center text-muted-foreground">No transactions yet.</p>
        )}
      </div>
    </div>
  );
}
