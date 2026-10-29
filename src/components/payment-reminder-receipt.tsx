import { useState } from "react";
import { jsPDF } from "jspdf";
import { Check, Copy, Download, FileText, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateReceiptTotals,
  paymentReceiptMessage,
  receiptReference,
  type ReceiptTotals,
} from "@/lib/payment-receipt";
import { formatPKR, type Profile, type Repayment, type Txn } from "@/lib/ledger";
import { whatsappChatUrl } from "@/lib/whatsapp";

type Receipt = {
  reference: string;
  date: Date;
  totals: ReceiptTotals;
};

const PAGE_SIZE = 1000;

async function loadCurrentReceiptTotals(creditorId: string, debtorId: string) {
  const transactions: Txn[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transaction_summary")
      .select("*")
      .eq("paid_by", creditorId)
      .eq("owed_by", debtorId)
      .order("txn_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    transactions.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const repayments: Repayment[] = [];
  for (let offset = 0; offset < transactions.length; offset += 100) {
    const ids = transactions
      .slice(offset, offset + 100)
      .map((transaction) => transaction.id)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) continue;

    for (let pageOffset = 0; ; pageOffset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("repayments")
        .select("*")
        .in("transaction_id", ids)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true })
        .range(pageOffset, pageOffset + PAGE_SIZE - 1);
      if (error) throw error;
      repayments.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
  }

  return calculateReceiptTotals(transactions, repayments);
}

function createReceiptPdf(receipt: Receipt, creditor: Profile, debtor: Profile) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = width - margin * 2;
  const navy: [number, number, number] = [19, 38, 67];
  const green: [number, number, number] = [17, 133, 94];
  const muted: [number, number, number] = [99, 112, 128];

  pdf.setFillColor(247, 249, 252);
  pdf.rect(0, 0, width, 297, "F");
  pdf.setFillColor(...navy);
  pdf.roundedRect(margin, 16, contentWidth, 46, 5, 5, "F");
  pdf.setTextColor(117, 231, 196);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("HISAAB  /  SHARED LEDGER", margin + 9, 27);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.text("Payment Reminder Receipt", margin + 9, 39);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(220, 229, 239);
  pdf.text(`Receipt ${receipt.reference}`, margin + 9, 52);
  pdf.text(
    receipt.date.toLocaleDateString("en-PK", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    width - margin - 9,
    52,
    { align: "right" },
  );

  pdf.setFillColor(232, 247, 241);
  pdf.roundedRect(margin, 71, contentWidth, 43, 5, 5, "F");
  pdf.setTextColor(...green);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("CURRENT OUTSTANDING BALANCE", margin + 10, 84);
  pdf.setFontSize(25);
  pdf.text(formatPKR(receipt.totals.outstanding), margin + 10, 102);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, 124, contentWidth, 67, 5, 5, "F");

  const row = (label: string, value: string, y: number, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(...muted);
    pdf.text(label, margin + 10, y);
    pdf.setTextColor(...navy);
    pdf.text(value, width - margin - 10, y, { align: "right" });
  };
  row("From", creditor.display_name, 140);
  row("To", debtor.display_name, 153);
  row("Total amount owed", formatPKR(receipt.totals.totalAmount), 166);
  row("Previously paid (confirmed)", formatPKR(receipt.totals.previouslyPaid), 179);

  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, 199, contentWidth, 41, 5, 5, "F");
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("PAYMENT STATUS", margin + 10, 214);
  pdf.setTextColor(...green);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(receipt.totals.outstanding > 0 ? "Pending" : "Settled", margin + 10, 228);

  pdf.setTextColor(...navy);
  pdf.setFontSize(11);
  pdf.text("Payment instructions", margin, 256);
  pdf.setTextColor(...muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(
    pdf.splitTextToSize(
      "Please pay the outstanding balance and submit a repayment request through the website. The balance changes only after the recipient confirms receipt.",
      contentWidth,
    ),
    margin,
    264,
  );
  pdf.setDrawColor(220, 226, 234);
  pdf.line(margin, 283, width - margin, 283);
  pdf.setFontSize(8);
  pdf.text(
    "This reminder is a statement of the current ledger balance, not a payment confirmation.",
    margin,
    289,
  );
  return pdf;
}

export function PaymentReminderReceipt({
  creditor,
  debtor,
}: {
  creditor: Profile;
  debtor: Profile;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return typeof navigator.share === "function" && typeof navigator.canShare === "function";
  });

  async function generateReceipt() {
    setLoading(true);
    try {
      const totals = await loadCurrentReceiptTotals(creditor.id, debtor.id);
      if (totals.outstanding <= 0) {
        setReceipt(null);
        toast.info("There is no outstanding balance to remind them about.");
        return;
      }
      const date = new Date();
      setReceipt({ totals, date, reference: receiptReference(date) });
      setCopied(false);
    } catch (error) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "Unable to refresh the latest balance.";
      toast.error(`Could not create receipt: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  function getMessage(currentReceipt: Receipt) {
    return paymentReceiptMessage({
      creditor: creditor.display_name,
      debtor: debtor.display_name,
      totals: currentReceipt.totals,
    });
  }

  function getPdf(currentReceipt: Receipt) {
    return createReceiptPdf(currentReceipt, creditor, debtor);
  }

  function downloadReceipt(currentReceipt: Receipt) {
    getPdf(currentReceipt).save(`payment-reminder-${currentReceipt.reference}.pdf`);
    toast.success("Receipt downloaded. Attach the PDF to WhatsApp if needed.");
  }

  async function shareReceipt() {
    if (!receipt) return;
    const pdf = getPdf(receipt);
    const file = new File([pdf.output("blob")], `payment-reminder-${receipt.reference}.pdf`, {
      type: "application/pdf",
    });
    if (
      typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function" ||
      !navigator.canShare({ files: [file] })
    ) {
      setShareSupported(false);
      downloadReceipt(receipt);
      toast.info("Attach the downloaded PDF manually in WhatsApp.");
      return;
    }
    try {
      await navigator.share({
        title: "Payment Reminder Receipt",
        text: getMessage(receipt),
        files: [file],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not open the share sheet. Download the receipt and attach it manually.");
    }
  }

  async function copyMessage() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(getMessage(receipt));
      setCopied(true);
      toast.success("WhatsApp message copied");
    } catch {
      toast.error("Could not copy the message. Check clipboard permissions and try again.");
    }
  }

  const whatsappUrl =
    receipt && debtor.whatsapp_phone
      ? whatsappChatUrl(debtor.whatsapp_phone, getMessage(receipt))
      : null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700"
        onClick={() => void generateReceipt()}
        disabled={loading}
      >
        <FileText className="h-4 w-4" />
        {loading ? "Refreshing balance…" : "Create payment receipt"}
      </Button>

      <Dialog
        open={Boolean(receipt)}
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      >
        {receipt && (
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Payment Reminder Receipt</DialogTitle>
              <DialogDescription>
                Ref {receipt.reference} · Generated{" "}
                {receipt.date.toLocaleDateString("en-PK", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 rounded-2xl border bg-slate-50 p-4 sm:p-6">
              <div className="rounded-xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Current outstanding balance
                </p>
                <p className="num mt-2 text-3xl font-bold text-emerald-200">
                  {formatPKR(receipt.totals.outstanding)}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {creditor.display_name} → {debtor.display_name}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between border-b py-3 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-semibold">{creditor.display_name}</span>
                </div>
                <div className="flex items-center justify-between border-b py-3 text-sm">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-semibold">{debtor.display_name}</span>
                </div>
                <div className="flex items-center justify-between border-b py-3 text-sm">
                  <span className="text-muted-foreground">Total amount owed</span>
                  <span className="num font-semibold">{formatPKR(receipt.totals.totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-b py-3 text-sm">
                  <span className="text-muted-foreground">Previously paid · confirmed</span>
                  <span className="num font-semibold">
                    {formatPKR(receipt.totals.previouslyPaid)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 text-sm">
                  <span className="text-muted-foreground">Payment status</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {receipt.totals.outstanding > 0 ? "Pending" : "Settled"}
                  </span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Please pay the outstanding balance and submit a repayment request through the
                website. The balance updates only after the payment recipient confirms receipt.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => downloadReceipt(receipt)}>
                <Download className="h-4 w-4" />
                Download receipt
              </Button>
              <Button type="button" variant="outline" onClick={() => void copyMessage()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy message"}
              </Button>
              {shareSupported && (
                <Button type="button" variant="outline" onClick={() => void shareReceipt()}>
                  <Share2 className="h-4 w-4" />
                  Share receipt
                </Button>
              )}
              {whatsappUrl ? (
                <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    Send WhatsApp reminder
                  </a>
                </Button>
              ) : (
                <p className="self-center text-xs text-muted-foreground">
                  Add a valid WhatsApp number in Settings before sending.
                </p>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              WhatsApp opens with the message pre-filled. Review it and press Send. To attach the
              receipt, download it first and add it manually unless your device offers receipt
              sharing.
            </p>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
