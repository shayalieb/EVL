import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { ChevronDownIcon } from '../../components/ui/icons';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import SectionsEditor from '../../components/SectionsEditor';

const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

// Shared row for both Proposal and Contract templates — same shape except
// contract templates also carry a `title` (what shows on the document
// itself, separate from `name`, this row's label in the list below).
function DocumentTemplateRow({ template, expanded, onToggleExpand, onSave, onDelete, canEdit, hasTitle }) {
  const { showToast } = useToast();
  const [name, setName] = useState(template.name);
  const [title, setTitle] = useState(template.title || '');
  const [sections, setSections] = useState(template.sections || []);

  useEffect(() => {
    setName(template.name);
    setTitle(template.title || '');
    setSections(template.sections || []);
  }, [template]);

  const dirty = name !== template.name
    || (hasTitle && title !== (template.title || ''))
    || JSON.stringify(sections) !== JSON.stringify(template.sections || []);

  function handleSave(e) {
    e.stopPropagation();
    onSave({ name, ...(hasTitle ? { title } : {}), sections });
    showToast('Template saved');
  }

  function handleReset(e) {
    e.stopPropagation();
    setName(template.name);
    setTitle(template.title || '');
    setSections(template.sections || []);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpand}
        data-testid="document-template-row-toggle-button"
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 truncate">{template.name || 'Untitled template'}</div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {(template.sections || []).length} section{(template.sections || []).length === 1 ? '' : 's'}
          </div>
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-6 pb-6 pt-1 space-y-4 border-t border-slate-100">
          <div>
            <label className={labelClass}>Template Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="document-template-row-name-input" className={inputClass} />
          </div>
          {hasTitle && (
            <div>
              <label className={labelClass}>Contract Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="document-template-row-title-input" className={inputClass} />
            </div>
          )}
          <SectionsEditor sections={sections} onChange={setSections} />

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {canEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                data-testid="document-template-row-delete-button"
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
                  data-testid="document-template-row-reset-button"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || !canEdit}
                data-testid="document-template-row-save-button"
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

function TemplateSection({ title, description, templates, hasTitle, canEdit, onAdd, onSave, onDelete, expandedId, onToggleExpand, addTestId }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-bold text-slate-800">{title}</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canEdit}
          data-testid={addTestId}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + New Template
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      {templates.length === 0 ? (
        <div className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg px-3 py-8 text-center">
          No {title.toLowerCase()} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <DocumentTemplateRow
              key={t.id}
              template={t}
              hasTitle={hasTitle}
              expanded={expandedId === t.id}
              onToggleExpand={() => onToggleExpand(t.id)}
              onSave={(patch) => onSave(t.id, patch)}
              onDelete={() => onDelete(t)}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TemplatesTab() {
  const { currentUser, can } = useAuth();
  const {
    proposalTemplates, addProposalTemplate, updateProposalTemplate, removeProposalTemplate,
    contractTemplates, addContractTemplate, updateContractTemplate, removeContractTemplate,
  } = useData();
  // Proposal/contract templates feed the same composers BookingFormPage.jsx
  // gates on manageBookings, not manageEmailTemplates (that's specifically
  // for contractor-outreach email content, a different capability).
  const canEdit = can('manageBookings');
  const [expandedProposalId, setExpandedProposalId] = useState(null);
  const [expandedContractId, setExpandedContractId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { kind: 'proposal' | 'contract', template }
  const migratedRef = useRef(false);

  // One-time opt-in migration — carries forward whatever was in the old
  // single silently-auto-cached currentUser.contractTemplate/proposalTemplate
  // (see BookingFormPage.jsx) into a real named template the first time this
  // tab loads, so existing customization isn't silently lost when that old
  // mechanism is retired. Only runs if there's actual content to carry over
  // and no named templates exist yet — never overwrites/duplicates.
  useEffect(() => {
    if (migratedRef.current || !currentUser) return;
    migratedRef.current = true;
    if (contractTemplates.length === 0 && currentUser.contractTemplate?.sections?.length > 0) {
      addContractTemplate({
        name: 'Default',
        title: currentUser.contractTemplate.title || 'Event Contract',
        sections: currentUser.contractTemplate.sections,
      });
    }
    if (proposalTemplates.length === 0 && currentUser.proposalTemplate?.sections?.length > 0) {
      addProposalTemplate({ name: 'Default', sections: currentUser.proposalTemplate.sections });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  function confirmDelete() {
    const { kind, template } = pendingDelete;
    if (kind === 'proposal') {
      removeProposalTemplate(template.id);
      setExpandedProposalId((cur) => (cur === template.id ? null : cur));
    } else {
      removeContractTemplate(template.id);
      setExpandedContractId((cur) => (cur === template.id ? null : cur));
    }
    setPendingDelete(null);
  }

  return (
    <div className="max-w-3xl space-y-10">
      <TemplateSection
        title="Proposal Templates"
        description="Saved sets of custom sections you can load into a new proposal instead of starting from scratch."
        templates={proposalTemplates}
        hasTitle={false}
        canEdit={canEdit}
        addTestId="settings-templates-add-proposal-button"
        onAdd={() => {
          const record = addProposalTemplate({ name: 'New Template' });
          if (record) setExpandedProposalId(record.id);
        }}
        onSave={(id, patch) => updateProposalTemplate(id, patch)}
        onDelete={(template) => setPendingDelete({ kind: 'proposal', template })}
        expandedId={expandedProposalId}
        onToggleExpand={(id) => setExpandedProposalId((cur) => (cur === id ? null : id))}
      />

      <TemplateSection
        title="Contract Templates"
        description="Saved titles and sections you can load into a new contract instead of starting from scratch."
        templates={contractTemplates}
        hasTitle
        canEdit={canEdit}
        addTestId="settings-templates-add-contract-button"
        onAdd={() => {
          const record = addContractTemplate({ name: 'New Template' });
          if (record) setExpandedContractId(record.id);
        }}
        onSave={(id, patch) => updateContractTemplate(id, patch)}
        onDelete={(template) => setPendingDelete({ kind: 'contract', template })}
        expandedId={expandedContractId}
        onToggleExpand={(id) => setExpandedContractId((cur) => (cur === id ? null : id))}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete template?"
        description={`This will permanently delete "${pendingDelete?.template?.name || 'this template'}". This can't be undone.`}
      />
    </div>
  );
}
