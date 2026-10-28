import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FilePick } from "@/components/ledger-ui";
import {
  availableRepaymentAmount,
  errorMessage,
  formatPKR,
  uploadProof,
  type Repayment,
  type Txn,
} from "@/lib/ledger";

export function RepayNowButton({
  transaction,
  currentUserId,
  recipientName,
  repayments,
}: {
  transaction: Txn;
  currentUserId: string;
  recipientName: string;
  repayments: Repayment[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer">("cash");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef<string | null>(null);
  const available = availableRepaymentAmount(transaction, repayments);

  const transactionId = transaction.id;
  if (transaction.owed_by !== currentUserId || !transactionId || available <= 0) return null;

  async function submit(event: FormEvent<HTMLFormElement>, transactionId: string) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(amount) ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      toast.error("Enter a valid amount greater than zero");
      return;
    }
    if (parsedAmount > available) {
      toast.error(`Amount cannot exceed ${formatPKR(available)}`);
      return;
    }

    setBusy(true);
    try {
      const proof = file ? await uploadProof(currentUserId, file) : null;
      const clientRequestId = requestId.current ?? crypto.randomUUID();
      requestId.current = clientRequestId;
      const { error } = await supabase.rpc("submit_repayment", {
        _transaction_id: transactionId,
        _amount: parsedAmount,
        _method: method,
        _note: note.trim(),
        _client_request_id: clientRequestId,
        ...(proof
          ? {
              _proof_path: proof.path,
              _proof_name: proof.name,
              _proof_mime: proof.mime,
            }
          : {}),
      });
      if (error) throw error;

      requestId.current = null;
      toast.success("Repayment submitted for confirmation");
      await queryClient.invalidateQueries({ queryKey: ["ledger"] });
      setOpen(false);
      setAmount("");
      setNote("");
      setFile(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="shrink-0"
        onClick={() => {
          setAmount(available.toFixed(2));
          setOpen(true);
        }}
      >
        Repay Now
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Repay {recipientName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(event) => submit(event, transactionId)} className="space-y-4">
            <div className="rounded-lg bg-secondary/60 p-3 text-sm">
              <p className="flex justify-between gap-3">
                <span>Outstanding balance</span>
                <strong className="num">{formatPKR(transaction.outstanding)}</strong>
              </p>
              {available < Number(transaction.outstanding) && (
                <p className="mt-1 flex justify-between gap-3 text-muted-foreground">
                  <span>Available to repay (excluding pending requests)</span>
                  <span className="num">{formatPKR(available)}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`repayment-amount-${transaction.id}`}>Amount to repay (PKR)</Label>
              <Input
                id={`repayment-amount-${transaction.id}`}
                type="number"
                inputMode="decimal"
                min="0.01"
                max={available}
                step="0.01"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`repayment-method-${transaction.id}`}>Payment method</Label>
              <select
                id={`repayment-method-${transaction.id}`}
                className="h-10 w-full rounded-md border bg-background px-3"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value === "bank_transfer" ? "bank_transfer" : "cash")
                }
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`repayment-proof-${transaction.id}`}>
                Payment screenshot or receipt (optional)
              </Label>
              <FilePick id={`repayment-proof-${transaction.id}`} file={file} onChange={setFile} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`repayment-note-${transaction.id}`}>Note (optional)</Label>
              <Textarea
                id={`repayment-note-${transaction.id}`}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Submitting…" : "Submit Repayment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RepaymentReviewActions({
  repayment,
  currentUserId,
}: {
  repayment: Repayment;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (repayment.status !== "pending" || repayment.payee !== currentUserId) return null;

  async function review(decision: "confirmed" | "rejected") {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("review_repayment", {
        _repayment_id: repayment.id,
        _decision: decision,
      });
      if (error) throw error;
      toast.success(decision === "confirmed" ? "Repayment confirmed" : "Repayment rejected");
      await queryClient.invalidateQueries({ queryKey: ["ledger"] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => review("confirmed")} disabled={busy}>
        Confirm Received
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => review("rejected")}
        disabled={busy}
      >
        Reject Payment
      </Button>
    </div>
  );
}
