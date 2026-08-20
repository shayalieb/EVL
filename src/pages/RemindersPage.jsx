import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReminderModal from '../components/ReminderModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import SearchInput from '../components/ui/SearchInput';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { fetchReminders, completeReminder, deleteReminder, updateReminder, relatedRecordPath } from '../lib/reminders';
import { usePagination } from '../lib/usePagination';

// event/invoice/booking reminders are rule-generated (see server/src/lib/
// reminderRuleEngine.js) — distinct colors from client/contractor so an
// auto-generated row reads differently from a manually-created one at a glance.
const RELATED_TYPE_COLORS = { client: '#6366f1', contractor: '#0ea5e9', event: '#d97706', invoice: '#e11d48', booking: '#8b5cf6' };

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
];

const SNOOZE_OPTIONS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '1 day', ms: 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
];

function RelatedBadge({ reminder }) {
  if (!reminder.relatedName) return '—';
  const badge = <Badge color={RELATED_TYPE_COLORS[reminder.relatedType] || '#0ea5e9'}>{reminder.relatedName}</Badge>;
  const path = relatedRecordPath(reminder);
  return path ? <Link to={path} className="hover:opacity-80">{badge}</Link> : badge;
}

export default function RemindersPage() {
  const { showToast } = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [snoozeMenuId, setSnoozeMenuId] = useState(null);

  function load(all) {
    setLoading(true);
    fetchReminders({ all })
      .then(setReminders)
      .catch(() => showToast('Failed to load reminders', 'error'))
      .finally(() => setLoading(false));
  }

  // Completed history is fetched bounded by default (see lib/reminders.js)
  // — re-fetched with the full, unbounded history only when the user
  // actually asks to see it, rather than paying that cost on every load.
  useEffect(() => {
    load(statusFilter === 'completed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter === 'completed']);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, search]);

  const filteredReminders = reminders
    .filter((r) => {
      if (statusFilter === 'completed') return !!r.completedAt;
      if (statusFilter === 'overdue') return !r.completedAt && new Date(r.remindAt) <= new Date();
      return !r.completedAt;
    })
    .filter((r) => matchesSearch(search, [r.note, r.relatedName]))
    .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
  const { page, setPage, pageCount, pageItems: pagedReminders, pageSize, totalItems } = usePagination(filteredReminders);

  const allOnPageSelected = pagedReminders.length > 0 && pagedReminders.every((r) => selectedIds.has(r.id));
  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pagedReminders.forEach((r) => next.delete(r.id));
      else pagedReminders.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAdd() {
    setEditingReminder(null);
    setModalOpen(true);
  }

  function openEdit(reminder) {
    setEditingReminder(reminder);
    setModalOpen(true);
  }

  function handleSaved(saved) {
    setReminders((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved];
    });
    showToast(editingReminder ? 'Reminder updated' : 'Reminder added');
  }

  async function handleToggleComplete(reminder) {
    const completed = !reminder.completedAt;
    try {
      const updated = await completeReminder(reminder.id, completed);
      setReminders((prev) => prev.map((r) => (r.id === reminder.id ? updated : r)));
      showToast(completed ? 'Reminder marked done' : 'Reminder reopened');
    } catch {
      showToast('Failed to update reminder', 'error');
    }
  }

  async function handleSnooze(reminder, ms) {
    setSnoozeMenuId(null);
    try {
      const remindAt = new Date(Date.now() + ms).toISOString();
      const updated = await updateReminder(reminder.id, { remindAt });
      setReminders((prev) => prev.map((r) => (r.id === reminder.id ? updated : r)));
      showToast('Reminder snoozed');
    } catch {
      showToast('Failed to snooze reminder', 'error');
    }
  }

  async function handleDelete() {
    try {
      await deleteReminder(deleteTarget.id);
      setReminders((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      showToast('Reminder deleted');
    } catch {
      showToast('Failed to delete reminder', 'error');
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleBulkComplete() {
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map((id) => completeReminder(id, true)));
    const updatedById = new Map();
    results.forEach((r, i) => { if (r.status === 'fulfilled') updatedById.set(ids[i], r.value); });
    setReminders((prev) => prev.map((r) => (updatedById.has(r.id) ? updatedById.get(r.id) : r)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    showToast(failed ? `Marked ${ids.length - failed} done, ${failed} failed` : `Marked ${ids.length} reminder${ids.length === 1 ? '' : 's'} done`, failed ? 'error' : 'success');
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const results = await Promise.allSettled(ids.map((id) => deleteReminder(id)));
    const failedIds = new Set(ids.filter((_, i) => results[i].status === 'rejected'));
    setReminders((prev) => prev.filter((r) => failedIds.has(r.id) || !ids.includes(r.id)));
    const failed = failedIds.size;
    showToast(failed ? `Deleted ${ids.length - failed}, ${failed} failed` : `Deleted ${ids.length} reminder${ids.length === 1 ? '' : 's'}`, failed ? 'error' : 'success');
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Reminders</h2>
        <button
          type="button"
          onClick={openAdd}
          data-testid="reminders-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
        >
          + Add Reminder
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search reminders by note or related name…" className="w-full sm:w-80" testId="reminders-search-input" />
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              data-testid={`reminders-filter-${f.value}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                statusFilter === f.value ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
            {statusFilter !== 'completed' && (
              <button
                type="button"
                onClick={handleBulkComplete}
                data-testid="reminders-bulk-complete-button"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Mark Done
              </button>
            )}
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              data-testid="reminders-bulk-delete-button"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="pl-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    data-testid="reminders-select-all-checkbox"
                    className="rounded border-slate-300"
                    aria-label="Select all on page"
                  />
                </th>
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="hidden sm:table-cell px-4 py-3">Related To</th>
                <th className="px-4 py-3">Note</th>
                <th className="hidden sm:table-cell px-4 py-3 text-center">Email</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredReminders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    {reminders.length === 0 ? 'No reminders yet. Add one to follow up with a client or contractor.' : 'No reminders match your search.'}
                  </td>
                </tr>
              )}
              {pagedReminders.map((r) => {
                const overdue = !r.completedAt && new Date(r.remindAt) <= new Date();
                return (
                  <tr key={r.id} data-testid="reminder-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="pl-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        data-testid="reminder-row-select-checkbox"
                        className="rounded border-slate-300"
                        aria-label="Select reminder"
                      />
                    </td>
                    <td className={`px-4 py-3 font-medium ${overdue ? 'text-red-600' : 'text-slate-800'}`}>
                      {new Date(r.remindAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-500">
                      <RelatedBadge reminder={r} />
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-sm">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        data-testid="reminder-row-note-link"
                        className="hover:text-indigo-600 hover:underline text-left"
                      >
                        {r.note}
                      </button>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-center">
                      {r.emailEnabled ? (
                        <span className="text-emerald-600" title={r.emailSentAt ? `Sent ${new Date(r.emailSentAt).toLocaleString()}` : 'Will be emailed'}>✉️</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 relative">
                        {!r.completedAt && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setSnoozeMenuId((id) => (id === r.id ? null : r.id))}
                              data-testid="reminder-row-snooze-button"
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50"
                            >
                              Snooze
                            </button>
                            {snoozeMenuId === r.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setSnoozeMenuId(null)} />
                                <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-slate-100 z-20 overflow-hidden">
                                  {SNOOZE_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.label}
                                      type="button"
                                      onClick={() => handleSnooze(r, opt.ms)}
                                      data-testid={`reminder-row-snooze-option-${opt.label.replace(' ', '-')}`}
                                      className="block w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                                    >
                                      +{opt.label}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(r)}
                          data-testid="reminder-row-complete-button"
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50"
                        >
                          {r.completedAt ? 'Reopen' : 'Mark Done'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          data-testid="reminder-row-edit-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label="Edit reminder"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(r)}
                          data-testid="reminder-row-delete-button"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label="Delete reminder"
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} testId="reminders-pagination" />
      </div>

      <ReminderModal open={modalOpen} onClose={() => setModalOpen(false)} reminder={editingReminder} onSaved={handleSaved} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete reminder?"
        description={`This permanently removes this reminder${deleteTarget?.emailEnabled && !deleteTarget?.emailSentAt ? ' and cancels its scheduled email' : ''}.`}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selectedIds.size} reminder${selectedIds.size === 1 ? '' : 's'}?`}
        description="This permanently removes the selected reminders and cancels any scheduled emails among them."
      />
    </div>
  );
}
