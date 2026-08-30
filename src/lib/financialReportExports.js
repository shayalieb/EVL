const money = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function reportDefinition(tab, reports) {
  if (tab === 'receivables') return { title: 'Receivables Aging', headers: ['Client', 'Booking', 'Invoice', 'Due date', 'Days overdue', 'Balance'], rows: reports.receivables.rows.map((row) => [row.clientName, row.bookingName, row.invoiceNumber ?? '', row.dueDate ? row.dueDate.slice(0, 10) : '', row.overdueDays, money(row.balance)]), summary: `Total outstanding: ${money(reports.receivables.total)}` };
  if (tab === 'payables') return { title: 'Contractor Payables', headers: ['Contractor', 'Event', 'Event date', 'Days past event', 'Expected pay'], rows: reports.payables.rows.map((row) => [row.contractorName, row.eventName, row.eventDate || '', row.overdueDays, money(row.expectedAmount)]), summary: `Total payables: ${money(reports.payables.total)}` };
  if (tab === 'profitability') return { title: 'Booking Profitability', headers: ['Booking', 'Event date', 'Billed', 'Collected', 'Outstanding', 'Contractor costs', 'Other costs', 'Profit', 'Margin'], rows: reports.profitability.rows.map((row) => [row.name, row.eventDate || '', money(row.billed), money(row.collected), money(row.outstanding), money(row.contractorCosts), money(row.otherCosts), money(row.profit), row.margin === null ? '' : `${row.margin.toFixed(1)}%`]), summary: `Total profit: ${money(reports.profitability.totalProfit)}` };
  const pnl = reports.profitAndLoss;
  return { title: 'Profit & Loss — Cash Basis', headers: ['Type', 'Category', 'Amount'], rows: [...pnl.income.map((row) => ['Income', row.category.replaceAll('_', ' '), money(row.amount)]), ...pnl.expenses.map((row) => ['Expense', row.category.replaceAll('_', ' '), money(row.amount)])], summary: `Net income: ${money(pnl.netIncome)}` };
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
