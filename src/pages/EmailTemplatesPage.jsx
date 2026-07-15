import { useEffect, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

const MERGE_FIELD_GROUPS = [
  {
    title: 'Vendor Fields',
    description: 'From the contractor record attached to the gig.',
    fields: [
      { token: '{{ContractorFirstName}}', description: 'First name' },
      { token: '{{ContractorLastName}}', description: 'Last name' },
      { token: '{{ContractorEmail}}', description: 'Email address' },
      { token: '{{ContractorPhone}}', description: 'Phone number' },
      { token: '{{ContractorType1}}', description: 'Category' },
      { token: '{{ContractorType2}}', description: 'Role' },
      { token: '{{ContractorPrice}}', description: 'Agreed price' },
      { token: '{{ContractorPriceNotes}}', description: 'Price notes' },
    ],
  },
  {
    title: 'Event Fields',
    description: 'From the event this email is being sent about.',
    fields: [
      { token: '{{EventName}}', description: 'Event name' },
      { token: '{{EventType}}', description: 'Event type' },
      { token: '{{EventDate}}', description: 'Event date' },
      { token: '{{EventDayOfTheWeek}}', description: 'Day of the week' },
      { token: '{{GigDate}}', description: 'Event date (alias)' },
      { token: '{{EventStartTime}}', description: 'Start time' },
      { token: '{{EventEndTime}}', description: 'End time' },
      { token: '{{EventNote}}', description: 'Event note' },
      { token: '{{VenueName}}', description: 'Venue name' },
      { token: '{{VenueAddress1}}', description: 'Venue address line 1' },
      { token: '{{VenueAddress2}}', description: 'Venue address line 2' },
      { token: '{{VenueCity}}', description: 'Venue city' },
      { token: '{{VenueState}}', description: 'Venue state' },
      { token: '{{VenueZip}}', description: 'Venue zip code' },
      { token: '{{VenueFullAddress}}', description: 'Venue name + address, multi-line' },
      { token: '{{LocationNote}}', description: 'Location note' },
      { token: '{{LoadInInfo}}', description: 'Load in info' },
      { token: '{{ContactPhone}}', description: 'Day-of contact phone' },
      { token: '{{ContactPhoneExt}}', description: 'Contact phone extension' },
      { token: '{{ContactEmail}}', description: 'Day-of contact email' },
    ],
  },
];

function MergeFieldReference() {
  const { showToast } = useToast();

  async function handleCopy(token) {
    try {
      await navigator.clipboard.writeText(token);
      showToast(`Copied ${token}`);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-base font-bold text-slate-800 mb-1">Insert Fields</h3>
      <p className="text-sm text-slate-500 mb-5">
        Click a field to copy it, then paste it into a Subject or Body. Fields are replaced with real values when an email is sent.
      </p>
      <div className="space-y-6">
        {MERGE_FIELD_GROUPS.map((group) => (
          <div key={group.title}>
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-0.5">{group.title}</h4>
            <p className="text-xs text-slate-400 mb-3">{group.description}</p>
            <div className="space-y-1">
              {group.fields.map((f) => (
                <button
                  key={f.token}
                  type="button"
                  onClick={() => handleCopy(f.token)}
                  className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 text-left"
                  title={`Copy ${f.token}`}
                >
                  <span className="font-mono text-xs text-indigo-600">{f.token}</span>
                  <span className="text-xs text-slate-400 shrink-0">{f.description}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, onSave, onDelete, canEdit }) {
  const { showToast } = useToast();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  // 'visual' lets non-technical users format text without seeing HTML; 'html'
  // is the raw source for anyone who wants to hand-edit markup directly.
  const [mode, setMode] = useState('visual');
  const bodyRef = useRef(null);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
  }, [template]);

  // Keep the contentEditable in sync with `body` for external changes (Reset,
  // switching into Visual mode, template reload) — but skip the sync right
  // after the editor itself produced the change, or every keystroke would
  // reset the cursor to the start.
  useEffect(() => {
    if (mode !== 'visual') return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (bodyRef.current) bodyRef.current.innerHTML = body;
  }, [body, mode]);

  const dirty = name !== template.name || subject !== template.subject || body !== template.body;

  function handleSave() {
    onSave({ name, subject, body });
    showToast('Template saved');
  }

  function handleReset() {
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
  }

  function handleBodyInput() {
    skipNextSyncRef.current = true;
    setBody(bodyRef.current.innerHTML);
  }

  function applyFormat(command, value) {
    if (!bodyRef.current) return;
    bodyRef.current.focus();
    document.execCommand(command, false, value);
    handleBodyInput();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
      <div>
        <label className={labelClass}>Template Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={`${labelClass} mb-0`}>Body</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('visual')}
              className={`px-2.5 py-1 ${mode === 'visual' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => setMode('html')}
              className={`px-2.5 py-1 ${mode === 'html' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              HTML
            </button>
          </div>
        </div>

        {mode === 'visual' ? (
          <>
            <div className="flex items-center gap-1 mb-1.5">
              <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('bold')} className="w-7 h-7 rounded hover:bg-slate-100 font-bold text-sm text-slate-700">B</button>
              <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('italic')} className="w-7 h-7 rounded hover:bg-slate-100 italic text-sm text-slate-700">I</button>
              <button type="button" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('underline')} className="w-7 h-7 rounded hover:bg-slate-100 underline text-sm text-slate-700">U</button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <button type="button" title="Smaller text" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('fontSize', '2')} className="w-7 h-7 rounded hover:bg-slate-100 text-xs text-slate-700">A-</button>
              <button type="button" title="Larger text" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat('fontSize', '5')} className="w-7 h-7 rounded hover:bg-slate-100 text-base text-slate-700">A+</button>
            </div>
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleBodyInput}
              className={`${inputClass} min-h-[150px] bg-white`}
            />
          </>
        ) : (
          <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} className={`${inputClass} font-mono text-xs`} />
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        {canEdit && (
          <button
            type="button"
            onClick={() => onDelete(template.id)}
            className="text-sm text-slate-400 hover:text-red-600"
          >
            Delete Template
          </button>
        )}
        <div className="flex gap-2">
          {dirty && (
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || !canEdit}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmailTemplatesPage() {
  const { emailTemplates, addEmailTemplate, updateEmailTemplate, removeEmailTemplate } = useData();
  const { can } = useAuth();
  const canEdit = can('manageEmailTemplates');
  const { showToast } = useToast();

  function handleAdd() {
    addEmailTemplate({ name: 'New Template', subject: '', body: '' });
  }

  function handleDelete(id) {
    removeEmailTemplate(id);
    showToast('Template deleted');
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Email Templates</h2>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canEdit}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New Template
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        These templates are used for outreach emails to contractors. Sending rules aren't wired up yet — this is just where the content lives and gets edited.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6 items-start">
        <div className="lg:sticky lg:top-6">
          <MergeFieldReference />
        </div>

        {emailTemplates.length === 0 ? (
          <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-10 text-center">
            No email templates yet.
          </div>
        ) : (
          <div className="space-y-4">
            {emailTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onSave={(patch) => updateEmailTemplate(t.id, patch)}
                onDelete={handleDelete}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
