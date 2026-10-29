import { formatPKR, type Profile, type Txn } from "@/lib/ledger";

const formatWhatsAppPKR = (amount: number | string | null | undefined) =>
  formatPKR(amount).replace(/^Rs\.\s*/, "PKR ");

export function normalizePakistaniWhatsAppNumber(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, "");
  const international = compact.startsWith("+") ? compact.slice(1) : compact;
  const normalized = /^03\d{9}$/.test(international)
    ? `92${international.slice(1)}`
    : international;
  return /^923\d{9}$/.test(normalized) ? `+${normalized}` : null;
}

export function whatsappChatUrl(phone: string, message: string): string | null {
  const normalized = normalizePakistaniWhatsAppNumber(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}`;
}

export function reminderMessage(transaction: Txn, debtor: Profile, creditor: Profile): string {
  const details = transaction.description ? ` for "${transaction.description}"` : "";
  const date = transaction.txn_date ? ` on ${transaction.txn_date}` : "";
  return `Hi ${debtor.display_name}! Friendly reminder about the expense${details}${date}. ${creditor.display_name} originally paid ${formatWhatsAppPKR(
    transaction.amount,
  )}. After confirmed repayments, the remaining balance you owe is ${formatWhatsAppPKR(
    transaction.outstanding,
  )}. Please submit a repayment request through our website after paying. Thank you!`;
}

export function paymentNotificationMessage({
  payerName,
  payeeName,
  amount,
  method,
}: {
  payerName: string;
  payeeName: string;
  amount: number;
  method: string;
}): string {
  const paymentMethod = method === "bank_transfer" ? "Bank Transfer" : "Cash";
  return `Payment Notification: ${payerName} has submitted a repayment request of ${formatWhatsAppPKR(
    amount,
  )} to ${payeeName}. Payment method: ${paymentMethod}. Status: Awaiting Confirmation. Please open the application to review the request and confirm receipt.`;
}
