import { useEffect, useState } from 'react';
import ReminderModal from '../components/ReminderModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Badge from '../components/ui/Badge';
import SearchInput from '../components/ui/SearchInput';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';
import { fetchReminders, completeReminder, deleteReminder } from '../lib/reminders';
import { usePagination } from '../lib/usePagination';

const STATUS_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

export default function RemindersPage() {
  const { showToast } = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

  useEffect(() => {
    fetchReminders()
      .then(setReminders)
      .catch(() => showToast('Failed to load reminders', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const filteredReminders = reminders
    .filter((r) => (statusFilter === 'pending' ? !r.completedAt : !!r.completedAt))
    .filter((r) => matchesSearch(search, [r.note, r.relatedName]))
    .sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt));
  const { page, setPage, pageCount, pageItems: pagedReminders, pageSize, totalItems } = usePagination(filteredReminders);

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
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
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
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    {reminders.length === 0 ? 'No reminders yet. Add one to follow up with a client or contractor.' : 'No reminders match your search.'}
                  </td>
                </tr>
              )}
              {pagedReminders.map((r) => {
                const overdue = !r.completedAt && new Date(r.remindAt) <= new Date();
                return (
                  <tr key={r.id} data-testid="reminder-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className={`px-4 py-3 font-medium ${overdue ? 'text-red-600' : 'text-slate-800'}`}>
                      {new Date(r.remindAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-slate-500">
                      {r.relatedName ? <Badge color={r.relatedType === 'client' ? '#6366f1' : '#0ea5e9'}>{r.relatedName}</Badge> : '—'}
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
                      <div className="flex justify-end gap-1">
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
    </div>
  );
}
