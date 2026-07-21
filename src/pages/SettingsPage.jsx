import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/ui/Toast';
import ColorPicker from '../components/ui/ColorPicker';
import Badge from '../components/ui/Badge';
import UsersTab from './settings/UsersTab';
import { resizeImageToDataUrl } from '../lib/resizeImage';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

export default function SettingsPage() {
  const { role } = useAuth();
  const isAdminOrOwner = role === 'owner' || role === 'admin';
  const TABS = [
    { id: 'user', label: 'User Info' },
    { id: 'business', label: 'Business Info' },
    { id: 'fields', label: 'Custom Fields' },
    ...(isAdminOrOwner ? [{ id: 'users', label: 'Users' }] : []),
  ];
  const [tab, setTab] = useState('user');

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-800 mb-4">Settings</h2>
      <div className="flex border-b border-slate-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${
              tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'user' && <UserInfoTab />}
      {tab === 'business' && <BusinessInfoTab />}
      {tab === 'fields' && <CustomFieldsTab />}
      {tab === 'users' && isAdminOrOwner && <UsersTab />}
    </div>
  );
}

function UserInfoTab() {
  const { currentUser, updateCurrentUser, changePassword } = useAuth();
  const { showToast } = useToast();
  const [firstName, setFirstName] = useState(currentUser.firstName);
  const [lastName, setLastName] = useState(currentUser.lastName);
  const [phone, setPhone] = useState(currentUser.phone);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');

  function handleSaveProfile(e) {
    e.preventDefault();
    updateCurrentUser({ firstName, lastName, phone });
    showToast('Profile updated');
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError('');
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 4) {
      setPwError('New password is too short.');
      return;
    }
    const result = await changePassword({ currentPassword, newPassword });
    if (!result.ok) {
      setPwError(result.error);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    showToast('Password updated');
  }

  return (
    <div className="max-w-lg space-y-8">
      <form onSubmit={handleSaveProfile} className="space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Profile</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>First Name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Last Name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={currentUser.email} disabled className={`${inputClass} bg-slate-50 text-slate-400 cursor-not-allowed`} />
          <p className="mt-1 text-xs text-slate-400">Email can't be changed yet.</p>
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
          Save Profile
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="space-y-3 pt-6 border-t border-slate-100">
        <h3 className="text-sm font-bold text-slate-700">Change Password</h3>
        {pwError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{pwError}</div>}
        <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />
        <input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
        <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
        <button type="submit" className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Update Password
        </button>
      </form>
    </div>
  );
}

function BusinessInfoTab() {
  const { currentUser, updateCurrentUser, can } = useAuth();
  const canEdit = can('manageSettings');
  const { showToast } = useToast();
  const [form, setForm] = useState({ accentColor: '#6366f1', ...currentUser.businessInfo });
  const [resizingLogo, setResizingLogo] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    updateCurrentUser({ businessInfo: form });
    showToast('Business info saved');
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setResizingLogo(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 200);
      setForm((f) => ({ ...f, logo: dataUrl }));
    } catch (err) {
      showToast(err.message || 'Failed to load that image', 'error');
    } finally {
      setResizingLogo(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-3">
      <div>
        <label className={labelClass}>Company Logo</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
            {form.logo ? (
              <img src={form.logo} alt="Company logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-slate-300 text-center px-1">Your Logo Here</span>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-1.5">
              <label className="w-fit px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 text-xs font-semibold hover:bg-indigo-50 cursor-pointer">
                {resizingLogo ? 'Processing…' : form.logo ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/*" onChange={handleLogoChange} disabled={resizingLogo} className="hidden" />
              </label>
              {form.logo && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, logo: '' }))}
                  className="text-xs text-slate-400 hover:text-red-600 text-left"
                >
                  Remove logo
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">Displays next to the GigWorks logo in the header.</p>
      </div>
      <div>
        <label className={labelClass}>Business Name</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Business Address</label>
        <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Business Phone</label>
        <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Business Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Contract Accent Color</label>
        <ColorPicker value={form.accentColor} onChange={(c) => setForm((f) => ({ ...f, accentColor: c }))} />
        <p className="mt-1 text-xs text-slate-400">Used for separators and headings on every proposal and contract PDF.</p>
      </div>
      <button type="submit" disabled={!canEdit} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
        Save Business Info
      </button>
    </form>
  );
}

function CustomFieldsTab() {
  const { can } = useAuth();
  const canEdit = can('manageSettings');
  const {
    eventStatuses, addEventStatus, updateEventStatus, removeEventStatus,
  } = useData();
  return (
    <div className="space-y-10 max-w-2xl">
      <SimpleListField title="Categories" canEdit={canEdit} />
      <EventTypeListField canEdit={canEdit} />
      <ColorStatusListField
        title="Event Statuses"
        canEdit={canEdit}
        items={eventStatuses}
        onAdd={addEventStatus}
        onUpdate={updateEventStatus}
        onRemove={removeEventStatus}
        placeholder="New event status"
      />
      <InquiryStatusListField canEdit={canEdit} />
      <BookingStatusListField canEdit={canEdit} />
    </div>
  );
}

function SimpleListField({ title, canEdit }) {
  const { contractorTypes, addContractorType, removeContractorType } = useData();
  const [value, setValue] = useState('');

  function handleAdd(e) {
    e.preventDefault();
    if (!value.trim()) return;
    addContractorType(value);
    setValue('');
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-2">{title}</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {contractorTypes.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
            {t}
            {canEdit && (
              <button type="button" onClick={() => removeContractorType(t)} className="text-slate-400 hover:text-red-600 px-1" aria-label={`Remove ${t}`}>✕</button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={handleAdd} className="flex gap-2 max-w-sm">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="New category" className={inputClass} />
          <button type="submit" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Add</button>
        </form>
      )}
    </div>
  );
}

function EventTypeListField({ canEdit }) {
  const { eventTypes, addEventType, removeEventType } = useData();
  const [value, setValue] = useState('');

  function handleAdd(e) {
    e.preventDefault();
    if (!value.trim()) return;
    addEventType(value);
    setValue('');
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-2">Event Types</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {eventTypes.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
            {t}
            {canEdit && (
              <button type="button" onClick={() => removeEventType(t)} className="text-slate-400 hover:text-red-600 px-1" aria-label={`Remove ${t}`}>✕</button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={handleAdd} className="flex gap-2 max-w-sm">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="New event type" className={inputClass} />
          <button type="submit" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">Add</button>
        </form>
      )}
    </div>
  );
}

function ColorStatusListField({ title, canEdit, items, onAdd, onUpdate, onRemove, placeholder }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#6366f1');

  function handleAdd(e) {
    e.preventDefault();
    if (!label.trim()) return;
    onAdd({ label: label.trim(), color });
    setLabel('');
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-2">{title}</h3>
      <div className="space-y-2 mb-3">
        {items.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
            <Badge color={s.color}>{s.label}</Badge>
            <div className="flex-1">
              <ColorPicker value={s.color} onChange={(c) => onUpdate(s.id, { color: c })} />
            </div>
            {canEdit && (
              <button type="button" onClick={() => onRemove(s.id)} className="text-slate-400 hover:text-red-600 px-1" aria-label={`Remove ${s.label}`}>✕</button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 max-w-sm">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} className={inputClass} />
          <ColorPicker value={color} onChange={setColor} />
          <button type="submit" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 self-start">Add Status</button>
        </form>
      )}
    </div>
  );
}

function InquiryStatusListField({ canEdit }) {
  const { inquiryStatuses, addInquiryStatus, updateInquiryStatus, removeInquiryStatus } = useData();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isConfirmed, setIsConfirmed] = useState(false);

  function handleAdd(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addInquiryStatus({ label: label.trim(), color, isConfirmed });
    setLabel('');
    setIsConfirmed(false);
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-1">Contractor "Inquiry Status"</h3>
      <p className="text-xs text-slate-400 mb-2">
        Tracks the response after a contractor is contacted about a gig. Statuses marked "counts as confirmed" mark an event's vendor status Confirmed once every contractor on it reaches one.
      </p>
      <div className="space-y-2 mb-3">
        {inquiryStatuses.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
            <Badge color={s.color}>{s.label}</Badge>
            <div className="flex-1">
              <ColorPicker value={s.color} onChange={(c) => updateInquiryStatus(s.id, { color: c })} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <input type="checkbox" checked={!!s.isConfirmed} onChange={(e) => updateInquiryStatus(s.id, { isConfirmed: e.target.checked })} />
              Counts as confirmed
            </label>
            {canEdit && (
              <button type="button" onClick={() => removeInquiryStatus(s.id)} className="text-slate-400 hover:text-red-600 px-1" aria-label={`Remove ${s.label}`}>✕</button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 max-w-sm">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New inquiry status" className={inputClass} />
          <ColorPicker value={color} onChange={setColor} />
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={isConfirmed} onChange={(e) => setIsConfirmed(e.target.checked)} />
            Counts as confirmed
          </label>
          <button type="submit" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 self-start">Add Status</button>
        </form>
      )}
    </div>
  );
}

function BookingStatusListField({ canEdit }) {
  const { bookingStatuses, addBookingStatus, updateBookingStatus, removeBookingStatus } = useData();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isBooked, setIsBooked] = useState(false);

  function handleAdd(e) {
    e.preventDefault();
    if (!label.trim()) return;
    addBookingStatus({ label: label.trim(), color, isBooked });
    setLabel('');
    setIsBooked(false);
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-1">Booking Statuses</h3>
      <p className="text-xs text-slate-400 mb-2">
        Tracks a booking through the sales pipeline. Statuses marked "unlocks convert to event" make the "Convert to Event" action available on a booking.
      </p>
      <div className="space-y-2 mb-3">
        {bookingStatuses.map((s) => (
          <div key={s.id} className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2">
            <Badge color={s.color}>{s.label}</Badge>
            <div className="flex-1">
              <ColorPicker value={s.color} onChange={(c) => updateBookingStatus(s.id, { color: c })} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap">
              <input type="checkbox" checked={!!s.isBooked} onChange={(e) => updateBookingStatus(s.id, { isBooked: e.target.checked })} />
              Unlocks convert to event
            </label>
            {canEdit && (
              <button type="button" onClick={() => removeBookingStatus(s.id)} className="text-slate-400 hover:text-red-600 px-1" aria-label={`Remove ${s.label}`}>✕</button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 max-w-sm">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New booking status" className={inputClass} />
          <ColorPicker value={color} onChange={setColor} />
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={isBooked} onChange={(e) => setIsBooked(e.target.checked)} />
            Unlocks convert to event
          </label>
          <button type="submit" className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 self-start">Add Status</button>
        </form>
      )}
    </div>
  );
}
