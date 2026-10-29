import { useEffect } from "react";
import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Txn = Database["public"]["Views"]["transaction_summary"]["Row"];
export type Repayment = Database["public"]["Tables"]["repayments"]["Row"];
export type Proof = Database["public"]["Tables"]["payment_proofs"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export const CATEGORIES = [
  ["food", "Food & dining"],
  ["transport", "Transport"],
  ["shopping", "Shopping"],
  ["bills", "Bills & utilities"],
  ["rent", "Rent"],
  ["entertainment", "Entertainment"],
  ["travel", "Travel"],
  ["health", "Health"],
  ["loan", "Personal loan"],
  ["other", "Other"],
] as const;
export const categoryLabel = (c: string) => CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

export const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting confirmation",
  partially_paid: "Partially paid",
  awaiting_confirmation: "Awaiting confirmation",
  settled: "Settled",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

export const methodLabel = (m: string) => (m === "bank_transfer" ? "Bank transfer" : "Cash");

const pkr = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatPKR = (n: number | string | null | undefined) =>
  `Rs. ${pkr.format(Number(n ?? 0))}`;
export const txnCode = (n: number | null | undefined) => `TXN-${String(n ?? 0).padStart(5, "0")}`;
export const repCode = (n: number | null | undefined) => `RPY-${String(n ?? 0).padStart(5, "0")}`;

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return "Something went wrong. Please try again.";
}

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: () => unwrap(supabase.from("profiles").select("*").order("display_name")),
  staleTime: 5 * 60_000,
});

export const transactionsQuery = queryOptions({
  queryKey: ["ledger", "transactions"],
  queryFn: () =>
    unwrap(
      supabase
        .from("transaction_summary")
        .select("*")
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000),
    ),
});

export const repaymentsQuery = queryOptions({
  queryKey: ["ledger", "repayments"],
  queryFn: () =>
    unwrap(
      supabase.from("repayments").select("*").order("created_at", { ascending: false }).limit(1000),
    ),
});

export const proofsQuery = queryOptions({
  queryKey: ["ledger", "proofs"],
  queryFn: () => unwrap(supabase.from("payment_proofs").select("*").limit(1000)),
});

export const notificationsQuery = queryOptions({
  queryKey: ["ledger", "notifications"],
  queryFn: () =>
    unwrap(
      supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ),
});

/** Live-refresh all ledger data when either friend changes something. */
export function useLedgerRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`ledger-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () =>
        qc.invalidateQueries({ queryKey: ["ledger"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "repayments" }, () =>
        qc.invalidateQueries({ queryKey: ["ledger"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () =>
        qc.invalidateQueries({ queryKey: ["profiles"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
        qc.invalidateQueries({ queryKey: ["ledger", "notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
}

export function availableRepaymentAmount(txn: Txn, repayments: Repayment[]) {
  const outstanding = Math.max(0, Number(txn.outstanding ?? 0));
  const awaiting = repayments
    .filter((r) => r.transaction_id === txn.id && r.status === "pending")
    .reduce((total, r) => total + Number(r.amount), 0);
  return Math.max(0, outstanding - awaiting);
}

export const MAX_FILE = 10 * 1024 * 1024;
export const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
];

export async function uploadProof(userId: string, file: File) {
  if (file.size > MAX_FILE) throw new Error("File must be under 10 MB");
  if (!ALLOWED_MIME.includes(file.type))
    throw new Error("Upload an image (PNG, JPG, WEBP) or a PDF");
  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("proofs")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, name: file.name.slice(0, 200), mime: file.type };
}

export async function signedProofUrl(path: string) {
  const { data, error } = await supabase.storage.from("proofs").createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export function computeBalances(txns: Txn[], repayments: Repayment[], profiles: Profile[]) {
  const faraz = profiles.find((p) => p.email === "faraz.maju@gmail.com");
  const mir = profiles.find((p) => p.email === "mirhassan@gmail.com");
  let farazOwesMir = 0;
  let mirOwesFaraz = 0;
  for (const t of txns) {
    const out = Number(t.outstanding ?? 0);
    if (t.owed_by === faraz?.id) farazOwesMir += out;
    else if (t.owed_by === mir?.id) mirOwesFaraz += out;
  }
  const awaiting = repayments.filter((r) => r.status === "pending");
  const confirmed = repayments.filter((r) => r.status === "confirmed");
  return {
    faraz,
    mir,
    farazOwesMir,
    mirOwesFaraz,
    net: mirOwesFaraz - farazOwesMir, // >0 => Mir owes Faraz
    pendingDebts: farazOwesMir + mirOwesFaraz,
    pendingDebtCount: txns.filter((t) => Number(t.outstanding) > 0).length,
    awaitingTotal: awaiting.reduce((s, r) => s + Number(r.amount), 0),
    awaitingCount: awaiting.length,
    confirmedTotal: confirmed.reduce((s, r) => s + Number(r.amount), 0),
  };
}
