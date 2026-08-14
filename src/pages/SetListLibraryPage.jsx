import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import SetListLibraryModal from '../components/SetListLibraryModal';
import SetListEmailModal from '../components/SetListEmailModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import Tooltip from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { formatEventDate } from '../lib/format';
import { deleteDocument } from '../lib/documents';
import { generateSetListPdf } from '../lib/setListPdf';
import { renderSetListEmail, sendSetListEmail } from '../lib/setList';

// Resources-section ListView for reusable set lists (band/orchestra only —
// gated at the nav item in AppLayout.jsx and the route in App.jsx). Editing
// one here never touches copies already pulled into a specific event — see
// SetListsEditorPage.jsx, which deep-clones on pull.
export default function SetListLibraryPage() {
  const { setListLibrary, deleteSetListLibraryItem, events, contractors } = useData();
  const { can, currentUser } = useAuth();
  const { showToast } = useToast();
  const canEdit = can('manageEvents');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSetList, setEditingSetList] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [emailTarget, setEmailTarget] = useState(null); // the setList currently open in SetListEmailModal
  const [sendingEmail, setSendingEmail] = useState(false);
  const [exportingId, setExportingId] = useState(null);

  const filteredSetLists = setListLibrary.filter((s) => matchesSearch(search, [s.name]));

  function openAdd() {
    setEditingSetList(null);
    setModalOpen(true);
  }

  function openEdit(setList) {
    setEditingSetList(setList);
    setModalOpen(true);
  }

  function handleDelete() {
    // Songs' PDFs don't cascade-delete on their own — clean them up here so
    // deleting a whole set list doesn't orphan its attachments in storage.
    deleteTarget.items?.forEach((item) => {
      if (item.documentId) deleteDocument(item.documentId).catch(() => {});
    });
    deleteSetListLibraryItem(deleteTarget.id);
    setDeleteTarget(null);
  }

  function linkedEventFor(setList) {
    return setList.eventId ? events.find((e) => e.id === setList.eventId) || null : null;
  }

  // Whoever's booked on the linked event, same pool SetListsEditorPage.jsx
  // draws from — there's no recipient pool at all for a set list that isn't
  // linked to an event yet, which is why Email stays disabled until then.
  function bandMembersFor(linkedEvent) {
    return (linkedEvent?.contractorBookings || [])
      .map((b) => contractors.find((c) => c.id === b.contractorId))
      .filter((c) => c?.email);
  }

  async function handleExportPdf(setList) {
    setExportingId(setList.id);
    try {
      const linkedEvent = linkedEventFor(setList);
      await generateSetListPdf({
        eventName: linkedEvent?.name || setList.name,
        eventDate: linkedEvent?.eventDate,
        setLists: [setList],
        businessInfo: currentUser?.businessInfo,
      });
    } catch (err) {
      showToast(err.message || 'Failed to export PDF', 'error');
    } finally {
      setExportingId(null);
    }
  }

  async function handleSendEmail({ subject, body, recipientIds }) {
    const setList = emailTarget;
    const linkedEvent = linkedEventFor(setList);
    setSendingEmail(true);
    try {
      const fromName = currentUser.businessInfo?.name || `${currentUser.firstName} ${currentUser.lastName}`;
      const { successCount, total } = await sendSetListEmail({
        eventId: linkedEvent.id, eventName: linkedEvent.name, eventDate: linkedEvent.eventDate, setList,
        recipientIds, contractors, subject, body, fromName, businessInfo: currentUser?.businessInfo,
      });
      if (successCount === total) {
        showToast(`Sent to ${successCount} band member${successCount === 1 ? '' : 's'}`);
      } else {
        showToast(`Sent ${successCount} of ${total} emails — some failed`, 'error');
      }
      setEmailTarget(null);
    } catch (err) {
      showToast(err.message || 'Failed to send set list email', 'error');
    } finally {
      setSendingEmail(false);
    }
  }

  const emailLinkedEvent = emailTarget ? linkedEventFor(emailTarget) : null;
  const emailDraft = emailTarget && emailLinkedEvent
    ? renderSetListEmail(emailLinkedEvent.name, emailLinkedEvent.eventDate, emailTarget, currentUser?.businessInfo)
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Set Lists</h2>
          <p className="text-sm text-slate-500 mt-1">Reusable set lists you can pull into any gig without rebuilding them from scratch.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          data-testid="setlist-library-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Set List
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search set lists…" className="w-64" testId="setlist-library-search-input" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Linked Event</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSetLists.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    {setListLibrary.length === 0
                      ? 'No set lists yet. Add one to reuse it across gigs.'
                      : 'No set lists match your search.'}
                  </td>
                </tr>
              )}
              {filteredSetLists.map((s) => {
                const linkedEvent = linkedEventFor(s);
                const bandMembers = bandMembersFor(linkedEvent);
                const emailDisabledReason = !linkedEvent
                  ? 'Link this set list to an event to email it'
                  : bandMembers.length === 0
                    ? 'No band members with an email are booked on the linked event yet'
                    : null;
                return (
                  <tr key={s.id} data-testid="setlist-library-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button type="button" onClick={() => openEdit(s)} data-testid="setlist-library-row-name-link" className="hover:text-indigo-600 hover:underline text-left">
                          {s.name}
                        </button>
                      ) : (
                        <span>{s.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-md truncate">{s.description || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {linkedEvent ? (
                        <span data-testid="setlist-library-row-linked-event">
                          {linkedEvent.name || '(untitled event)'}
                          {linkedEvent.eventDate && <span className="text-slate-400"> — {formatEventDate(linkedEvent.eventDate)}</span>}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleExportPdf(s)}
                          disabled={exportingId === s.id}
                          data-testid="setlist-library-row-export-pdf-button"
                          className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          {exportingId === s.id ? 'Exporting…' : 'Download PDF'}
                        </button>
                        {emailDisabledReason ? (
                          <Tooltip content={emailDisabledReason}>
                            <span className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 whitespace-nowrap cursor-default">
                              Email
                            </span>
                          </Tooltip>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEmailTarget(s)}
                            data-testid="setlist-library-row-email-button"
                            className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                          >
                            Email
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              data-testid="setlist-library-row-edit-button"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                              aria-label={`Edit ${s.name}`}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(s)}
                              data-testid="setlist-library-row-delete-button"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                              aria-label={`Delete ${s.name}`}
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SetListLibraryModal open={modalOpen} onClose={() => setModalOpen(false)} setList={editingSetList} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete set list?"
        description={`This removes "${deleteTarget?.name}" from your reusable set lists. Copies already pulled into a gig are unaffected.`}
      />
      <SetListEmailModal
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        bandMembers={emailLinkedEvent ? bandMembersFor(emailLinkedEvent) : []}
        initialSubject={emailDraft?.subject}
        initialBody={emailDraft?.body}
        sending={sendingEmail}
        onConfirm={handleSendEmail}
      />
    </div>
  );
}
