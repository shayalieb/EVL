import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listAgencyGroups } from '../lib/agencyGroups';

export default function AgencyGroupSelect({ value, onChange, className = '' }) {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (currentUser?.planTier !== 'agency') return;
    listAgencyGroups().then((items) => setGroups(items.filter((item) => item.active))).catch(() => {});
  }, [currentUser?.planTier]);
  if (currentUser?.planTier !== 'agency') return null;
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-500 mb-1">Managed Group *</label>
      <select required value={value || ''} onChange={(event) => onChange(event.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
        <option value="">Select a group…</option>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select>
      <p className="mt-1 text-xs text-slate-400">Clients, venues, contractors, and search remain shared across the agency.</p>
    </div>
  );
}
