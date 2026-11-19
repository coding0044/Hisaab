import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { DirectionalPairBalance, LedgerEntry } from '../../types/index.ts';
import { formatDateDisplay, formatPKR, formatStatusLabel, formatTransactionTypeLabel } from './utils.ts';

export function exportTransactionsToPDF(entries: LedgerEntry[], ownerName: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Hisaab — Transaction Ledger (PKR)', 40, 42);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Generated for ${ownerName} · Exported on ${new Date().toLocaleDateString('en-GB')} · Entries: ${entries.length}`,
    40,
    60
  );

  autoTable(doc, {
    startY: 76,
    head: [['Ref ID', 'Date', 'Type', 'Sender / Payer', 'Receiver', 'Amount (PKR)', 'Remaining', 'Status', 'Description']],
    body: entries.map((e) => [
      e.reference_code,
      formatDateDisplay(e.date),
      formatTransactionTypeLabel(e.transaction_type),
      e.sender_name,
      e.receiver_name,
      formatPKR(e.amount_paisa),
      e.entry_kind === 'TRANSACTION' && e.transaction_type !== 'REVERSAL'
        ? formatPKR(e.remaining_paisa)
        : '—',
      formatStatusLabel(e.status),
      e.description,
    ]),
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  doc.save(`friends-hisaab-transactions-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportTransactionsToExcel(entries: LedgerEntry[]): void {
  const rows = entries.map((e) => ({
    'Reference ID': e.reference_code,
    Date: e.date,
    Type: formatTransactionTypeLabel(e.transaction_type),
    'Sender / Payer': e.sender_name,
    Receiver: e.receiver_name,
    'Amount (PKR)': e.amount_paisa / 100,
    'Repaid (PKR)': e.repaid_amount_paisa / 100,
    'Remaining (PKR)': e.remaining_paisa / 100,
    'Payment Method': e.payment_method ?? '—',
    Status: formatStatusLabel(e.status),
    Description: e.description,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, `friends-hisaab-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportReportsToPDF(params: {
  ownerName: string;
  directionalBalances: DirectionalPairBalance[];
  memberSummaries: Array<{
    member: { full_name: string; email: string; phone_number: string };
    metrics: {
      total_given_paisa: number;
      total_borrowed_paisa: number;
      total_received_paisa: number;
      total_repaid_paisa: number;
      total_receivable_paisa: number;
      total_payable_paisa: number;
    };
  }>;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Hisaab — Financial Summary Report (PKR)', 40, 42);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Prepared for ${params.ownerName} · ${new Date().toLocaleDateString('en-GB')}`, 40, 60);

  doc.setFontSize(12);
  doc.setTextColor(15);
  doc.text('Member-Wise Financial Summary', 40, 88);

  autoTable(doc, {
    startY: 98,
    head: [['Member', 'Given', 'Borrowed', 'Received', 'Repaid', 'Receivable', 'Payable']],
    body: params.memberSummaries.map((m) => [
      m.member.full_name,
      formatPKR(m.metrics.total_given_paisa),
      formatPKR(m.metrics.total_borrowed_paisa),
      formatPKR(m.metrics.total_received_paisa),
      formatPKR(m.metrics.total_repaid_paisa),
      formatPKR(m.metrics.total_receivable_paisa),
      formatPKR(m.metrics.total_payable_paisa),
    ]),
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  const nextY = ((doc as any).lastAutoTable?.finalY ?? 220) + 26;
  doc.setFontSize(12);
  doc.text('Separate Directional Balances (Creditor -> Debtor)', 40, nextY);

  autoTable(doc, {
    startY: nextY + 10,
    head: [['Creditor', 'Debtor', 'Total Given', 'Total Repaid', 'Outstanding']],
    body:
      params.directionalBalances.length > 0
        ? params.directionalBalances.map((d) => [
            d.creditor_name,
            d.debtor_name,
            formatPKR(d.total_given_paisa),
            formatPKR(d.total_repaid_paisa),
            formatPKR(d.outstanding_paisa),
          ])
        : [['No active balances', '—', 'Rs. 0', 'Rs. 0', 'Rs. 0']],
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [5, 150, 105] },
  });

  doc.save(`friends-hisaab-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportReportsToExcel(params: {
  directionalBalances: DirectionalPairBalance[];
  memberSummaries: Array<{
    member: { full_name: string; email: string; phone_number: string };
    metrics: {
      total_given_paisa: number;
      total_borrowed_paisa: number;
      total_received_paisa: number;
      total_repaid_paisa: number;
      total_receivable_paisa: number;
      total_payable_paisa: number;
    };
  }>;
}): void {
  const wb = XLSX.utils.book_new();

  const summaryRows = params.memberSummaries.map((m) => ({
    Member: m.member.full_name,
    Email: m.member.email,
    WhatsApp: m.member.phone_number,
    'Total Given (PKR)': m.metrics.total_given_paisa / 100,
    'Total Borrowed (PKR)': m.metrics.total_borrowed_paisa / 100,
    'Total Received (PKR)': m.metrics.total_received_paisa / 100,
    'Total Repaid (PKR)': m.metrics.total_repaid_paisa / 100,
    'Receivable (PKR)': m.metrics.total_receivable_paisa / 100,
    'Payable (PKR)': m.metrics.total_payable_paisa / 100,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Member Summary');

  const pairRows = params.directionalBalances.map((d) => ({
    Creditor: d.creditor_name,
    Debtor: d.debtor_name,
    'Given (PKR)': d.total_given_paisa / 100,
    'Repaid (PKR)': d.total_repaid_paisa / 100,
    'Outstanding (PKR)': d.outstanding_paisa / 100,
    'Open Debts': d.pending_transactions_count,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pairRows), 'Directional Balances');

  XLSX.writeFile(wb, `friends-hisaab-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
