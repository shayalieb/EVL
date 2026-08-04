import { getDocumentStyle } from './documentLayouts';
import { drawLetterhead, drawHeaderRule, drawImageBlock } from './documentPdfKit';
import { fetchFloorPlanPageThumbnail } from './floorPlans';

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildFloorPlanDoc({ eventId, eventName, floorPlan, businessInfo }) {
  const [{ default: jsPDF }] = await Promise.all([import('jspdf')]);
  const doc = new jsPDF({ orientation: 'landscape' });
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const { layout, scale, accentRgb } = getDocumentStyle(businessInfo);

  const sortedPages = floorPlan.pages.slice().sort((a, b) => a.order - b.order);

  let firstPage = true;
  for (const page of sortedPages) {
    if (!firstPage) doc.addPage();
    firstPage = false;

    let y = 16;
    y = await drawLetterhead(doc, { businessInfo, layout, scale, marginX, pageWidth, y, fallbackName: 'Floor Plan' });
    y = drawHeaderRule(doc, { layout, accentRgb, marginX, pageWidth, y });

    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text(`${eventName || 'Event'} — ${page.name}`, marginX, y);
    y += 6;

    const thumbnail = page.hasThumbnail ? await fetchFloorPlanPageThumbnail(eventId, page.id) : null;
    if (thumbnail) {
      await drawImageBlock(doc, { dataUrl: thumbnail, x: marginX, y, maxWidth: pageWidth - marginX * 2, maxHeight: pageHeight - y - 14 });
    } else {
      doc.setFontSize(10);
      doc.setTextColor(140);
      doc.text('(This page has not been saved yet.)', marginX, y + 10);
    }
  }

  const filename = `${(eventName || 'Event').replace(/[^a-z0-9]+/gi, '-')}-Floor-Plan.pdf`;
  return { doc, filename };
}

export async function generateFloorPlanPdf({ eventId, eventName, floorPlan, businessInfo }) {
  const { doc, filename } = await buildFloorPlanDoc({ eventId, eventName, floorPlan, businessInfo });
  doc.save(filename);
}

// Returns the same PDF as a base64 string so it can be sent as an email
// attachment without a round-trip through document storage — same shape as
// generateStagePlotPdfAttachment in stagePlotPdf.js.
export async function generateFloorPlanPdfAttachment({ eventId, eventName, floorPlan, businessInfo }) {
  const { doc, filename } = await buildFloorPlanDoc({ eventId, eventName, floorPlan, businessInfo });
  const dataUri = doc.output('datauristring', filename);
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return { filename, contentType: 'application/pdf', base64 };
}
