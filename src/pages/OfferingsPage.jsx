import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import OfferingModal from '../components/OfferingModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { computeOfferingTotal } from '../lib/offerings';
import { formatCurrency as currency } from '../lib/format';

export default function OfferingsPage() {
  const { offerings, deleteOffering } = useData();
  const { can } = useAuth();
  const canEdit = can('manageOfferings');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffering, setEditingOffering] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  function openAdd() {
    setEditingOffering(null);
    setModalOpen(true);
  }

  function openEdit(offering) {
    setEditingOffering(offering);
    setModalOpen(true);
  }

  function handleDelete() {
    deleteOffering(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Offerings</h2>
          <p className="text-sm text-slate-500 mt-1">Reusable products or services you can add to any proposal or contract.</p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={!canEdit}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add Offering
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offerings.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    No offerings yet. Add one to reuse it across proposals and contracts.
                  </td>
                </tr>
              )}
              {offerings.map((o) => (
                <tr key={o.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {canEdit ? (
                      <button type="button" onClick={() => openEdit(o)} className="hover:text-indigo-600 hover:underline text-left">
                        {o.name}
                      </button>
                    ) : (
                      <span>{o.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{o.type === 'perUnit' ? 'Per Unit' : 'General'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{currency(computeOfferingTotal(o))}</td>
                  <td className="px-4 py-3">
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(o)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          aria-label={`Edit ${o.name}`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(o)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${o.name}`}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <OfferingModal open={modalOpen} onClose={() => setModalOpen(false)} offering={editingOffering} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete offering?"
        description={`This will remove "${deleteTarget?.name}" from your reusable offerings. Copies already added to proposals or contracts are unaffected.`}
      />
    </div>
  );
}
