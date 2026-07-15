function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Deliberately reads only name/role/time off each contractor+booking —
// never email or pricing/tier info, since the prep sheet is meant to be
// safely shareable with crew.
export function getPrepContractors(form, contractors) {
  return form.contractorBookings
    .filter((b) => form.prepGroups.includes(contractors.find((c) => c.id === b.contractorId)?.contractorType1))
    .map((b) => {
      const contractor = contractors.find((c) => c.id === b.contractorId);
      return {
        contractorId: b.contractorId,
        name: `${contractor.firstName} ${contractor.lastName}`,
        role: contractor.contractorType2 || contractor.contractorType1,
        startTime: b.startTime || '',
        endTime: b.endTime || '',
      };
    })
    .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
}

export function renderPrepSheetEmail(form, prepContractors, attachedDocs = []) {
  const eventDate = formatDate(form.eventDate);
  const venue = form.venue || {};
  const address = [venue.address1, venue.address2, venue.city && venue.state ? `${venue.city}, ${venue.state} ${venue.zip || ''}` : '']
    .filter(Boolean).join('<br>');

  const scheduleRows = (form.schedule || [])
    .filter((s) => s.time || s.name || s.details)
    .map((s) => `<tr><td style="padding:4px 12px 4px 0;white-space:nowrap;color:#475569;">${formatTime(s.time)}</td><td style="padding:4px 12px 4px 0;font-weight:600;">${s.name || ''}</td><td style="padding:4px 0;color:#475569;">${s.details || ''}</td></tr>`)
    .join('');

  const contractorRows = prepContractors
    .map((c) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">${c.name}</td><td style="padding:4px 12px 4px 0;color:#475569;">${c.role}</td><td style="padding:4px 0;color:#475569;white-space:nowrap;">${formatTime(c.startTime)} – ${formatTime(c.endTime)}</td></tr>`)
    .join('');

  const body = `
    <div style="font-family:sans-serif;color:#1e293b;max-width:600px;">
      <h2 style="margin:0 0 4px;">${form.name || 'Event'}</h2>
      <p style="margin:0 0 16px;color:#475569;">${eventDate}${form.eventDayOfTheWeek ? ` (${form.eventDayOfTheWeek})` : ''} · ${formatTime(form.startTime)} – ${formatTime(form.endTime)}</p>

      ${venue.name || address ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Location</h3>
      <p style="margin:0;">${venue.name ? `<strong>${venue.name}</strong><br>` : ''}${address}</p>
      ${venue.locationNote ? `<p style="margin:8px 0 0;color:#475569;">${venue.locationNote}</p>` : ''}
      ${venue.loadInInfo ? `<p style="margin:4px 0 0;color:#475569;"><em>Load-in:</em> ${venue.loadInInfo}</p>` : ''}
      ` : ''}

      ${scheduleRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Schedule</h3>
      <table style="border-collapse:collapse;font-size:14px;">${scheduleRows}</table>
      ` : ''}

      ${contractorRows ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Crew</h3>
      <table style="border-collapse:collapse;font-size:14px;">${contractorRows}</table>
      ` : ''}

      ${form.prepNotes ? `
      <h3 style="margin:16px 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:0.03em;color:#64748b;">Notes</h3>
      <p style="margin:0;white-space:pre-wrap;">${form.prepNotes}</p>
      ` : ''}

      ${attachedDocs.length ? `<p style="margin:16px 0 0;color:#64748b;font-size:13px;">Attached: ${attachedDocs.map((d) => d.filename).join(', ')}</p>` : ''}
    </div>
  `.trim();

  return { subject: `${form.name || 'Event'} — Prep Sheet`, body };
}
