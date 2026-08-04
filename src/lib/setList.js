import { DEFAULT_ACCENT_COLOR } from './colorTheme';

// Same shape as prepSheet.js's renderPrepSheetEmail — builds the HTML body
// for emailing a single set list to a band member. Unlike the PDF export
// (setListPdf.js, which deliberately omits links — a raw URL isn't useful
// on paper), the email renders each link as a clickable "Open Link" instead
// of the raw pasted URL, since the whole point of a link here is to be
// clicked from an inbox.
export function renderSetListEmail(eventName, setList, businessInfo) {
  const accentColor = businessInfo?.accentColor || DEFAULT_ACCENT_COLOR;

  const rows = (setList?.items || [])
    .filter((item) => item.songTitle)
    .map((item, i) => {
      const linkCell = item.link
        ? `<a href="${item.link}" style="color:${accentColor};">Open Link</a>`
        : '';
      const sheetCell = item.documentName ? `📎 ${item.documentName}` : '';
      return `<tr>
        <td style="padding:4px 8px 4px 0;color:#94a3b8;vertical-align:top;">${i + 1}.</td>
        <td style="padding:4px 12px 4px 0;font-weight:600;vertical-align:top;">${item.songTitle}</td>
        <td style="padding:4px 12px 4px 0;color:#475569;vertical-align:top;">${item.description || ''}</td>
        <td style="padding:4px 12px 4px 0;vertical-align:top;">${linkCell}</td>
        <td style="padding:4px 0;color:#475569;vertical-align:top;">${sheetCell}</td>
      </tr>`;
    })
    .join('');

  const body = `
    <div style="font-family:sans-serif;color:#1e293b;max-width:600px;">
      <h2 style="margin:0 0 4px;">${setList?.name || 'Set List'}</h2>
      <p style="margin:0 0 16px;color:#475569;">${eventName || 'Event'}</p>
      <table style="border-collapse:collapse;font-size:14px;width:100%;">${rows}</table>
    </div>
  `.trim();

  return { subject: `${eventName || 'Event'} — ${setList?.name || 'Set List'}`, body };
}
