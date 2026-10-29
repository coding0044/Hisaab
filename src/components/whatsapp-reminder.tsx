import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reminderMessage, whatsappChatUrl } from "@/lib/whatsapp";
import type { Profile, Txn } from "@/lib/ledger";

export function WhatsAppReminderButton({
  transaction,
  currentUserId,
  debtor,
  creditor,
}: {
  transaction: Txn;
  currentUserId: string;
  debtor: Profile;
  creditor: Profile;
}) {
  if (
    transaction.paid_by !== currentUserId ||
    Number(transaction.outstanding) <= 0 ||
    !debtor.whatsapp_phone
  ) {
    return null;
  }

  const url = whatsappChatUrl(
    debtor.whatsapp_phone,
    reminderMessage(transaction, debtor, creditor),
  );
  if (!url) return null;

  return (
    <Button asChild size="sm" variant="outline" className="shrink-0">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="mr-1.5 h-4 w-4" />
        Send WhatsApp Reminder
      </a>
    </Button>
  );
}
