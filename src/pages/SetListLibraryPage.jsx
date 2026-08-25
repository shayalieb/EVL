import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import SetListLibraryModal from '../components/SetListLibraryModal';
import SetListEmailModal from '../components/SetListEmailModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';
import Tooltip from '../components/ui/Tooltip';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { formatEventDate } from '../lib/format';
import { deleteDocument } from '../lib/documents';
import { generateSetListPdf } from '../lib/setListPdf';
import { renderSetListEmail, sendSetListEmail } from '../lib/setList';
import { useContractorHydration } from '../lib/useContractorHydration';

// Resources-section ListView for reusable set lists (band/orchestra only —
// gated at the nav item in AppLayout.jsx and the route in App.jsx). Editing
// one here never touches copies already pulled into a specific event — see
// SetListsEditorPage.jsx, which deep-clones on pull.
export default function SetListLibraryPage() {
  const { setListLibrary, updateSetListLibraryItem, deleteSetListLibraryItem, events, loadEvent, contractors } = useData();
  const { can, currentUser } = useAuth();
  const { showToast } = useToast();
  const canEdit = can('manageEvents');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSetList, setEditingSetList] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [emailTarget, setEmailTarget] = useState(null); // { setList, event } currently open in SetListEmailModal
  const [sendingEmail, setSendingEmail] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  // { setList, action: 'email' | 'pdf' } — set when a set list is linked to
  // more than one event and the specific action needs to know which one to
  // act on (recipients + header name/date are always scoped to one event at
  // a time, never a blended "several events" view).
  const [chooseEventFor, setChooseEventFor] = useState(null);

  useEffect(() => {
    const ids = [...new Set(setListLibrary.flatMap((item) => item.eventIds || (item.eventId ? [item.eventId] : [])))];
    Promise.allSettled(ids.map(loadEvent));
  }, [setListLibrary, loadEvent]);

  useContractorHydration(events.flatMap((event) => (event.contractorBookings || []).map((booking) => booking.contractorId)));

  const filteredSetLists = setListLibrary.filter((s) => matchesSearch(search, [
    s.name,
    s.description,
    ...(s.items || []).flatMap((item) => [item.songTitle, item.description]),
  ]));

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

  // eventId (singular) is the pre-multi-link shape — a set list saved
  // before that change still resolves to its one existing link.
  function linkedEventsFor(setList) {
    const ids = setList.eventIds || (setList.eventId ? [setList.eventId] : []);
    return ids.map((id) => events.find((e) => e.id === id)).filter(Boolean);
  }

  function hasSongs(setList) {
    return (setList.items || []).some((it) => it.songTitle?.trim());
  }

  // Whoever's booked on the given event, same pool SetListsEditorPage.jsx
  // draws from.
  function allBookedFor(event) {
    return (event?.contractorBookings || [])
      .map((b) => contractors.find((c) => c.id === b.contractorId))
      .filter(Boolean);
  }
  function bandMembersFor(event) {
    return allBookedFor(event).filter((c) => c?.email);
  }

  async function handleExportPdf(setList, event) {
    setExportingId(setList.id);
    try {
      await generateSetListPdf({
        eventName: event?.name || setList.name,
        eventDate: event?.eventDate,
        setLists: [setList],
        businessInfo: currentUser?.businessInfo,
      });
    } catch (err) {
      showToast(err.message || 'Failed to export PDF', 'error');
    } finally {
      setExportingId(null);
    }
  }

  function startExportPdf(setList) {
    const linked = linkedEventsFor(setList);
    if (linked.length > 1) { setChooseEventFor({ setList, action: 'pdf' }); return; }
    handleExportPdf(setList, linked[0] || null);
  }

  function startEmail(setList) {
    const linked = linkedEventsFor(setList);
    if (linked.length > 1) { setChooseEventFor({ setList, action: 'email' }); return; }
    if (linked[0]) setEmailTarget({ setList, event: linked[0] });
  }

  function handleChooseEvent(event) {
    const { setList, action } = chooseEventFor;
    setChooseEventFor(null);
    if (action === 'email') setEmailTarget({ setList, event });
    else handleExportPdf(setList, event);
  }

  async function handleSendEmail({ subject, body, recipientIds }) {
    const { setList, event } = emailTarget;
    setSendingEmail(true);
    try {
      const fromName = currentUser.businessInfo?.name || `${currentUser.firstName} ${currentUser.lastName}`;
      const { successCount, total } = await sendSetListEmail({
        eventId: event.id, eventName: event.name, eventDate: event.eventDate, setList,
        recipientIds, contractors, subject, body, fromName, businessInfo: currentUser?.businessInfo,
      });
      if (successCount === total) {
        showToast(`Sent to ${successCount} band member${successCount === 1 ? '' : 's'}`);
      } else {
        showToast(`Sent ${successCount} of ${total} emails — some failed`, 'error');
      }
      updateSetListLibraryItem(setList.id, { lastSentAt: new Date().toISOString(), lastSentCount: successCount });
      setEmailTarget(null);
    } catch (err) {
      showToast(err.message || 'Failed to send set list email', 'error');
    } finally {
      setSendingEmail(false);
    }
  }

  const emailDraft = emailTarget
    ? renderSetListEmail(emailTarget.event.name, emailTarget.event.eventDate, emailTarget.setList, currentUser?.businessInfo)
    : null;
  const emailBandMembers = emailTarget ? bandMembersFor(emailTarget.event) : [];
  const emailExcludedCount = emailTarget ? allBookedFor(emailTarget.event).length - emailBandMembers.length : 0;
  const chooseEventOptions = chooseEventFor ? linkedEventsFor(chooseEventFor.setList) : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Set Lists</h2>
          <p className="text-sm text-slate-500 mt-1">Build reusable song collections once, then copy them into any event. Event copies stay independent from the library original.</p>
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
        <SearchInput value={search} onChange={setSearch} placeholder="Search lists, descriptions, or songs…" className="w-full sm:w-80" testId="setlist-library-search-input" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-center">Songs</th>
                <th className="px-4 py-3">Linked Events</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSetLists.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    {setListLibrary.length === 0 ? (
                      <div className="flex flex-col items-center gap-3">
                        <div>
                          <p className="font-semibold text-slate-600">Create your first reusable set list</p>
                          <p className="text-sm mt-1">Add songs, notes, links, and sheet music, then copy the finished list into any event.</p>
                        </div>
                        {canEdit && (
                          <button type="button" onClick={openAdd} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                            + Add Set List
                          </button>
                        )}
                      </div>
                    ) : 'No set lists match your search.'}
                  </td>
                </tr>
              )}
              {filteredSetLists.map((s) => {
                const linked = linkedEventsFor(s);
                const songsPresent = hasSongs(s);
                const pdfDisabledReason = !songsPresent ? 'Add at least one song before exporting a PDF' : null;
                const emailDisabledReason = !songsPresent
                  ? 'Add at least one song before emailing this set list'
                  : linked.length === 0
                    ? 'Link this set list to an event to email it'
                    : linked.length === 1 && bandMembersFor(linked[0]).length === 0
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
                    <td className="px-4 py-3 text-center text-slate-600">{(s.items || []).filter((item) => item.songTitle?.trim()).length}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {linked.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : linked.length === 1 ? (
                        <span data-testid="setlist-library-row-linked-event">
                          {linked[0].name || '(untitled event)'}
                          {linked[0].eventDate && <span className="text-slate-400"> — {formatEventDate(linked[0].eventDate)}</span>}
                        </span>
                      ) : (
                        <Tooltip content={
                          <div className="space-y-1">
                            {linked.map((e) => (
                              <div key={e.id}>{e.name || '(untitled event)'}{e.eventDate && ` — ${formatEventDate(e.eventDate)}`}</div>
                            ))}
                          </div>
                        }>
                          <span data-testid="setlist-library-row-linked-event" className="underline decoration-dotted cursor-default">
                            {linked.length} events
                          </span>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-1">
                        {pdfDisabledReason ? (
                          <Tooltip content={pdfDisabledReason}>
                            <span className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 whitespace-nowrap cursor-default">
                              Download PDF
                            </span>
                          </Tooltip>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startExportPdf(s)}
                            disabled={exportingId === s.id}
                            data-testid="setlist-library-row-export-pdf-button"
                            className="px-2 py-1 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
                          >
                            {exportingId === s.id ? 'Exporting…' : 'Download PDF'}
                          </button>
                        )}
                        {emailDisabledReason ? (
                          <Tooltip content={emailDisabledReason}>
                            <span className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 whitespace-nowrap cursor-default">
                              Email
                            </span>
                          </Tooltip>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEmail(s)}
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
                      {s.lastSentAt && (
                        <p data-testid="setlist-library-row-last-sent" className="text-[11px] text-slate-400 text-right mt-1">
                          Sent {formatEventDate(s.lastSentAt.slice(0, 10))} to {s.lastSentCount} band member{s.lastSentCount === 1 ? '' : 's'}
                        </p>
                      )}
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
      <Modal open={!!chooseEventFor} onClose={() => setChooseEventFor(null)} title="Which event is this for?">
        <div className="space-y-1.5">
          {chooseEventOptions.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => handleChooseEvent(e)}
              data-testid="setlist-library-choose-event-option"
              className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 flex items-center justify-between"
            >
              <span className="font-medium text-slate-700">{e.name || '(untitled event)'}</span>
              {e.eventDate && <span className="text-xs text-slate-400 shrink-0 ml-2">{formatEventDate(e.eventDate)}</span>}
            </button>
          ))}
        </div>
      </Modal>
      <SetListEmailModal
        open={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        bandMembers={emailBandMembers}
        excludedCount={emailExcludedCount}
        initialSubject={emailDraft?.subject}
        initialBody={emailDraft?.body}
        sending={sendingEmail}
        onConfirm={handleSendEmail}
      />
    </div>
  );
}
