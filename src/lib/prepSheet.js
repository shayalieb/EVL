import { formatEventDate as formatDate, formatEventTime as formatTime } from './format';
import { DEFAULT_ACCENT_COLOR } from './colorTheme';
import { escapeHtml } from './htmlEscape';

// Shared by EventFormPage.jsx's on-screen Prep tab, the emailed prep sheet
// (renderPrepSheetEmail below), and the downloaded PDF (prepSheetPdf.js) —
// all three render this same section, so the label has to come from one
// place or they'd drift out of sync. "Requests" is the generic label; other
// verticals get copy that actually matches what they're tracking there.
const REQUESTS_LABELS = {
  photography: { title: 'Equipment Checklist', addLabel: '+ Add Item', emptyLabel: 'No equipment requests added yet.' },
  party_planning: { title: 'Vendor & Rental Checklist', addLabel: '+ Add Item', emptyLabel: 'No vendor or rental items added yet.' },
};
export function requestsLabels(vertical) {
  return REQUESTS_LABELS[vertical] || { title: 'Requests', addLabel: '+ Add Request', emptyLabel: 'No requests added yet.' };
}

// Reads name/role/time/phone off each contractor+booking — phone is
// included (unlike email or pricing/tier info) since day-of coordination
// commonly needs a quick way to reach crew directly; the prep sheet is
// still meant to be safely shareable, so nothing about pricing or the
// contractor's email/login-adjacent info goes here.
export function getPrepContractors(form, contractors) {
  return form.contractorBookings
    .filter((b) => form.prepGroups.includes(contractors.find((c) => c.id === b.contractorId)?.contractorType1))
    .map((b) => {
      const contractor = contractors.find((c) => c.id === b.contractorId);
      return {
        contractorId: b.contractorId,
        name: `${contractor.firstName} ${contractor.lastName}`,
        role: contractor.contractorType2 || contractor.contractorType1,
        phone: contractor.phone || '',
        startTime: b.startTime || '',
        endTime: b.endTime || '',
      };
    })
    .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
}

export function renderPrepSheetEmail(form, prepContractors, requests = [], attachedDocs = [], businessInfo, vertical, contractors = []) {
  const isPhotography = vertical === 'photography';
  const accentColor = businessInfo?.accentColor || DEFAULT_ACCENT_COLOR;
  const eventDate = formatDate(form.eventDate);
  const venue = form.venue || {};
  const address = [venue.address1, venue.address2, venue.city && venue.state ? `${venue.city}, ${venue.state} ${venue.zip || ''}` : '']
    .filter(Boolean).map(escapeHtml).join('<br>');

  const scheduleRows = (form.schedule || [])
    .filter((s) => s.time || s.name || s.details)
    .map((s) => `<tr><td style="padding:4px 12px 4px 0;white-space:nowrap;color:#475569;">${formatTime(s.time)}</td><td style="padding:4px 12px 4px 0;font-weight:600;">${escapeHtml(s.name)}</td><td style="padding:4px 0;color:#475569;">${escapeHtml(s.details)}</td></tr>`)
    .join('');

  const contractorRows = prepContractors
    .map((c) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">${escapeHtml(c.name)}</td><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(c.role)}</td><td style="padding:4px 12px 4px 0;color:#475569;white-space:nowrap;">${escapeHtml(c.phone)}</td><td style="padding:4px 0;color:#475569;white-space:nowrap;">${formatTime(c.startTime)} – ${formatTime(c.endTime)}</td></tr>`)
    .join('');

  const requestRows = (requests || [])
    .filter((r) => r.name || r.details || r.link || r.documentName)
    .map((r) => {
      const extras = [];
      if (r.link) extras.push(`<a href="${escapeHtml(r.link)}" style="color:${accentColor};">${escapeHtml(r.link)}</a>`);
      if (r.documentName) extras.push(`Attached: ${escapeHtml(r.documentName)}`);
      return `<tr><td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top;">${escapeHtml(r.name)}</td><td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top;">${escapeHtml(r.details)}</td><td style="padding:4px 0;color:#475569;vertical-align:top;">${extras.join('<br>')}</td></tr>`;
    })
    .join('');

  const shotRows = (form.shotList || [])
    .filter((s) => s.label)
    .map((s) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">${escapeHtml(s.label)}${s.mustHave ? ' ★' : ''}</td><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(s.category)}</td><td style="padding:4px 0;color:#475569;">${escapeHtml(s.notes)}</td></tr>`)
    .join('');

  const secondShooterRows = (form.secondShooters || [])
    .filter((s) => s.contractorId)
    .map((s) => {
      const contractor = contractors.find((c) => c.id === s.contractorId);
      const name = contractor ? `${contractor.firstName} ${contractor.lastName}` : 'Unassigned';
      return `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">${escapeHtml(name)}</td><td style="padding:4px 12px 4px 0;color:#475569;">${escapeHtml(s.role)}</td><td style="padding:4px 0;color:#475569;">${escapeHtml(s.notes)}</td></tr>`;
    })
    .join('');

  const body = `
    <div style="font-family:sans-serif;color:#1e293b;max-width:600px;">
      <h2 style="margin:0 0 4px;">${escapeHtml(form.name || 'Event')}</h2>
      <p style="margin:0 0 16px;color:#475569;">${eventDate}${form.eventDayOfTheWeek ? ` (${escapeHtml(form.eventDayOfTheWeek)})` : ''} · ${formatTime(form.startTime)} – ${formatTime(form.endTime)}</p>

      ${venue.name || address ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Location</h3>
      <p style="margin:0;">${venue.name ? `<strong>${escapeHtml(venue.name)}</strong><br>` : ''}${address}</p>
      ${venue.locationNote ? `<p style="margin:8px 0 0;color:#475569;">${escapeHtml(venue.locationNote)}</p>` : ''}
      ${venue.loadInInfo ? `<p style="margin:4px 0 0;color:#475569;"><em>Load-in:</em> ${escapeHtml(venue.loadInInfo)}</p>` : ''}
      ` : ''}

      ${scheduleRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">${isPhotography ? 'Timeline' : 'Schedule'}</h3>
      <table style="border-collapse:collapse;font-size:14px;">${scheduleRows}</table>
      ` : ''}

      ${contractorRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Crew</h3>
      <table style="border-collapse:collapse;font-size:14px;">${contractorRows}</table>
      ` : ''}

      ${shotRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Shot List</h3>
      <table style="border-collapse:collapse;font-size:14px;">${shotRows}</table>
      ` : ''}

      ${secondShooterRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Second Shooters</h3>
      <table style="border-collapse:collapse;font-size:14px;">${secondShooterRows}</table>
      ` : ''}

      ${requestRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">${requestsLabels(vertical).title}</h3>
      <table style="border-collapse:collapse;font-size:14px;">${requestRows}</table>
      ` : ''}

      ${form.prepNotes ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Notes</h3>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(form.prepNotes)}</p>
      ` : ''}

      ${attachedDocs.length ? `<p style="margin:16px 0 0;color:#64748b;font-size:13px;">Attached: ${attachedDocs.map((d) => escapeHtml(d.filename)).join(', ')}</p>` : ''}
    </div>
  `.trim();

  return { subject: `${form.name || 'Event'} — Prep Sheet`, body };
}
