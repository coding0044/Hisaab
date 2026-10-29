import { describe, expect, it } from "vitest";
import type { Profile, Txn } from "@/lib/ledger";
import {
  normalizePakistaniWhatsAppNumber,
  paymentNotificationMessage,
  reminderMessage,
  whatsappChatUrl,
} from "@/lib/whatsapp";

const faraz = {
  id: "faraz",
  email: "faraz@example.com",
  display_name: "Faraz Ahmed",
  whatsapp_opted_in_at: null,
  whatsapp_phone: "+923332853138",
  created_at: "",
} satisfies Profile;
const mir = {
  ...faraz,
  id: "mir",
  display_name: "Mir Hassan",
  whatsapp_phone: "+923443579010",
} satisfies Profile;
const transaction = {
  amount: 1500,
  outstanding: 1000,
  owed_by: mir.id,
  paid_by: faraz.id,
  description: "Dinner",
  txn_date: "2026-10-29",
} as Txn;

describe("WhatsApp helpers", () => {
  it("normalizes local and international Pakistani mobile numbers", () => {
    expect(normalizePakistaniWhatsAppNumber("0333 285 3138")).toBe("+923332853138");
    expect(normalizePakistaniWhatsAppNumber("+923443579010")).toBe("+923443579010");
    expect(normalizePakistaniWhatsAppNumber("123")).toBeNull();
  });

  it("addresses a reminder to the debtor with the actual outstanding balance", () => {
    const message = reminderMessage(transaction, mir, faraz);
    expect(message).toContain("Hi Mir Hassan!");
    expect(message).toContain('expense for "Dinner" on 2026-10-29');
    expect(message).toContain("Faraz Ahmed originally paid PKR 1,500");
    expect(message).toContain("remaining balance you owe is PKR 1,000");
    expect(whatsappChatUrl(mir.whatsapp_phone!, message)).toBe(
      `https://wa.me/923443579010?text=${encodeURIComponent(message)}`,
    );
    expect(
      whatsappChatUrl(
        faraz.whatsapp_phone!,
        reminderMessage({ ...transaction, owed_by: faraz.id, paid_by: mir.id } as Txn, faraz, mir),
      ),
    ).toContain("https://wa.me/923332853138?");
  });

  it("builds the repayment notification with the submitted details", () => {
    expect(
      paymentNotificationMessage({
        payerName: "Mir Hassan",
        payeeName: "Faraz Ahmed",
        amount: 1000,
        method: "cash",
      }),
    ).toContain(
      "Mir Hassan has submitted a repayment request of PKR 1,000 to Faraz Ahmed. Payment method: Cash. Status: Awaiting Confirmation.",
    );
  });
});
