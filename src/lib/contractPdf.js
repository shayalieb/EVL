import { formatCurrency as currency, formatEventDate, formatVenueLine } from './format';

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
  doc.text(snapshot.title || 'Event Contract', pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Compact, centered block: "BETWEEN" label, party names with "AND"
  // between them on one line (sized/weighted to match, not a stray tiny
  // word), and a single combined contact line underneath.
  const centerX = pageWidth / 2;
  const businessName = businessInfo.name || 'The Business';
  const clientName = client ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || '—' : '—';

  const lineGap = 5.5;
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text('BETWEEN', centerX, y, { align: 'center' });
  y += lineGap;

  const gap = 5;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  const businessW = doc.getTextWidth(businessName);
  const clientW = doc.getTextWidth(clientName);
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  const andW = doc.getTextWidth('AND');
  const totalW = businessW + gap + andW + gap + clientW;
  let partyX = centerX - totalW / 2;
  const businessBlockCenterX = partyX + businessW / 2;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30);
  doc.text(businessName, partyX, y);
  partyX += businessW + gap;

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(120);
  doc.text('AND', partyX, y);
  partyX += andW + gap;

  const clientBlockCenterX = partyX + clientW / 2;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30);
  doc.text(clientName, partyX, y);
  doc.setFont(undefined, 'normal');
  y += lineGap;

  // Each email sits centered under its own party's name — name + email read
  // as one cohesive block per party, rather than the email line being laid
  // out independently of the names above it.
  doc.setFontSize(9);
  doc.setTextColor(110);
  if (businessInfo.email) doc.text(businessInfo.email, businessBlockCenterX, y, { align: 'center' });
  if (client.email) doc.text(client.email, clientBlockCenterX, y, { align: 'center' });
  if (businessInfo.email || client.email) y += 5;
  y += 3;

  const eventRows = [
    ['Event Type', booking.eventType || '—'],
    ['Event Date', booking.eventDate ? formatEventDate(booking.eventDate) : 'Tentative'],
    ['Location', formatVenueLine(booking.venue) || '—'],
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

  // Custom sections — a colored title bar (tinted to the chosen accent)
  // followed by whichever of text/value the section was given.
  const sections = (snapshot.sections || []).filter((s) => s.title);
  for (const section of sections) {
    if (y > 255) { doc.addPage(); y = 20; }
    doc.setFillColor(...accentRgb);
    doc.rect(marginX, y, pageWidth - marginX * 2, 7.5, 'F');
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text(section.title, marginX + 3, y + 5.3);
    y += 7.5 + 6;

    if (section.value) {
      doc.setFontSize(11);
      doc.setTextColor(30);
      doc.text(section.value, marginX, y);
      y += 7;
    }
    if (section.text) {
      doc.setFontSize(10);
      doc.setTextColor(90);
      const lines = doc.splitTextToSize(section.text, pageWidth - marginX * 2);
      doc.text(lines, marginX, y);
      y += lines.length * 5 + 4;
    }
    y += 4;
  }

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
