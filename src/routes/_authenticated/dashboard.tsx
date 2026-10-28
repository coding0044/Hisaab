import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { RepayNowButton, RepaymentReviewActions } from "@/components/repayment-actions";
import {
  availableRepaymentAmount,
  computeBalances,
  formatPKR,
  methodLabel,
  profilesQuery,
  repCode,
  repaymentsQuery,
  transactionsQuery,
  txnCode,
} from "@/lib/ledger";
import { EmptyState, StatusBadge } from "@/components/ledger-ui";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Hisaab" },
      { name: "description", content: "Shared balance summary in PKR." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile } = Route.useRouteContext();
  const { data: txns = [] } = useQuery(transactionsQuery);
  const { data: reps = [] } = useQuery(repaymentsQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const b = computeBalances(txns, reps, profiles);
  const name = (id: string | null) => profiles.find((p) => p.id === id)?.display_name ?? "—";
  const months = new Map<string, number>();
  for (const t of txns) {
    const k = (t.txn_date ?? "").slice(0, 7);
    months.set(k, (months.get(k) ?? 0) + Number(t.amount));
  }
  const netText =
    b.net === 0
      ? "All settled"
      : b.net > 0
        ? `Mir Hassan owes Faraz ${formatPKR(b.net)}`
        : `Faraz owes Mir Hassan ${formatPKR(-b.net)}`;
  const myDebts = txns.filter((t) => t.owed_by === profile.id && Number(t.outstanding) > 0);
  const incomingRepayments = reps.filter((r) => r.payee === profile.id && r.status === "pending");

  return (
    <div className="space-y-6">
      <section className="bg-hero rounded-2xl p-6 text-navy-foreground shadow-card">
        <p className="text-sm opacity-75">Welcome, {profile.display_name}</p>
        <h1 className="mt-2 text-3xl font-bold">{netText}</h1>
        <p className="mt-1 text-sm opacity-75">Net balance from confirmed records only</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Faraz owes Mir Hassan", b.farazOwesMir],
          ["Mir Hassan owes Faraz", b.mirOwesFaraz],
          ["Total pending debts", b.pendingDebts],
          [`Awaiting confirmation (${b.awaitingCount})`, b.awaitingTotal],
          ["Confirmed repayments", b.confirmedTotal],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="num mt-2 text-2xl font-semibold">{formatPKR(v as number)}</p>
          </div>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="mb-3 font-semibold">Outstanding debts you owe</h2>
        {myDebts.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have no outstanding debts.</p>
        ) : (
          <div className="divide-y">
            {myDebts.map((t) => {
              const awaiting = Number(t.outstanding) - availableRepaymentAmount(t, reps);
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    to="/history"
                    search={{ txn: t.id ?? undefined }}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {txnCode(t.ref_no)} · You owe {name(t.paid_by)} · Outstanding{" "}
                      {formatPKR(t.outstanding)}
                    </p>
                    {awaiting > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatPKR(awaiting)} awaiting confirmation
                      </p>
                    )}
                  </Link>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    <RepayNowButton
                      transaction={t}
                      currentUserId={profile.id}
                      recipientName={name(t.paid_by)}
                      repayments={reps}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {incomingRepayments.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <h2 className="mb-3 font-semibold">Repayments awaiting your confirmation</h2>
          <div className="divide-y">
            {incomingRepayments.map((r) => {
              const t = txns.find((item) => item.id === r.transaction_id);
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {formatPKR(r.amount)} from {name(r.payer)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {repCode(r.ref_no)} · {methodLabel(r.method)}
                      {t ? ` · ${t.description}` : ""}
                    </p>
                    {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
                  </div>
                  <RepaymentReviewActions repayment={r} currentUserId={profile.id} />
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="mb-3 font-semibold">Monthly expenses</h2>
        {[...months].slice(0, 6).map(([m, v]) => (
          <div key={m} className="flex justify-between py-1 text-sm">
            <span>{m}</span>
            <span className="num">{formatPKR(v)}</span>
          </div>
        ))}
        {months.size === 0 && <p className="text-sm text-muted-foreground">No expenses yet.</p>}
      </section>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="mb-3 font-semibold">Recent transactions</h2>
        {txns.length === 0 ? (
          <EmptyState icon={<Wallet />} title="Nothing recorded yet">
            <Link to="/add" className="text-primary">
              Add the first one
            </Link>
          </EmptyState>
        ) : (
          txns.slice(0, 8).map((t) => (
            <Link
              key={t.id}
              to="/history"
              search={{ txn: t.id ?? undefined }}
              className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t.description}</p>
                <p className="text-xs text-muted-foreground">
                  {txnCode(t.ref_no)} · {name(t.paid_by)} paid for {name(t.owed_by)}
                </p>
              </div>
              <div className="text-right">
                <p className="num text-sm">{formatPKR(t.outstanding)}</p>
                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
