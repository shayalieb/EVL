import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import RichTextToolbar from './ui/RichTextToolbar';
import { useToast } from './ui/Toast';
import { STAGE_PLOT_VIEW_OPTIONS, buildStagePlotEmailSubject, buildStagePlotViewsHtml } from '../lib/stagePlotEmail';
import { generateStagePlotPdfAttachment } from '../lib/stagePlotPdf';
import { sendThreadedEmail } from '../lib/email/threads';
import { sendEmail } from '../lib/email/send';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';
const chipClass = (active) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${
  active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
}`;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const DEFAULT_CHECKED = { pages: true, channels: true, backlineItems: true };

// Compose an email for the Stage Plot editor — recipients are contractors
// on this event's roster (full reply-tracking via the same threaded system
// contractors use everywhere else in the app) plus optional one-off typed
// addresses (sent fine, but no thread to track replies against — there's no
// contractor record to key one on). Whatever's checked under "Include" is
// rendered straight into the email body (buildStagePlotViewsHtml) below the
// user's own message, and the same selection drives a single combined PDF
// attachment (generateStagePlotPdfAttachment's `include`).
export default function StagePlotEmailModal({ open, onClose, eventId, eventName, eventDate, stagePlot, rosterContractors, businessInfo, fromName, onSent }) {
  const { showToast } = useToast();
  const [selectedContractorIds, setSelectedContractorIds] = useState([]);
  const [adhocEmails, setAdhocEmails] = useState([]);
  const [adhocInput, setAdhocInput] = useState('');
  const [checked, setChecked] = useState(DEFAULT_CHECKED);
  const [subject, setSubject] = useState('');
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSelectedContractorIds([]);
    setAdhocEmails([]);
    setAdhocInput('');
    setChecked(DEFAULT_CHECKED);
    setSubjectTouched(false);
    if (bodyRef.current) bodyRef.current.innerHTML = '';
  }, [open]);

  // Recomputed live from business name + event + checked views, until the
  // user edits it directly — same "smart default, stays editable" pattern
  // as contractRecipientEmail elsewhere in this app.
  useEffect(() => {
    if (!open || subjectTouched) return;
    setSubject(buildStagePlotEmailSubject({ businessName: businessInfo?.name, eventName, eventDate, checked }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subjectTouched, businessInfo?.name, eventName, eventDate, checked]);

  function toggleContractor(id) {
    setSelectedContractorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleChecked(key) {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function addAdhocEmail() {
    const value = adhocInput.trim();
    if (!value || !isValidEmail(value) || adhocEmails.includes(value)) return;
    setAdhocEmails((prev) => [...prev, value]);
    setAdhocInput('');
  }

  function removeAdhocEmail(email) {
    setAdhocEmails((prev) => prev.filter((e) => e !== email));
  }

  const recipientCount = selectedContractorIds.length + adhocEmails.length;
  const anyChecked = STAGE_PLOT_VIEW_OPTIONS.some((o) => checked[o.key]);

  async function handleSend() {
    if (!recipientCount || !anyChecked || sending) return;
    setSending(true);
    try {
      const userBody = bodyRef.current?.innerHTML || '';
      const { html: viewsHtml, inlineImages } = await buildStagePlotViewsHtml({ eventId, stagePlot, checked });
      const fullBody = `${userBody}${viewsHtml}`;
      const pdfAttachment = await generateStagePlotPdfAttachment({ eventId, eventName, stagePlot, businessInfo, include: checked });

      let successCount = 0;
      for (const contractorId of selectedContractorIds) {
        const contractor = rosterContractors.find((c) => c.id === contractorId);
        if (!contractor?.email) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendThreadedEmail({ eventId, contractorId, contractorEmail: contractor.email, subject, body: fullBody, fromName, pdfAttachment, inlineImages });
          successCount += 1;
        } catch {
          // keep going — failures reflected in the summary toast below
        }
      }
      for (const email of adhocEmails) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await sendEmail({ to: email, subject, body: fullBody, fromName, pdfAttachment, inlineImages });
          successCount += 1;
        } catch {
          // keep going
        }
      }

      if (successCount === recipientCount) {
        showToast(`Sent to ${successCount} recipient${successCount === 1 ? '' : 's'}`);
      } else {
        showToast(`Sent ${successCount} of ${recipientCount} emails — some failed`, 'error');
      }
      onSent?.();
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  }

  // Guards every way this modal can close (backdrop click, the X button,
  // and Cancel below) — not just Cancel — since sends already dispatched
  // keep running in the background regardless of whether the modal is still
  // open, but closing mid-send makes it look like they were aborted.
  function handleClose() {
    if (!sending) onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Email Stage Plot" widthClass="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Recipients</label>
          {rosterContractors.length === 0 ? (
            <p className="text-sm text-slate-400 mb-2">No contractors with an email on this event's roster yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-2">
              {rosterContractors.map((c) => (
                <label key={c.id} className={chipClass(selectedContractorIds.includes(c.id))}>
                  <input
                    type="checkbox"
                    checked={selectedContractorIds.includes(c.id)}
                    onChange={() => toggleContractor(c.id)}
                    data-testid="stageplot-email-recipient-checkbox"
                    className="sr-only"
                  />
                  {c.firstName} {c.lastName}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={adhocInput}
              onChange={(e) => setAdhocInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAdhocEmail(); } }}
              placeholder="Add another email address…"
              data-testid="stageplot-email-adhoc-input"
              className={inputClass}
            />
            <button
              type="button"
              onClick={addAdhocEmail}
              data-testid="stageplot-email-adhoc-add-button"
              className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50"
            >
              + Add
            </button>
          </div>
          {adhocEmails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {adhocEmails.map((email) => (
                <span key={email} data-testid="stageplot-email-adhoc-chip" className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-600">
                  {email}
                  <button
                    type="button"
                    onClick={() => removeAdhocEmail(email)}
                    aria-label={`Remove ${email}`}
                    className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">Contractors get full reply tracking; typed addresses don't have a contractor record to track replies against.</p>
        </div>

        <div>
          <label className={labelClass}>Include</label>
          <div className="flex flex-wrap gap-2">
            {STAGE_PLOT_VIEW_OPTIONS.map((o) => (
              <label key={o.key} className={chipClass(!!checked[o.key])}>
                <input
                  type="checkbox"
                  checked={!!checked[o.key]}
                  onChange={() => toggleChecked(o.key)}
                  data-testid={`stageplot-email-view-${o.key}-checkbox`}
                  className="sr-only"
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Subject</label>
          <input
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setSubjectTouched(true); }}
            data-testid="stageplot-email-subject-input"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Message</label>
          <RichTextToolbar editorRef={bodyRef} onFormat={() => {}} />
          <div
            ref={bodyRef}
            contentEditable
            suppressContentEditableWarning
            data-testid="stageplot-email-body-input"
            className="w-full min-h-[100px] max-h-60 overflow-y-auto px-3.5 py-3 rounded-lg border border-slate-300 text-sm bg-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <p className="text-xs text-slate-400 mt-1">Whatever's checked above is added automatically below your message, and attached as a PDF.</p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} disabled={sending} data-testid="stageplot-email-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !recipientCount || !anyChecked}
            data-testid="stageplot-email-send-button"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2"
          >
            {sending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Send{recipientCount ? ` to ${recipientCount}` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
