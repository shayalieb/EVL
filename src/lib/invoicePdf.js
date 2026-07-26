import { formatCurrency as currency, formatEventDate } from './format';
import { computeOfferingTotal, computeOfferingsTotal } from './offerings';
import { getDocumentStyle } from './documentLayouts';
import { scaleFont, setFontStyle, drawLetterhead, drawHeaderRule, getAutoTableStyle } from './documentPdfKit';

const STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Open',
  partial: 'Partially Paid',
  paid: 'Paid',
  void: 'Void',
};

// Mirrors InvoiceDocument.jsx's content/order (letterhead, header rule,
// invoice meta, bill-to/event/due-date row, line items, totals, memo,
// footer) so the PDF matches what the composer preview and the public pay
// page show on-screen.
async function buildInvoiceDoc({ businessInfo, client, event, lineItems, dueDate, memo, total, status, paidAmount, number, issueDate }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const { layout, scale, accentRgb } = getDocumentStyle(businessInfo);
  const tableStyle = getAutoTableStyle(layout, scale, accentRgb);
  const items = lineItems || [];
  const grandTotal = total ?? computeOfferingsTotal(items);
  const balanceDue = grandTotal - (paidAmount || 0);
  const align = layout.headerAlign === 'center' ? 'center' : 'left';
  const titleX = align === 'center' ? pageWidth / 2 : marginX;
  let y = 18;

  y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Your Business' });
  y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

  doc.setFontSize(scaleFont(20, scale));
  doc.setTextColor(20);
  doc.text('Invoice', titleX, y, { align });
  doc.setFontSize(scaleFont(10, scale));
  doc.setTextColor(110);
  const issueLabel = formatEventDate(issueDate ? issueDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  doc.text(issueLabel, pageWidth - marginX, y, { align: 'right' });
  y += 8;

  doc.setFontSize(scaleFont(10, scale));
  doc.setTextColor(140);
  const numberLabel = number != null && number !== '' ? `#${number}` : 'Draft';
  const statusLabel = status ? STATUS_LABELS[status] : null;
  doc.text([numberLabel, statusLabel].filter(Boolean).join('   ·   '), titleX, y, { align });
  y += 10;

  const colWidth = (pageWidth - marginX * 2) / 3;
  const eventLine = event ? [event.type, event.date ? formatEventDate(event.date) : null].filter(Boolean).join(' · ') : '';

  doc.setFontSize(scaleFont(9, scale));
  doc.setTextColor(140);
  doc.text('BILL TO', marginX, y);
  if (eventLine) doc.text('EVENT', marginX + colWidth, y);
  doc.text('DUE DATE', marginX + colWidth * 2, y);
  y += 6;

  doc.setFontSize(scaleFont(11, scale));
  doc.setTextColor(30);
  const clientName = client ? `${client.firstName} ${client.lastName}`.trim() : 'Your client';
  doc.text(clientName, marginX, y);
  if (eventLine) doc.text(eventLine, marginX + colWidth, y);
  doc.text(dueDate ? formatEventDate(dueDate.slice(0, 10)) : 'Due on receipt', marginX + colWidth * 2, y);
  y += 5;

  doc.setFontSize(scaleFont(9, scale));
  doc.setTextColor(110);
  if (client?.email) doc.text(client.email, marginX, y);
  y += 10;

  if (items.length === 0) {
    doc.setFontSize(scaleFont(10, scale));
    doc.setTextColor(140);
    doc.text('No line items yet.', marginX, y);
    y += 10;
  } else {
    const itemRows = items.map((item) => [
      item.details ? `${item.name || 'Item'}\n${item.details}` : (item.name || 'Item'),
      item.type === 'perUnit' ? String(item.unitCount ?? '') : '—',
      item.type === 'perUnit' ? currency(item.ratePerUnit) : '—',
      currency(computeOfferingTotal(item)),
    ]);
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Description', 'Qty', 'Rate', 'Amount']],
      body: itemRows,
      ...tableStyle,
      columnStyles: {
        1: { halign: 'right', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 30 },
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  setFontStyle(doc, layout, 'normal');
  const labelX = pageWidth - marginX - 45;
  doc.setFontSize(scaleFont(10, scale));
  doc.setTextColor(90);
  doc.text('Subtotal', labelX, y);
  doc.setTextColor(30);
  doc.text(currency(grandTotal), pageWidth - marginX, y, { align: 'right' });
  y += 6;

  if (status === 'partial') {
    doc.setTextColor(90);
    doc.text('Paid', labelX, y);
    doc.setTextColor(22, 163, 74);
    doc.text(`−${currency(paidAmount)}`, pageWidth - marginX, y, { align: 'right' });
    y += 6;
  }

  setFontStyle(doc, layout, 'bold');
  doc.setFontSize(scaleFont(11, scale));
  doc.setTextColor(20);
  const totalLabel = status === 'partial' ? 'Balance Due' : status === 'paid' ? 'Total Paid' : 'Total Due';
  doc.text(totalLabel, labelX, y);
  doc.text(currency(status === 'partial' ? balanceDue : grandTotal), pageWidth - marginX, y, { align: 'right' });
  setFontStyle(doc, layout, 'normal');
  y += 10;

  if (memo) {
    doc.setFontSize(scaleFont(10, scale));
    doc.setTextColor(90);
    const lines = doc.splitTextToSize(memo, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 5 + 6;
  }

  doc.setFontSize(scaleFont(9, scale));
  doc.setTextColor(140);
  doc.text('Thank you for your business!', pageWidth / 2, Math.max(y + 4, 280), { align: 'center' });

  const clientLabel = client ? `${client.firstName}-${client.lastName}` : 'Client';
  const filename = `Invoice-${clientLabel}.pdf`.replace(/\s+/g, '-');
  return { doc, filename };
}

export async function generateInvoicePdf(args) {
  const { doc, filename } = await buildInvoiceDoc(args);
  doc.save(filename);
}

export async function getInvoicePdfDataUrl(args) {
  const { doc } = await buildInvoiceDoc(args);
  return doc.output('datauristring');
}
