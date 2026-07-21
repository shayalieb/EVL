import { formatCurrency as currency, formatEventDate } from './format';

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function todayLabel() {
  return formatEventDate(new Date().toISOString().slice(0, 10));
}

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildProposalDoc({ booking, client, businessInfo }) {
  const hours = booking.proposal?.hours;
  const lineItems = booking.proposal?.lineItems || [];
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Letterhead — company logo (if set) beside the business name/contact info.
  let textX = marginX;
  if (businessInfo?.logo) {
    const dims = await loadImageDimensions(businessInfo.logo);
    if (dims) {
      const h = 16;
      const w = h * (dims.width / dims.height);
      doc.addImage(businessInfo.logo, 'PNG', marginX, y - 5, w, h);
      textX = marginX + w + 5;
    }
  }
  doc.setFontSize(15);
  doc.setTextColor(20);
  doc.text(businessInfo?.name || 'Event Proposal', textX, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(110);
  const contactLine = [businessInfo?.address, businessInfo?.phone, businessInfo?.email].filter(Boolean).join('   ·   ');
  if (contactLine) {
    doc.text(contactLine, textX, y);
    y += 5;
  }

  y = Math.max(y, 28) + 4;
  doc.setDrawColor(225);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 11;

  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text('Event Proposal', marginX, y);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(todayLabel(), pageWidth - marginX, y, { align: 'right' });
  y += 12;

  doc.setFontSize(10);
  doc.setTextColor(140);
  doc.text('PREPARED FOR', marginX, y);
  y += 6;
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(client ? `${client.firstName} ${client.lastName}` : '—', marginX, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90);
  const clientContact = [client?.email, client?.phone].filter(Boolean).join('   ·   ');
  if (clientContact) {
    doc.text(clientContact, marginX, y);
    y += 5;
  }
  y += 6;

  const eventRows = [
    ['Event Type', booking.eventType || '—'],
    ['Event Date', booking.eventDate ? formatEventDate(booking.eventDate) : 'Tentative'],
    ['Package / Tier', booking.package || '—'],
    ['Estimated Hours', hours ? `${hours} hrs` : '—'],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Event Details', '']],
    body: eventRows,
    theme: 'striped',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  const grandTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const investmentRows = [
    ...lineItems.map((item) => [item.name || 'Item', currency(Number(item.amount) || 0)]),
    ['Grand Total', currency(grandTotal)],
    ['Deposit Amount', booking.depositAmount ? currency(booking.depositAmount) : '—'],
    ['Deposit Due Date', booking.depositDueDate ? formatEventDate(booking.depositDueDate) : '—'],
    ['Deposit Status', booking.depositPaid ? 'Paid' : booking.depositAmount ? 'Due' : '—'],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Investment', '']],
    body: investmentRows,
    theme: 'striped',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [79, 70, 229] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.raw[0] === 'Grand Total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [238, 242, 255];
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (booking.notes) {
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('Additional Details', marginX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(90);
    const notesLines = doc.splitTextToSize(booking.notes, pageWidth - marginX * 2);
    doc.text(notesLines, marginX, y);
    y += notesLines.length * 5 + 6;
  }

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(`Thank you for considering ${businessInfo?.name || 'us'} for your event!`, marginX, Math.max(y + 4, 280));

  const clientLabel = client ? `${client.firstName}-${client.lastName}` : 'Client';
  const filename = `Proposal-${clientLabel}.pdf`.replace(/\s+/g, '-');
  return { doc, filename };
}

export async function generateProposalPdf(args) {
  const { doc, filename } = await buildProposalDoc(args);
  doc.save(filename);
}

// Returns the same PDF as a base64 string so it can be sent as an email
// attachment without a round-trip through document storage.
export async function generateProposalPdfAttachment(args) {
  const { doc, filename } = await buildProposalDoc(args);
  // jsPDF has no plain "base64" output type (only 'datauristring' and
  // friends) — passing 'base64' silently returns null with no error.
  const dataUri = doc.output('datauristring', filename);
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return { filename, contentType: 'application/pdf', base64 };
}
