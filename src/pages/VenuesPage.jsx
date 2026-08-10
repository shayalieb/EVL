import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import VenueModal from '../components/VenueModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Tooltip from '../components/ui/Tooltip';
import SearchInput from '../components/ui/SearchInput';
import { useToast } from '../components/ui/Toast';
import { matchesSearch } from '../lib/search';

export default function VenuesPage() {
  const { venues, deleteVenue } = useData();
  const { can } = useAuth();
  const canEdit = can('manageVenues');
  const { showToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState('');

  const filteredVenues = venues.filter((v) => matchesSearch(search, [v.name, v.address1, v.city, v.state, v.contactName, v.contactPhone, v.contactEmail]));

  function openAdd() {
    setEditingVenue(null);
    setModalOpen(true);
  }

  function openEdit(venue) {
    setEditingVenue(venue);
    setModalOpen(true);
  }

  function handleDelete() {
    deleteVenue(deleteTarget.id);
    showToast('Venue deleted');
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Venues</h2>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          data-testid="venues-add-button"
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Venue
        </button>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        Venues you've used on a Booking or Event show up here automatically. Editing or deleting one only affects future selections — past bookings keep their own copy of the details.
      </p>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search venues by name, address, or contact…" className="w-full sm:w-80" testId="venues-search-input" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Venue Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3 text-center">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVenues.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    {venues.length === 0
                      ? 'No venues yet. Add one here, or it\'ll be saved automatically the first time you use it on a Booking or Event.'
                      : 'No venues match your search.'}
                  </td>
                </tr>
              )}
              {filteredVenues.map((v) => {
                const addressLine = [v.address1, v.city, v.state].filter(Boolean).join(', ');
                const contactPhoneLine = v.contactPhone ? `${v.contactPhone}${v.contactPhoneExt ? ` ext. ${v.contactPhoneExt}` : ''}` : '';
                const contactLine = [v.contactName, contactPhoneLine, v.contactEmail].filter(Boolean).join(' · ');
                return (
                  <tr key={v.id} data-testid="venue-row" className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => openEdit(v)}
                          data-testid="venue-row-name-link"
                          className="hover:text-indigo-600 hover:underline text-left"
                        >
                          {v.name}
                        </button>
                      ) : (
                        <span>{v.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{addressLine || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{contactLine || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {(v.locationNote || v.loadInInfo) ? (
                        <Tooltip content={[v.locationNote, v.loadInInfo].filter(Boolean).join(' — ')}>
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold cursor-default">
                            1
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(v)}
                            data-testid="venue-row-edit-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            aria-label="Edit venue"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(v)}
                            data-testid="venue-row-delete-button"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="Delete venue"
                          >
                            🗑
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <VenueModal open={modalOpen} onClose={() => setModalOpen(false)} venue={editingVenue} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete venue?"
        description={`This removes "${deleteTarget?.name}" from the picker on future bookings/events — it won't change any bookings or events that already used it.`}
      />
    </div>
  );
}
