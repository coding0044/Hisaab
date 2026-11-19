import { formatPaisaPlain } from './financial-calculations.ts';

/**
 * Normalize Pakistani phone numbers into international wa.me format (923XXXXXXXXX).
 */
export function toWhatsAppInternationalNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('92')) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    return `92${digits.slice(1)}`;
  }
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = toWhatsAppInternationalNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function buildMoneyGivenWhatsAppMessage(params: {
  receiverName: string;
  senderName: string;
  amountPaisa: number;
}): string {
  const amount = formatPaisaPlain(params.amountPaisa);
  return `Hello ${params.receiverName}, ${params.senderName} has recorded Rs. ${amount} as money given to you. Please check your Hisaab account.`;
}

export function buildMoneyGivenWhatsAppUrl(params: {
  receiverPhone: string;
  receiverName: string;
  senderName: string;
  amountPaisa: number;
}): string {
  return buildWhatsAppUrl(
    params.receiverPhone,
    buildMoneyGivenWhatsAppMessage({
      receiverName: params.receiverName,
      senderName: params.senderName,
      amountPaisa: params.amountPaisa,
    })
  );
}

export function buildRepaymentWhatsAppMessage(params: {
  receiverName: string;
  payerName: string;
  amountPaisa: number;
  remainingPaisa: number;
}): string {
  const amount = formatPaisaPlain(params.amountPaisa);
  const remaining = formatPaisaPlain(params.remainingPaisa);
  return `Hello ${params.receiverName}, ${params.payerName} has repaid Rs. ${amount}. Your remaining outstanding balance is Rs. ${remaining}.`;
}

export function buildRepaymentWhatsAppUrl(params: {
  receiverPhone: string;
  receiverName: string;
  payerName: string;
  amountPaisa: number;
  remainingPaisa: number;
}): string {
  return buildWhatsAppUrl(
    params.receiverPhone,
    buildRepaymentWhatsAppMessage({
      receiverName: params.receiverName,
      payerName: params.payerName,
      amountPaisa: params.amountPaisa,
      remainingPaisa: params.remainingPaisa,
    })
  );
}

export function buildReminderWhatsAppMessage(params: {
  recipientName: string;
  senderName: string;
  amountPaisa: number;
}): string {
  const amount = formatPaisaPlain(params.amountPaisa);
  return `Hello ${params.recipientName}, this is a friendly reminder that you have Rs. ${amount} pending to repay ${params.senderName}.`;
}

export function buildReminderWhatsAppUrl(params: {
  recipientPhone: string;
  recipientName: string;
  senderName: string;
  amountPaisa: number;
}): string {
  return buildWhatsAppUrl(
    params.recipientPhone,
    buildReminderWhatsAppMessage({
      recipientName: params.recipientName,
      senderName: params.senderName,
      amountPaisa: params.amountPaisa,
    })
  );
}
