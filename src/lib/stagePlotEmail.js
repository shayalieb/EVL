import { formatEventDate, formatEventTime } from './format';
import { escapeHtml } from './htmlEscape';
import { fetchStagePlotPageThumbnail } from './stagePlots';
import { stagePlotNotesToPlainText } from './stagePlotNotes';
import { getStagePlotTechnicalDetailLines } from './stagePlotTechnicalDetails';

const PROVIDED_BY_LABELS = { band: 'Band', venue: 'Venue', rental: 'Rental' };

// Keys match generateStagePlotPdfAttachment's `include` shape (stagePlotPdf.js)
// so a "checked" object built from these can be passed straight through to
// both the PDF and the email-body builders below.
export const STAGE_PLOT_VIEW_OPTIONS = [
  { key: 'eventDetails', label: 'Event & Contacts' },
  { key: 'pages', label: 'Stage Plot' },
  { key: 'channels', label: 'Production List' },
  { key: 'backlineItems', label: 'Backline List' },
];

// Company name + event (name and date) + whichever views are checked —
// recomputed live while the compose modal is open, until the user edits the
// subject by hand (see StagePlotEmailModal.jsx's subjectTouched).
export function buildStagePlotEmailSubject({ businessName, eventName, eventDate, checked }) {
  const labels = STAGE_PLOT_VIEW_OPTIONS.filter((o) => checked[o.key]).map((o) => o.label);
  const dateLabel = eventDate ? formatEventDate(eventDate) : '';
  const eventPart = [eventName, dateLabel && `(${dateLabel})`].filter(Boolean).join(' ');
  const fullPackage = labels.length === STAGE_PLOT_VIEW_OPTIONS.length;
  return [businessName || 'GigWorks', eventPart, fullPackage ? 'Technical Production Package' : labels.join(', ') || 'Stage Plot Info'].filter(Boolean).join(' — ');
}

const cellStyle = 'padding:4px 8px;border-bottom:1px solid #e2e8f0;';
const headStyle = 'padding:4px 8px;border-bottom:2px solid #cbd5e1;';
const sectionHeadingStyle = 'font-size:14px;font-weight:700;color:#1e293b;margin:20px 0 8px;';
const emptyStyle = 'font-size:13px;color:#94a3b8;';

function technicalDetailsHtml(channel) {
  return getStagePlotTechnicalDetailLines(channel)
    .map(({ heading, value }) => `<strong>${escapeHtml(heading)}:</strong> ${escapeHtml(value)}`)
    .join('<br />');
}

function emailNotes(value) {
  return escapeHtml(stagePlotNotesToPlainText(value)).replace(/\n/g, '<br />');
}

function tableHtml(headers, rows) {
  if (!rows.length) return `<div style="${emptyStyle}">Nothing here yet.</div>`;
  return `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="text-align:left;color:#64748b;">${headers.map((h) => `<th style="${headStyle}">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

// Renders whichever views are checked directly into the email body — the
// Production List and Backline List as plain HTML tables, and each Stage Plot page
// as an inline image referenced via cid: (see buildInlineImageAttachments
// in server/src/lib/mailer.js), since data: URLs get stripped by most email
// clients. Notes fields (monitorNotes/notesHtml) are already-composed rich
// text HTML, inserted as-is rather than escaped — everything else is a
// plain value and gets escapeHtml'd.
export async function buildStagePlotViewsHtml({ eventId, event, businessInfo, stagePlot, checked }) {
  const sections = stagePlot.revisionLabel ? [`<p style="font-size:12px;font-weight:700;color:#4f46e5;">${escapeHtml(stagePlot.revisionLabel)}</p>`] : [];
  const inlineImages = [];

  if (checked.eventDetails) {
    const venue = event?.venue || {};
    const eventRows = [
      ['Event', event?.name], ['Date', formatEventDate(event?.eventDate)], ['Performance', [formatEventTime(event?.startTime), formatEventTime(event?.endTime)].filter(Boolean).join(' – ')],
      ['Venue', venue.name], ['Address', [venue.address1, venue.address2, venue.city, venue.state, venue.zip].filter(Boolean).join(', ')],
      ['Load-in', venue.loadInInfo], ['Venue production contact', [venue.contactName, venue.contactPhone, venue.contactEmail].filter(Boolean).join(' · ')],
      ['Day-of contact', [event?.contactPhone, event?.contactEmail].filter(Boolean).join(' · ')],
      ['Artist contact', [businessInfo?.name, businessInfo?.phone, businessInfo?.email].filter(Boolean).join(' · ')],
    ].filter(([, value]) => value).map(([label, value]) => `<tr><td style="${headStyle}">${escapeHtml(label)}</td><td style="${cellStyle}">${escapeHtml(value)}</td></tr>`);
    const scheduleRows = (event?.schedule || []).filter((item) => item.time || item.name || item.details).map((item) => `<tr><td style="${cellStyle}">${escapeHtml(formatEventTime(item.time))}</td><td style="${cellStyle}">${escapeHtml(item.name || '')}</td><td style="${cellStyle}">${escapeHtml(item.details || '')}</td></tr>`);
    sections.push(`<h3 style="${sectionHeadingStyle}">Event & Production Contacts</h3><table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>${eventRows.join('')}</tbody></table>${scheduleRows.length ? `<h3 style="${sectionHeadingStyle}">Schedule</h3>${tableHtml(['Time', 'Item', 'Details'], scheduleRows)}` : ''}`);
  }

  if (checked.pages) {
    const sortedPages = stagePlot.pages.slice().sort((a, b) => a.order - b.order);
    let pageBlocks = '';
    for (let i = 0; i < sortedPages.length; i += 1) {
      const page = sortedPages[i];
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = page.hasThumbnail ? await fetchStagePlotPageThumbnail(eventId, page.id) : null;
      if (dataUrl) {
        const contentId = `stageplot-page-${i}`;
        inlineImages.push({
          contentId,
          filename: `${page.name || `Page ${i + 1}`}.png`,
          base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
          contentType: 'image/png',
        });
        // width="100%" as a real HTML attribute, not just CSS — Outlook
        // desktop (the Word rendering engine) is notorious for ignoring an
        // <img>'s own max-width/height:auto CSS and rendering it at its
        // full intrinsic pixel size instead, which visibly overflows/clips
        // against buildActionEmailHtml's container (server/src/lib/
        // mailer.js) no matter how wide that container is made. The
        // attribute is what actually gets that class of client to scale it.
        pageBlocks += `<div style="margin-bottom:16px;"><div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:4px;">${escapeHtml(page.name)}</div><img src="cid:${contentId}" alt="${escapeHtml(page.name)}" width="100%" style="width:100%;max-width:100%;height:auto;display:block;border:1px solid #e2e8f0;border-radius:8px;" /></div>`;
      } else {
        pageBlocks += `<div style="margin-bottom:16px;${emptyStyle}">${escapeHtml(page.name)} — not saved yet.</div>`;
      }
    }
    sections.push(`<h3 style="${sectionHeadingStyle}">Stage Plot</h3>${pageBlocks}`);
  }

  if (checked.channels) {
    const hasTechnicalDetails = stagePlot.channels.some((channel) => technicalDetailsHtml(channel));
    const rows = stagePlot.channels
      .slice()
      .sort((a, b) => a.channelNumber - b.channelNumber)
      .map((c) => `<tr>
        <td style="${cellStyle}">${c.channelNumber}</td>
        <td style="${cellStyle}">${escapeHtml(c.musicianName || '')}</td>
        <td style="${cellStyle}">${escapeHtml(c.source)}</td>
        <td style="${cellStyle}">${c.phantomPower ? '✓' : ''}</td>
        <td style="${cellStyle}">${c.powerNeeded ? '✓' : ''}</td>
        <td style="${cellStyle}">${emailNotes(c.monitorNotes)}</td>
        ${hasTechnicalDetails ? `<td style="${cellStyle}">${technicalDetailsHtml(c)}</td>` : ''}
      </tr>`);
    sections.push(`<h3 style="${sectionHeadingStyle}">Production List</h3>${tableHtml([...['#', 'Musician', 'Instrument', '48V', 'Power', 'Notes'], ...(hasTechnicalDetails ? ['Technical requirements'] : [])], rows)}`);
  }

  if (checked.backlineItems) {
    const rows = (stagePlot.backlineItems || []).map((i) => `<tr>
        <td style="${cellStyle}">${escapeHtml(i.item)}</td>
        <td style="${cellStyle}">${i.quantity}</td>
        <td style="${cellStyle}">${escapeHtml(PROVIDED_BY_LABELS[i.providedBy] || 'TBD')}</td>
        <td style="${cellStyle}">${emailNotes(i.notesHtml)}</td>
      </tr>`);
    sections.push(`<h3 style="${sectionHeadingStyle}">Backline List</h3>${tableHtml(['Item', 'Qty', 'Provided By', 'Notes'], rows)}`);
  }

  return { html: sections.join(''), inlineImages };
}
