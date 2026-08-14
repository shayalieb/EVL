import { getDocumentStyle } from './documentLayouts';
import { drawLetterhead, drawHeaderRule, getAutoTableStyle } from './documentPdfKit';
import { formatEventDate } from './format';

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildSetListDoc({ eventName, eventDate, setLists, businessInfo }) {
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
  y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Set Lists' });
  y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(eventName || 'Event', marginX, y);
  y += 8;
  if (eventDate) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(formatEventDate(eventDate), marginX, y);
    y += 8;
  } else {
    y += 2;
  }

  // Link and Download PDF are omitted here — both are ways to reach the
  // song's *linked* content (its own YouTube/Spotify URL, its uploaded
  // sheet music), and neither is clickable once printed on paper. Both
  // still show up in the emailed version (see setList.js's
  // renderSetListEmail) where they're actually useful.
  for (const setList of setLists) {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(setList.name, marginX, y);
    y += 4;

    const rows = setList.items
      .filter((item) => item.songTitle)
      .map((item, i) => [String(i + 1), item.songTitle, item.description || '']);

    if (rows.length === 0) {
      doc.setFontSize(10);
      doc.setTextColor(140);
      doc.text('No songs added yet.', marginX, y + 6);
      y += 14;
      continue;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: marginX },
      head: [['#', 'Name', 'Description']],
      body: rows,
      columnStyles: { 0: { cellWidth: 8 } },
      ...tableStyle,
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const filename = `${(eventName || 'Event').replace(/[^a-z0-9]+/gi, '-')}-Set-Lists.pdf`;
  return { doc, filename };
}

export async function generateSetListPdf({ eventName, eventDate, setLists, businessInfo }) {
  const { doc, filename } = await buildSetListDoc({ eventName, eventDate, setLists, businessInfo });
  doc.save(filename);
}

// Returns the same PDF as a base64 string so it can be sent as an email
// attachment without a round-trip through document storage — same shape as
// generateStagePlotPdfAttachment/generateFloorPlanPdfAttachment.
export async function generateSetListPdfAttachment({ eventName, eventDate, setLists, businessInfo }) {
  const { doc, filename } = await buildSetListDoc({ eventName, eventDate, setLists, businessInfo });
  const dataUri = doc.output('datauristring', filename);
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return { filename, contentType: 'application/pdf', base64 };
}
