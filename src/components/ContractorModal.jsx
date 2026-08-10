import { useEffect, useState } from 'react';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import CurrencyInput from './ui/CurrencyInput';
import { useData } from '../context/DataContext';
import { uid } from '../lib/storage';
import { getPricingTiers } from '../lib/pricingTiers';
import { getContractorCalendarLink, regenerateContractorCalendarLink, updateContractorCalendarLinkVisibility, emailContractorCalendarLink } from '../lib/contractors';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function emptyPricingTiers() {
  return [{ id: uid('tier'), name: 'Standard', price: '' }];
}

const emptyForm = {
  firstName: '', middleName: '', lastName: '',
  contractorType1: '', contractorType2: '',
  pricingTiers: emptyPricingTiers(),
  priceNotes: '',
};

export default function ContractorModal({ open, onClose, contractor }) {
  const { contractorTypes, addContractorType, addContractor, updateContractor } = useData();
  const [form, setForm] = useState(emptyForm);
  const [addingType, setAddingType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [error, setError] = useState('');
  const [tierPendingDelete, setTierPendingDelete] = useState(null);
  const [calendarLink, setCalendarLink] = useState('');
  const [calendarLinkCopied, setCalendarLinkCopied] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(true);
  const [showTentative, setShowTentative] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(contractor ? {
        firstName: contractor.firstName,
        middleName: contractor.middleName || '',
        lastName: contractor.lastName,
        contractorType1: contractor.contractorType1,
        contractorType2: contractor.contractorType2 || '',
        pricingTiers: getPricingTiers(contractor).map((t) => ({ ...t, id: t.id === 'legacy' ? uid('tier') : t.id, price: String(t.price) })),
        priceNotes: contractor.priceNotes || '',
        email: contractor.email || '',
        phone: contractor.phone || '',
      } : { ...emptyForm, pricingTiers: emptyPricingTiers(), email: '', phone: '' });
      setError('');
      setAddingType(false);
      setNewTypeLabel('');
      setTierPendingDelete(null);
      setCalendarLink('');
      setCalendarLinkCopied(false);
      setShowConfirmed(true);
      setShowTentative(true);
      setEmailSending(false);
      setEmailSent(false);
      // Get-or-create eagerly (unlike a lazy fetch-on-copy) since the
      // visibility checkboxes below need real state to reflect the moment
      // the modal opens, not just once someone's clicked Copy/Email first.
      if (contractor) {
        getContractorCalendarLink(contractor.id)
          .then((d) => {
            setCalendarLink(d.calendarLink);
            setShowConfirmed(d.showConfirmed);
            setShowTentative(d.showTentative);
          })
          .catch(() => {}); // non-critical — Copy/Email below still work via their own fallback fetch
      }
    }
  }, [open, contractor]);

  async function handleCopyCalendarLink() {
    try {
      const link = calendarLink || (await getContractorCalendarLink(contractor.id)).calendarLink;
      if (!calendarLink) setCalendarLink(link);
      await navigator.clipboard.writeText(link);
      setCalendarLinkCopied(true);
      setTimeout(() => setCalendarLinkCopied(false), 2000);
    } catch (err) {
      setError(err.message || 'Failed to copy gig calendar link.');
    }
  }

  async function handleRegenerateCalendarLink() {
    try {
      const d = await regenerateContractorCalendarLink(contractor.id);
      setCalendarLink(d.calendarLink);
      await navigator.clipboard.writeText(d.calendarLink);
      setCalendarLinkCopied(true);
      setTimeout(() => setCalendarLinkCopied(false), 2000);
    } catch (err) {
      setError(err.message || 'Failed to regenerate gig calendar link.');
    }
  }

  async function handleToggleVisibility(field, value) {
    const prevConfirmed = showConfirmed;
    const prevTentative = showTentative;
    if (field === 'showConfirmed') setShowConfirmed(value);
    else setShowTentative(value);
    try {
      await updateContractorCalendarLinkVisibility(contractor.id, {
        showConfirmed: field === 'showConfirmed' ? value : showConfirmed,
        showTentative: field === 'showTentative' ? value : showTentative,
      });
    } catch (err) {
      setShowConfirmed(prevConfirmed);
      setShowTentative(prevTentative);
      setError(err.message || 'Failed to update visibility.');
    }
  }

  async function handleEmailCalendarLink() {
    setEmailSending(true);
    try {
      const d = await emailContractorCalendarLink(contractor.id);
      setCalendarLink(d.calendarLink);
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 2000);
    } catch (err) {
      setError(err.message || 'Failed to email gig calendar link.');
    } finally {
      setEmailSending(false);
    }
  }

  function update(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function updateTier(id, patch) {
    setForm((f) => ({ ...f, pricingTiers: f.pricingTiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  function addTier() {
    setForm((f) => ({ ...f, pricingTiers: [...f.pricingTiers, { id: uid('tier'), name: '', price: '' }] }));
  }

  function confirmDeleteTier() {
    setForm((f) => ({ ...f, pricingTiers: f.pricingTiers.filter((t) => t.id !== tierPendingDelete) }));
    setTierPendingDelete(null);
  }

  function handleAddType() {
    if (!newTypeLabel.trim()) return;
    addContractorType(newTypeLabel);
    update('contractorType1', newTypeLabel.trim());
    setNewTypeLabel('');
    setAddingType(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.contractorType1) {
      setError('First name, last name, and category are required.');
      return;
    }
    const payload = {
      ...form,
      pricingTiers: form.pricingTiers.map((t) => ({ ...t, name: t.name.trim() || 'Standard', price: Number(t.price) || 0 })),
    };
    if (contractor) updateContractor(contractor.id, payload);
    else addContractor(payload);
    onClose();
  }

  return (
    <>
    <Modal open={open} onClose={onClose} title={contractor ? 'Edit Contractor' : 'Add Contractor'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div data-testid="contractor-modal-error-banner" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>First Name *</label>
            <input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} data-testid="contractor-modal-firstname-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Middle Name</label>
            <input value={form.middleName} onChange={(e) => update('middleName', e.target.value)} data-testid="contractor-modal-middlename-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last Name *</label>
            <input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} data-testid="contractor-modal-lastname-input" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Email Address</label>
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} data-testid="contractor-modal-email-input" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Phone Number</label>
            <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} data-testid="contractor-modal-phone-input" className={inputClass} />
          </div>
        </div>

        {contractor && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Gig calendar link</span> — a bookmarkable page showing this contractor their own gigs.
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCalendarLink}
                  data-testid="contractor-modal-copy-calendar-link-button"
                  className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50"
                >
                  {calendarLinkCopied ? 'Link Copied!' : 'Copy Link'}
                </button>
                <button
                  type="button"
                  onClick={handleEmailCalendarLink}
                  disabled={!form.email || emailSending}
                  title={!form.email ? 'Add an email address first' : 'Email this link to the contractor'}
                  data-testid="contractor-modal-email-calendar-link-button"
                  className="px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {emailSent ? 'Emailed!' : emailSending ? 'Sending…' : 'Email Link'}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateCalendarLink}
                  title="Invalidate the old link and copy a new one"
                  data-testid="contractor-modal-regenerate-calendar-link-button"
                  className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 text-xs"
                >
                  ↻
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-1.5 border-t border-slate-200/70">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Contractor can see</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={showConfirmed}
                  onChange={(e) => handleToggleVisibility('showConfirmed', e.target.checked)}
                  data-testid="contractor-modal-show-confirmed-checkbox"
                />
                Confirmed gigs
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={showTentative}
                  onChange={(e) => handleToggleVisibility('showTentative', e.target.checked)}
                  data-testid="contractor-modal-show-tentative-checkbox"
                />
                Pending gigs
              </label>
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Category *</label>
          {!addingType ? (
            <div className="flex gap-2">
              <select required value={form.contractorType1} onChange={(e) => update('contractorType1', e.target.value)} data-testid="contractor-modal-category-select" className={inputClass}>
                <option value="">Select a category…</option>
                {contractorTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" onClick={() => setAddingType(true)} data-testid="contractor-modal-add-category-button" className="shrink-0 px-3 py-2 rounded-lg border border-indigo-300 text-indigo-600 text-sm font-semibold hover:bg-indigo-50">
                + Add
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input autoFocus value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="New category" data-testid="contractor-modal-new-category-input" className={inputClass} />
              <button type="button" onClick={handleAddType} data-testid="contractor-modal-save-category-button" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                Save
              </button>
              <button type="button" onClick={() => setAddingType(false)} data-testid="contractor-modal-cancel-category-button" className="shrink-0 px-3 py-2 rounded-lg text-slate-500 text-sm">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Role <span className="font-normal text-slate-400">(optional — e.g. instrument)</span></label>
          <input value={form.contractorType2} onChange={(e) => update('contractorType2', e.target.value)} data-testid="contractor-modal-role-input" className={inputClass} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={`${labelClass} mb-0`}>Pricing Tiers</label>
            <button type="button" onClick={addTier} data-testid="contractor-modal-add-tier-button" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
              + Add Tier
            </button>
          </div>
          <div className="space-y-2">
            {form.pricingTiers.map((tier) => (
              <div key={tier.id} className="flex items-center gap-2">
                <input
                  value={tier.name}
                  onChange={(e) => updateTier(tier.id, { name: e.target.value })}
                  placeholder="e.g. Full Band"
                  data-testid="contractor-modal-tier-name-input"
                  className={`${inputClass} flex-1`}
                />
                <CurrencyInput value={tier.price} onChange={(v) => updateTier(tier.id, { price: v })} data-testid="contractor-modal-tier-price-input" className="w-28" />
                {form.pricingTiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTierPendingDelete(tier.id)}
                    data-testid="contractor-modal-tier-remove-button"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded text-slate-300 hover:text-red-600"
                    aria-label="Remove pricing tier"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>Price Notes</label>
          <textarea rows={2} value={form.priceNotes} onChange={(e) => update('priceNotes', e.target.value)} data-testid="contractor-modal-price-notes-textarea" className={inputClass} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} data-testid="contractor-modal-cancel-button" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="submit" data-testid="contractor-modal-save-button" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            {contractor ? 'Save Changes' : 'Add Contractor'}
          </button>
        </div>
      </form>
    </Modal>

    <ConfirmDialog
      open={!!tierPendingDelete}
      onClose={() => setTierPendingDelete(null)}
      onConfirm={confirmDeleteTier}
      title="Remove pricing tier?"
      description="This will remove this pricing tier from the contractor. This can't be undone."
    />
    </>
  );
}
