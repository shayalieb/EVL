import { getDocumentStyle } from './documentLayouts';
import { drawLetterhead, drawHeaderRule, drawImageBlock, getAutoTableStyle } from './documentPdfKit';
import { fetchStagePlotPageThumbnail } from './stagePlots';

const STAND_LABELS = { 'tall boom': 'Tall Boom', 'short boom': 'Short Boom', straight: 'Straight', none: 'None' };

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildStagePlotDoc({ eventId, eventName, stagePlot, businessInfo }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape' });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { layout, scale, accentRgb } = getDocumentStyle(businessInfo);
  const tableStyle = getAutoTableStyle(layout, scale, accentRgb);

  const sortedPages = stagePlot.pages.slice().sort((a, b) => a.order - b.order);

  let firstPage = true;
  for (const page of sortedPages) {
    if (!firstPage) doc.addPage();
    firstPage = false;

    let y = 16;
    y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Stage Plot' });
    y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(`${eventName || 'Event'} — ${page.name}`, marginX, y);
    y += 6;

    const thumbnail = page.hasThumbnail ? await fetchStagePlotPageThumbnail(eventId, page.id) : null;
    if (thumbnail) {
      await drawImageBlock(doc, { dataUrl: thumbnail, x: marginX, y, maxWidth: pageWidth - marginX * 2, maxHeight: pageHeight - y - 14 });
    } else {
      doc.setFontSize(10);
      doc.setTextColor(140);
      doc.text('(This page has not been saved yet.)', marginX, y + 10);
    }
  }

  if (stagePlot.channels.length) {
    doc.addPage();
    let y = 16;
    y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Stage Plot' });
    y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('I/O List', marginX, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: marginX },
      head: [['Ch', 'Source', 'Mic/DI', 'Stand', '48V', 'Notes']],
      body: stagePlot.channels
        .slice()
        .sort((a, b) => a.channelNumber - b.channelNumber)
        .map((c) => [c.channelNumber, c.source, c.micOrDi || '', STAND_LABELS[c.standType] || '', c.phantomPower ? '✓' : '', c.monitorNotes || '']),
      ...tableStyle,
    });
  }

  const filename = `${(eventName || 'Event').replace(/[^a-z0-9]+/gi, '-')}-Stage-Plot.pdf`;
  return { doc, filename };
}

export async function generateStagePlotPdf({ eventId, eventName, stagePlot, businessInfo }) {
  const { doc, filename } = await buildStagePlotDoc({ eventId, eventName, stagePlot, businessInfo });
  doc.save(filename);
}

// Returns the same PDF as a base64 string so it can be sent as an email
// attachment without a round-trip through document storage — same shape as
// generatePrepSheetPdfAttachment in prepSheetPdf.js.
export async function generateStagePlotPdfAttachment({ eventId, eventName, stagePlot, businessInfo }) {
  const { doc, filename } = await buildStagePlotDoc({ eventId, eventName, stagePlot, businessInfo });
  const dataUri = doc.output('datauristring', filename);
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return { filename, contentType: 'application/pdf', base64 };
}
