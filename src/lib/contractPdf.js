import { formatCurrency as currency, formatEventDate } from './format';

const DEFAULT_ACCENT_COLOR = '#4f46e5';

function hexToRgb(hex) {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) return [79, 70, 229];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

// Blends a color most of the way to white — used for subtle row highlights
// (e.g. the Grand Total line) that should tint with the chosen accent color
// rather than always being the same fixed light-indigo.
function lightenRgb([r, g, b], amount = 0.9) {
  return [r, g, b].map((c) => Math.round(c + (255 - c) * amount));
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function signatureBlock(signature) {
  if (signature?.signedAt) {
    return `${signature.name}  ·  signed ${formatEventDate(new Date(signature.signedAt).toISOString().slice(0, 10))}`;
  }
  return 'Not yet signed';
}

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildContractDoc({ snapshot, terms, clientSignature, ownerSignature }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const businessInfo = snapshot.businessInfo || {};
  const client = snapshot.client || {};
  const booking = snapshot.booking || {};
  const accentRgb = hexToRgb(snapshot.style?.accentColor || DEFAULT_ACCENT_COLOR);
  let y = 18;

  let textX = marginX;
  if (businessInfo.logo) {
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
  doc.text(businessInfo.name || 'Event Contract', textX, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(110);
  const contactLine = [businessInfo.address, businessInfo.phone, businessInfo.email].filter(Boolean).join('   ·   ');
  if (contactLine) {
    doc.text(contactLine, textX, y);
    y += 5;
  }

  y = Math.max(y, 28) + 4;
  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.2);
  y += 11;

  doc.setFontSize(20);
  doc.setTextColor(20);
  doc.text('Event Contract', marginX, y);
  y += 12;

  doc.setFontSize(10);
  doc.setTextColor(140);
  doc.text('BETWEEN', marginX, y);
  y += 6;
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(businessInfo.name || 'The Business', marginX, y);
  doc.text(client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || '—' : '—', pageWidth - marginX, y, { align: 'right' });
  y += 5;
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(businessInfo.email || '', marginX, y);
  doc.text(client.email || '', pageWidth - marginX, y, { align: 'right' });
  y += 10;

  const eventRows = [
    ['Event Type', booking.eventType || '—'],
    ['Event Date', booking.eventDate ? formatEventDate(booking.eventDate) : 'Tentative'],
    ['Package / Tier', booking.package || '—'],
    ['Estimated Hours', snapshot.hours ? `${snapshot.hours} hrs` : '—'],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Event Details', '']],
    body: eventRows,
    theme: 'striped',
    styles: { fontSize: 10 },
    headStyles: { fillColor: accentRgb },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  const lineItems = snapshot.lineItems || [];
  const grandTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const pricingRows = [
    ...lineItems.map((item) => [item.name || 'Item', currency(Number(item.amount) || 0)]),
    ['Grand Total', currency(grandTotal)],
    ['Deposit Amount', booking.depositAmount ? currency(booking.depositAmount) : '—'],
    ['Deposit Due Date', booking.depositDueDate ? formatEventDate(booking.depositDueDate) : '—'],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Pricing', '']],
    body: pricingRows,
    theme: 'striped',
    styles: { fontSize: 10 },
    headStyles: { fillColor: accentRgb },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.raw[0] === 'Grand Total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = lightenRgb(accentRgb);
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  const customFields = (snapshot.customFields || []).filter((f) => f.label);
  if (customFields.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Additional Details', '']],
      body: customFields.map((f) => [f.label, f.value || '—']),
      theme: 'striped',
      styles: { fontSize: 10 },
      headStyles: { fillColor: accentRgb },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (booking.notes) {
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('Notes', marginX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(90);
    const notesLines = doc.splitTextToSize(booking.notes, pageWidth - marginX * 2);
    doc.text(notesLines, marginX, y);
    y += notesLines.length * 5 + 6;
  }

  if (terms) {
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text('Terms', marginX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(90);
    const termsLines = doc.splitTextToSize(terms, pageWidth - marginX * 2);
    doc.text(termsLines, marginX, y);
    y += termsLines.length * 5 + 6;
  }

  // Signatures — always on their own section near the bottom of the page,
  // regardless of how much content preceded it.
  const sigY = Math.max(y + 6, 235);
  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(0.6);
  doc.line(marginX, sigY, pageWidth - marginX, sigY);
  doc.setLineWidth(0.2);

  const colWidth = (pageWidth - marginX * 2 - 10) / 2;
  const leftX = marginX;
  const rightX = marginX + colWidth + 10;
  let sigLabelY = sigY + 10;

  doc.setFontSize(10);
  doc.setTextColor(140);
  doc.text('CLIENT SIGNATURE', leftX, sigLabelY);
  doc.text('BUSINESS SIGNATURE', rightX, sigLabelY);
  sigLabelY += 4;

  const sigImgH = 16;
  if (clientSignature?.image) {
    const dims = await loadImageDimensions(clientSignature.image);
    if (dims) doc.addImage(clientSignature.image, 'PNG', leftX, sigLabelY, sigImgH * (dims.width / dims.height), sigImgH);
  }
  if (ownerSignature?.image) {
    const dims = await loadImageDimensions(ownerSignature.image);
    if (dims) doc.addImage(ownerSignature.image, 'PNG', rightX, sigLabelY, sigImgH * (dims.width / dims.height), sigImgH);
  }
  sigLabelY += sigImgH + 4;

  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(signatureBlock(clientSignature), leftX, sigLabelY);
  doc.text(signatureBlock(ownerSignature), rightX, sigLabelY);

  const clientLabel = client?.firstName ? `${client.firstName}-${client.lastName || ''}` : 'Client';
  const filename = `Contract-${clientLabel}.pdf`.replace(/\s+/g, '-');
  return { doc, filename };
}

export async function generateContractPdf(args) {
  const { doc, filename } = await buildContractDoc(args);
  doc.save(filename);
}

export async function getContractPdfDataUrl(args) {
  const { doc } = await buildContractDoc(args);
  return doc.output('datauristring');
}
