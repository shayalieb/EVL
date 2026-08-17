import { formatCurrency as currency, formatEventDate, formatVenueLine, formatEventTime } from './format';
import { computeOfferingTotal, computeOfferingsTotal } from './offerings';
import { lightenRgb } from './colorTheme';
import { getDocumentStyle } from './documentLayouts';
import { scaleFont, setFontStyle, drawLetterhead, drawHeaderRule, drawSectionBlock, getAutoTableStyle } from './documentPdfKit';

function todayLabel() {
  return formatEventDate(new Date().toISOString().slice(0, 10));
}

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildProposalDoc({ booking, client, businessInfo }) {
  const hours = booking.proposal?.hours;
  const lineItems = booking.proposal?.lineItems || [];
  const offeringsList = booking.proposal?.offerings || [];
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const { layout, scale, accentRgb } = getDocumentStyle(businessInfo);
  const tableStyle = getAutoTableStyle(layout, scale, accentRgb);
  let y = 18;

  y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Event Proposal' });
  y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

  doc.setFontSize(scaleFont(20, scale));
  doc.setTextColor(20);
  doc.text('Event Proposal', marginX, y);
  doc.setFontSize(scaleFont(10, scale));
  doc.setTextColor(110);
  doc.text(todayLabel(), pageWidth - marginX, y, { align: 'right' });
  y += 12;

  doc.setFontSize(scaleFont(10, scale));
  doc.setTextColor(140);
  doc.text('PREPARED FOR', marginX, y);
  y += 6;
  doc.setFontSize(scaleFont(12, scale));
  doc.setTextColor(30);
  doc.text(client ? `${client.firstName} ${client.lastName}` : '—', marginX, y);
  y += 6;
  doc.setFontSize(scaleFont(10, scale));
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
    ['Location', formatVenueLine(booking.venue) || '—'],
    ['Estimated Hours', hours ? `${hours} hrs` : '—'],
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

  const grandTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + computeOfferingsTotal(offeringsList);

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

  const scheduleList = (booking.schedule || []).filter((s) => s.time || s.name || s.details);
  if (scheduleList.length) {
    const scheduleRows = scheduleList.map((s) => [formatEventTime(s.time) || '—', [s.name, s.details].filter(Boolean).join('\n')]);
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Time', 'Schedule']],
      body: scheduleRows,
      ...tableStyle,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

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

  const sections = (booking.proposal?.sections || []).filter((s) => s.title);
  for (const section of sections) {
    y = drawSectionBlock(doc, { section, layout, accentRgb, marginX, pageWidth, scale, y });
  }

  setFontStyle(doc, layout, 'normal');
  if (booking.notes) {
    doc.setFontSize(scaleFont(11, scale));
    doc.setTextColor(30);
    doc.text('Additional Details', marginX, y);
    y += 6;
    doc.setFontSize(scaleFont(10, scale));
    doc.setTextColor(90);
    const notesLines = doc.splitTextToSize(booking.notes, pageWidth - marginX * 2);
    doc.text(notesLines, marginX, y);
    y += notesLines.length * 5 + 6;
  }

  doc.setFontSize(scaleFont(9, scale));
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

// Same document as generateProposalPdf, but returned as a data URI for an
// inline <iframe> preview instead of triggering a file download.
export async function getProposalPdfDataUrl(args) {
  const { doc } = await buildProposalDoc(args);
  return doc.output('datauristring');
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
