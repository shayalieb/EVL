import { formatCurrency as currency, formatEventDate, formatVenueLine } from './format';
import { computeOfferingTotal, computeOfferingsTotal } from './offerings';
import { lightenRgb } from './colorTheme';
import { getDocumentStyle } from './documentLayouts';
import { loadImageDimensions, scaleFont, setFontStyle, drawLetterhead, drawHeaderRule, drawSectionBlock, getAutoTableStyle } from './documentPdfKit';

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
  const { layout, scale, accentRgb } = getDocumentStyle(snapshot.style);
  const tableStyle = getAutoTableStyle(layout, scale, accentRgb);
  let y = 18;

  y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Event Contract' });
  y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

  doc.setFontSize(scaleFont(20, scale));
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
  doc.setFontSize(scaleFont(9, scale));
  doc.setTextColor(140);
  doc.text('BETWEEN', centerX, y, { align: 'center' });
  y += lineGap;

  const gap = 5;
  doc.setFontSize(scaleFont(12, scale));
  setFontStyle(doc, layout, 'bold');
  const businessW = doc.getTextWidth(businessName);
  const clientW = doc.getTextWidth(clientName);
  doc.setFontSize(scaleFont(11, scale));
  setFontStyle(doc, layout, 'normal');
  const andW = doc.getTextWidth('AND');
  const totalW = businessW + gap + andW + gap + clientW;
  let partyX = centerX - totalW / 2;
  const businessBlockCenterX = partyX + businessW / 2;

  doc.setFontSize(scaleFont(12, scale));
  setFontStyle(doc, layout, 'bold');
  doc.setTextColor(30);
  doc.text(businessName, partyX, y);
  partyX += businessW + gap;

  doc.setFontSize(scaleFont(11, scale));
  setFontStyle(doc, layout, 'normal');
  doc.setTextColor(120);
  doc.text('AND', partyX, y);
  partyX += andW + gap;

  const clientBlockCenterX = partyX + clientW / 2;
  doc.setFontSize(scaleFont(12, scale));
  setFontStyle(doc, layout, 'bold');
  doc.setTextColor(30);
  doc.text(clientName, partyX, y);
  setFontStyle(doc, layout, 'normal');
  y += lineGap;

  // Each email sits centered under its own party's name — name + email read
  // as one cohesive block per party, rather than the email line being laid
  // out independently of the names above it.
  doc.setFontSize(scaleFont(9, scale));
  doc.setTextColor(110);
  if (businessInfo.email) doc.text(businessInfo.email, businessBlockCenterX, y, { align: 'center' });
  if (client.email) doc.text(client.email, clientBlockCenterX, y, { align: 'center' });
  if (businessInfo.email || client.email) y += 5;
  y += 3;

  const eventRows = [
    ['Event Type', booking.eventType || '—'],
    ['Event Date', booking.eventDate ? formatEventDate(booking.eventDate) : 'Tentative'],
    ...(booking.brideName || booking.groomName ? [['Bride & Groom', [booking.brideName, booking.groomName].filter(Boolean).join(' & ')]] : []),
    ['Location', formatVenueLine(booking.venue) || '—'],
    ['Estimated Hours', snapshot.hours ? `${snapshot.hours} hrs` : '—'],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['Event Details', '']],
    body: eventRows,
    ...tableStyle,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  const lineItems = snapshot.lineItems || [];
  const offeringsList = snapshot.offerings || [];
  const grandTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + computeOfferingsTotal(offeringsList);

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
    ...tableStyle,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.raw[0] === 'Grand Total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = lightenRgb(accentRgb);
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (offeringsList.length) {
    const offeringRows = offeringsList.map((o) => {
      const total = computeOfferingTotal(o);
      const valueLine = o.type === 'perUnit'
        ? `${o.unitCount || 0} × ${currency(o.ratePerUnit || 0)} = ${currency(total)}`
        : currency(total);
      // Ensemble: instrument-only, one bullet per musician — never names,
      // see buildEnsembleOffering in OfferingPickerModal.jsx for why.
      const detailsText = o.type === 'ensemble' && o.instruments?.length
        ? o.instruments.map((inst) => `• ${inst}`).join('\n')
        : o.details;
      return [o.name || 'Offering', detailsText ? `${valueLine}\n${detailsText}` : valueLine];
    });
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Offerings', '']],
      body: offeringRows,
      ...tableStyle,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Custom sections — styled per the chosen layout (filled bar / left
  // border / underline / boxed outline), tinted to the account's accent.
  const sections = (snapshot.sections || []).filter((s) => s.title);
  for (const section of sections) {
    y = drawSectionBlock(doc, { section, layout, accentRgb, marginX, pageWidth, scale, y });
  }

  setFontStyle(doc, layout, 'normal');
  const customFields = (snapshot.customFields || []).filter((f) => f.label);
  if (customFields.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Additional Details', '']],
      body: customFields.map((f) => [f.label, f.value || '—']),
      ...tableStyle,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (booking.notes) {
    doc.setFontSize(scaleFont(11, scale));
    doc.setTextColor(30);
    doc.text('Notes', marginX, y);
    y += 6;
    doc.setFontSize(scaleFont(10, scale));
    doc.setTextColor(90);
    const notesLines = doc.splitTextToSize(booking.notes, pageWidth - marginX * 2);
    doc.text(notesLines, marginX, y);
    y += notesLines.length * 5 + 6;
  }

  if (terms) {
    doc.setFontSize(scaleFont(11, scale));
    doc.setTextColor(30);
    doc.text('Terms', marginX, y);
    y += 6;
    doc.setFontSize(scaleFont(10, scale));
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

  doc.setFontSize(scaleFont(10, scale));
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

  doc.setFontSize(scaleFont(9, scale));
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
