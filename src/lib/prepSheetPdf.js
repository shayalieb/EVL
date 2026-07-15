import { formatEventDate as formatDate, formatEventTime as formatTime } from './format';

// jsPDF pulls in html2canvas/DOMPurify (~450KB) even though we only use its
// plain drawing API — lazy-load it so that weight isn't in the main bundle.
async function buildPrepSheetDoc(form, prepContractors, requests) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF();
  const marginX = 14;
  let y = 18;

  doc.setFontSize(18);
  doc.text(form.name || 'Event', marginX, y);
  y += 8;

  doc.setFontSize(11);
  doc.setTextColor(90);
  const dateLine = `${formatDate(form.eventDate)}${form.eventDayOfTheWeek ? ` (${form.eventDayOfTheWeek})` : ''} · ${formatTime(form.startTime)} – ${formatTime(form.endTime)}`;
  doc.text(dateLine, marginX, y);
  y += 10;

  const venue = form.venue || {};
  if (venue.name || venue.address1) {
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('Location', marginX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(90);
    const addressLines = [
      venue.name,
      venue.address1,
      venue.address2,
      venue.city && venue.state ? `${venue.city}, ${venue.state} ${venue.zip || ''}` : '',
      venue.locationNote,
      venue.loadInInfo ? `Load-in: ${venue.loadInInfo}` : '',
    ].filter(Boolean);
    for (const line of addressLines) {
      doc.text(line, marginX, y);
      y += 5;
    }
    y += 4;
  }

  const scheduleRows = (form.schedule || [])
    .filter((s) => s.time || s.name || s.details)
    .map((s) => [formatTime(s.time), s.name || '', s.details || '']);
  if (scheduleRows.length) {
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('Schedule', marginX, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX },
      head: [['Time', 'Name', 'Details']],
      body: scheduleRows,
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (prepContractors.length) {
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('Crew', marginX, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX },
      head: [['Name', 'Role', 'Start', 'End']],
      body: prepContractors.map((c) => [c.name, c.role, formatTime(c.startTime), formatTime(c.endTime)]),
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // Link and attachment are email-only (the recipient gets the actual file
  // and a clickable link there) — the PDF just lists name and details.
  const requestRows = (requests || [])
    .filter((r) => r.name || r.details || r.link || r.documentName)
    .map((r) => [r.name || '', r.details || '']);
  if (requestRows.length) {
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('Requests', marginX, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      margin: { left: marginX },
      head: [['Name', 'Details']],
      body: requestRows,
      theme: 'striped',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (form.prepNotes) {
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('Notes', marginX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setTextColor(90);
    const notesLines = doc.splitTextToSize(form.prepNotes, 180);
    doc.text(notesLines, marginX, y);
  }

  const filename = `${(form.name || 'Event').replace(/[^a-z0-9]+/gi, '-')}-Prep.pdf`;
  return { doc, filename };
}

export async function generatePrepSheetPdf(form, prepContractors, requests) {
  const { doc, filename } = await buildPrepSheetDoc(form, prepContractors, requests);
  doc.save(filename);
}

// Returns the same PDF as a base64 string so it can be sent as an email
// attachment without a round-trip through document storage.
export async function generatePrepSheetPdfAttachment(form, prepContractors, requests) {
  const { doc, filename } = await buildPrepSheetDoc(form, prepContractors, requests);
  // jsPDF has no plain "base64" output type (only 'datauristring' and
  // friends) — passing 'base64' silently returns null with no error.
  const dataUri = doc.output('datauristring', filename);
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  return { filename, contentType: 'application/pdf', base64 };
}
