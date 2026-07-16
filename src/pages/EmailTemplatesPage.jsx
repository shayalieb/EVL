import { useEffect, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ChevronDownIcon, SearchIcon } from '../components/ui/icons';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RichTextToolbar from '../components/ui/RichTextToolbar';

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
      { token: '{{ContractorStartTime}}', description: "This contractor's own call time (falls back to event start time)" },
      { token: '{{ContractorEndTime}}', description: "This contractor's own end time (falls back to event end time)" },
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
      { token: '{{CrewList}}', description: "Bulleted list of role - name for every contractor in the recipient's own category (e.g. their band)" },
    ],
  },
];

function MergeFieldReference() {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');

  async function handleCopy(token) {
    try {
      await navigator.clipboard.writeText(token);
      showToast(`Copied ${token}`);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  }

  const q = query.trim().toLowerCase();
  const filteredGroups = MERGE_FIELD_GROUPS
    .map((group) => ({
      ...group,
      fields: q
        ? group.fields.filter((f) => f.token.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
        : group.fields,
    }))
    .filter((group) => group.fields.length > 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <h3 className="text-base font-bold text-slate-800 mb-1">Insert Fields</h3>
      <p className="text-sm text-slate-500 mb-4">
        Click a field to copy it, then paste it into a Subject or Body. Fields are replaced with real values when an email is sent.
      </p>
      <div className="relative mb-5">
        <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fields…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </div>
      {filteredGroups.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-6">No fields match “{query}”.</div>
      ) : (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
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
                    <span className="font-mono text-xs text-indigo-600 shrink-0">{f.token}</span>
                    <span className="text-xs text-slate-400 truncate min-w-0 flex-1 text-right">{f.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateRow({ template, expanded, onToggleExpand, onSave, onDelete, canEdit }) {
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
  // reset the cursor to the start. Skipped entirely while collapsed since the
  // ref isn't mounted then.
  useEffect(() => {
    if (mode !== 'visual' || !expanded) return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (bodyRef.current) bodyRef.current.innerHTML = body;
  }, [body, mode, expanded]);

  const dirty = name !== template.name || subject !== template.subject || body !== template.body;

  function handleSave(e) {
    e.stopPropagation();
    onSave({ name, subject, body });
    showToast('Template saved');
  }

  function handleReset(e) {
    e.stopPropagation();
    setName(template.name);
    setSubject(template.subject);
    setBody(template.body);
  }

  function handleBodyInput() {
    skipNextSyncRef.current = true;
    setBody(bodyRef.current.innerHTML);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 truncate">{template.name || 'Untitled template'}</div>
          <div className="text-xs text-slate-400 truncate mt-0.5">{template.subject || 'No subject'}</div>
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-6 pb-6 pt-1 space-y-4 border-t border-slate-100">
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
                <RichTextToolbar editorRef={bodyRef} onFormat={handleBodyInput} />
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
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-sm text-slate-400 hover:text-red-600"
              >
                Delete Template
              </button>
            )}
            <div className="flex gap-2 ml-auto">
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
      )}
    </div>
  );
}

export default function EmailTemplatesPage() {
  const { emailTemplates, addEmailTemplate, updateEmailTemplate, removeEmailTemplate } = useData();
  const { can } = useAuth();
  const canEdit = can('manageEmailTemplates');
  const { showToast } = useToast();
  const [expandedId, setExpandedId] = useState(null);
  const [templatePendingDelete, setTemplatePendingDelete] = useState(null);

  function handleAdd() {
    const record = addEmailTemplate({ name: 'New Template', subject: '', body: '' });
    if (record) setExpandedId(record.id);
  }

  function confirmDelete() {
    const id = templatePendingDelete.id;
    removeEmailTemplate(id);
    setExpandedId((cur) => (cur === id ? null : cur));
    setTemplatePendingDelete(null);
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
          <div className="space-y-3">
            {emailTemplates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                expanded={expandedId === t.id}
                onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
                onSave={(patch) => updateEmailTemplate(t.id, patch)}
                onDelete={() => setTemplatePendingDelete(t)}
                canEdit={canEdit}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!templatePendingDelete}
        onClose={() => setTemplatePendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete template?"
        description={`This will permanently delete "${templatePendingDelete?.name || 'this template'}". This can't be undone.`}
      />
    </div>
  );
}
