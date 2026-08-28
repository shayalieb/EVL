import { DEFAULT_ACCENT_COLOR } from './colorTheme';
import { songSheetPublicDownloadUrl } from './documents';
import { formatEventDate, isValidEmailAddress } from './format';
import { escapeHtml } from './htmlEscape';
import { generateSetListPdfAttachment } from './setListPdf';
import { sendThreadedEmail } from './email/threads';

// Builds the HTML body for emailing a single set list to a band member.
// Every song gets its own row: Name, Description, a "Download PDF" link
// (songSheetPublicDownloadUrl — unauthenticated, so it still works for a
// recipient who has no app login) when sheet music is attached, and an
// "Open Link" (the song's own YouTube/Spotify/etc. link) when set. The PDF
// export (setListPdf.js) deliberately omits both link columns — a URL
// printed on paper isn't clickable — so this table is the one place both
// actually show up. Every user-entered value gets escapeHtml'd — an
// ordinary "Rock & Roll" or "Nina's Song <3" would otherwise be
// misinterpreted as markup by the recipient's email client, not just a
// theoretical injection concern.
export function renderSetListEmail(eventName, eventDate, setList, businessInfo) {
  const accentColor = businessInfo?.accentColor || DEFAULT_ACCENT_COLOR;

  const rows = (setList?.items || [])
    .filter((item) => item.songTitle)
    .map((item) => {
      const downloadCell = item.documentShareToken
        ? `<a href="${escapeHtml(songSheetPublicDownloadUrl(item.documentShareToken))}" style="color:${accentColor};">Download PDF</a>`
        : '';
      const openLinkCell = item.link
        ? `<a href="${escapeHtml(item.link)}" style="color:${accentColor};">Open Link</a>`
        : '';
      return `<tr>
        <td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;">${escapeHtml(item.songTitle)}</td>
        <td style="padding:6px 12px 6px 0;color:#475569;vertical-align:top;">${escapeHtml(item.description)}</td>
        <td style="padding:6px 12px 6px 0;vertical-align:top;">${downloadCell}</td>
        <td style="padding:6px 0;vertical-align:top;">${openLinkCell}</td>
      </tr>`;
    })
    .join('');

  const eventLine = [eventName, eventDate ? formatEventDate(eventDate) : ''].filter(Boolean).join(' — ');

  const body = `
    <div style="font-family:sans-serif;color:#1e293b;max-width:640px;">
      <h2 style="margin:0 0 4px;">${escapeHtml(setList?.name || 'Set List')}</h2>
      ${eventLine ? `<p style="margin:0 0 16px;color:#475569;">${escapeHtml(eventLine)}</p>` : ''}
      <table style="border-collapse:collapse;font-size:14px;width:100%;">
        <thead>
          <tr style="text-align:left;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;">
            <th style="padding:0 12px 6px 0;font-weight:600;">Name</th>
            <th style="padding:0 12px 6px 0;font-weight:600;">Description</th>
            <th style="padding:0 12px 6px 0;font-weight:600;">Download PDF</th>
            <th style="padding:0 0 6px 0;font-weight:600;">Open Link</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();

  return { subject: `${eventName || 'Event'} — ${setList?.name || 'Set List'}`, body };
}

// Shared send orchestration — used by both SetListsEditorPage (a set list
// that's always on a specific event already) and SetListLibraryPage (a
// reusable set list emailed only once it's been linked to one, see
// SetListLibraryModal's event picker). Sheet music rides along as a real
// attachment (not just the emailed download link above) for reliability —
// same "no extra checkbox" pattern Requests already uses for its own
// per-item attachments.
export async function sendSetListEmail({ eventId, eventName, eventDate, setList, recipientIds, contractors, subject, body, fromName, businessInfo }) {
  const documentIds = setList.items.map((it) => it.documentId).filter(Boolean);
  const pdfAttachment = await generateSetListPdfAttachment({ eventName, eventDate, setLists: [setList], businessInfo });
  let successCount = 0;
  for (const contractorId of recipientIds) {
    const contractor = contractors.find((c) => c.id === contractorId);
    if (!isValidEmailAddress(contractor?.email)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await sendThreadedEmail({ eventId, contractorId, contractorEmail: contractor.email, subject, body, fromName, documentIds, pdfAttachment });
      successCount++;
    } catch {
      // keep going — caller reflects partial failures in its own summary toast
    }
  }
  return { successCount, total: recipientIds.length };
}
