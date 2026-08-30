const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function reportDefinition(tab, reports) {
  if (tab === 'payables') return { title: 'Who You Owe', headers: ['Contractor', 'Event', 'Payment due', 'Status', 'Expected pay'], rows: reports.payables.rows.map((row) => [row.contractorName, row.eventName, row.paymentDueDate || 'Not set', row.label, money(row.expectedAmount)]), summary: `Total still to pay: ${money(reports.payables.total)}` };
  return { title: 'Who Owes You', headers: ['Client', 'Booking', 'Invoice', 'Due date', 'Days overdue', 'Balance'], rows: reports.receivables.rows.map((row) => [row.clientName, row.bookingName, row.invoiceNumber ?? '', row.dueDate ? row.dueDate.slice(0, 10) : '', row.overdueDays, money(row.balance)]), summary: `Total outstanding: ${money(reports.receivables.total)}` };
}

function safeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function filename(title, extension) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export function exportFinancialReportCsv({ tab, reports }) {
  const report = reportDefinition(tab, reports);
  const rows = [[report.title], [report.summary], [], report.headers, ...report.rows];
  const blob = new Blob([`\uFEFF${rows.map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename(report.title, 'csv'); anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportFinancialReportPdf({ tab, reports, businessInfo, groupName, from, to }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const report = reportDefinition(tab, reports);
  const doc = new jsPDF({ orientation: report.headers.length > 6 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(17); doc.setTextColor(30, 41, 59); doc.text(businessInfo?.name || 'GigWorks Financial Report', 14, 18);
  doc.setFontSize(13); doc.text(report.title, 14, 27);
  doc.setFontSize(9); doc.setTextColor(100);
  const period = from || to ? `${from || 'Beginning'} through ${to || 'Today'}` : 'All time';
  doc.text([groupName || 'All groups', period, `Generated ${new Date().toLocaleDateString()}`].join('  ·  '), 14, 34);
  doc.setDrawColor(79, 70, 229); doc.setLineWidth(0.6); doc.line(14, 38, pageWidth - 14, 38);
  doc.setFontSize(10); doc.setTextColor(30, 41, 59); doc.text(report.summary, 14, 45);
  autoTable(doc, { startY: 51, head: [report.headers], body: report.rows, theme: 'striped', styles: { fontSize: 8, cellPadding: 2.5 }, headStyles: { fillColor: [79, 70, 229], textColor: 255 }, margin: { left: 14, right: 14 } });
  doc.save(filename(report.title, 'pdf'));
}

function csvFile(headers, rows) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\r\n')}`;
}

function safeFilename(value) {
  return String(value || 'receipt').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 140) || 'receipt';
}

export async function exportBookkeeperPackage({ exportData, businessName, receiptUrl }) {
  const { strToU8, zipSync } = await import('fflate');
  const { transactions, summary, period, scope } = exportData;
  const activeExpenses = transactions.filter((tx) => tx.amount < 0 && !tx.reversed && !tx.reversalOfId);
  const receiptTransactions = activeExpenses.filter((tx) => tx.metadata?.receipt);
  if (receiptTransactions.length > 200 || summary.receiptBytes > 250 * 1024 * 1024) throw new Error('This package contains too many receipt files. Choose a shorter date range.');
  const ledgerHeaders = ['Date', 'Direction', 'Amount', 'Category', 'Description', 'Vendor / payee', 'Payment method', 'Reference', 'Booking', 'Event', 'Contractor', 'Invoice', 'Managed group', 'Entered by', 'Status', 'Internal note', 'Receipt filename'];
  const ledgerRows = transactions.map((tx) => [tx.occurredAt?.slice(0, 10), tx.amount >= 0 ? 'Money received' : 'Money paid out', Math.abs(tx.amount).toFixed(2), tx.category, tx.description, tx.metadata?.payee || '', tx.paymentMethod || '', tx.reference || '', tx.relatedBooking?.eventName || '', tx.relatedEvent?.name || '', tx.relatedContractor?.name || '', tx.relatedInvoice?.number ?? '', tx.group?.name || '', tx.createdBy ? `${tx.createdBy.firstName} ${tx.createdBy.lastName}`.trim() : 'System', tx.reversed ? 'Undone' : tx.reversalOfId ? 'Correction' : 'Posted', tx.memo || '', tx.metadata?.receipt?.filename || '']);
  const missingHeaders = ['Date', 'Description', 'Amount', 'Vendor / payee', 'Missing information'];
  const missingRows = activeExpenses.map((tx) => {
    const missing = [!tx.metadata?.receipt && 'receipt', !tx.metadata?.payee && 'vendor / payee', !tx.bookingId && !tx.eventId && !tx.contractorId && !tx.invoiceId && 'related record'].filter(Boolean);
    return missing.length ? [tx.occurredAt?.slice(0, 10), tx.description, Math.abs(tx.amount).toFixed(2), tx.metadata?.payee || '', missing.join('; ')] : null;
  }).filter(Boolean);
  const periodLabel = period.from || period.to ? `${period.from || 'Beginning'} through ${period.to || 'Today'}` : 'All time';
  const summaryText = [businessName || 'GigWorks account', 'Bookkeeper package', '', `Period: ${periodLabel}`, `Scope: ${scope.groupName || 'Entire account'}`, `Generated: ${new Date().toLocaleString()}`, '', `Money received: ${money(summary.moneyReceived)}`, `Money paid out: ${money(summary.moneyPaidOut)}`, `Difference: ${money(summary.net)}`, `Payment records: ${summary.transactionCount}`, `Receipts included: ${summary.receiptCount}`, '', 'Items to review', `Missing receipts: ${summary.missingReceiptCount}`, `Missing vendor / payee: ${summary.missingPayeeCount}`, `Not linked to an operational record: ${summary.unlinkedCount}`, '', 'This package is an operational record export and is not tax or accounting advice.'].join('\r\n');
  const files = { 'README.txt': strToU8(summaryText), 'payment-history.csv': strToU8(csvFile(ledgerHeaders, ledgerRows)), 'items-to-review.csv': strToU8(csvFile(missingHeaders, missingRows)) };
  const errors = [];
  for (let index = 0; index < receiptTransactions.length; index += 4) {
    const batch = receiptTransactions.slice(index, index + 4);
    await Promise.all(batch.map(async (tx) => {
      try {
        const response = await fetch(receiptUrl(tx.id, true), { credentials: 'include' });
        if (!response.ok) throw new Error(`Download returned ${response.status}`);
        const receipt = tx.metadata.receipt;
        const name = `${tx.occurredAt.slice(0, 10)}-${tx.id.slice(-7)}-${safeFilename(receipt.filename)}`;
        files[`receipts/${name}`] = new Uint8Array(await response.arrayBuffer());
      } catch (error) { errors.push(`${tx.occurredAt.slice(0, 10)} · ${tx.description}: ${error.message}`); }
    }));
  }
  if (errors.length) files['receipt-download-errors.txt'] = strToU8(['These receipts could not be downloaded. Retry the export or download them individually from Payment Details.', '', ...errors].join('\r\n'));
  const archive = zipSync(files, { level: 1 });
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bookkeeper-package-${period.from || 'all-time'}-${period.to || new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
  return { receiptErrors: errors.length };
}
