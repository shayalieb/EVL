import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { listAgencyGroups } from '../lib/agencyGroups';

const AgencyGroupContext = createContext(null);
const SCOPED_PATHS = new Set(['/home', '/bookings', '/bookings/new', '/events', '/events/new', '/financials']);

export function AgencyGroupProvider({ children }) {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAgency = currentUser?.planTier === 'agency';
  const storageKey = `gigworks.agencyGroup.${currentUser?.accountId || 'account'}`;
  const requestedGroupId = new URLSearchParams(location.search).get('groupId') || '';
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupIdState] = useState('');
  const [loading, setLoading] = useState(isAgency);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isAgency) {
      setGroups([]);
      setSelectedGroupIdState('');
      setLoading(false);
      setInitialized(true);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    listAgencyGroups()
      .then((items) => {
        if (cancelled) return;
        const active = items.filter((group) => group.active);
        const stored = window.localStorage.getItem(storageKey) || '';
        const initial = new URLSearchParams(window.location.search).get('groupId') || stored;
        const valid = active.some((group) => group.id === initial) ? initial : '';
        setGroups(active);
        setSelectedGroupIdState(valid);
        if (valid) window.localStorage.setItem(storageKey, valid);
        else window.localStorage.removeItem(storageKey);
        if (valid && !new URLSearchParams(window.location.search).has('groupId') && SCOPED_PATHS.has(window.location.pathname)) {
          const params = new URLSearchParams(window.location.search);
          params.set('groupId', valid);
          navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); setInitialized(true); }
      });
    return () => { cancelled = true; };
  }, [isAgency, navigate, storageKey]);

  useEffect(() => {
    if (!isAgency || loading || !initialized || !SCOPED_PATHS.has(location.pathname)) return;
    if (requestedGroupId && groups.some((group) => group.id === requestedGroupId)) {
      setSelectedGroupIdState(requestedGroupId);
      window.localStorage.setItem(storageKey, requestedGroupId);
    } else if (!requestedGroupId) {
      setSelectedGroupIdState('');
      window.localStorage.removeItem(storageKey);
    }
  }, [groups, initialized, isAgency, loading, location.pathname, requestedGroupId, storageKey]);

  const pathFor = useCallback((path, groupId = selectedGroupId) => {
    if (!isAgency || !SCOPED_PATHS.has(path) || !groupId) return path;
    return `${path}?groupId=${encodeURIComponent(groupId)}`;
  }, [isAgency, selectedGroupId]);

  const setSelectedGroupId = useCallback((groupId) => {
    const validId = groups.some((group) => group.id === groupId) ? groupId : '';
    setSelectedGroupIdState(validId);
    if (validId) window.localStorage.setItem(storageKey, validId);
    else window.localStorage.removeItem(storageKey);
    if (SCOPED_PATHS.has(location.pathname)) {
      const params = new URLSearchParams(location.search);
      if (validId) params.set('groupId', validId);
      else params.delete('groupId');
      const search = params.toString();
      navigate(`${location.pathname}${search ? `?${search}` : ''}`, { replace: true });
    }
  }, [groups, location.pathname, location.search, navigate, storageKey]);

  const value = useMemo(() => ({
    groups,
    isAgency,
    loading,
    selectedGroupId,
    selectedGroup: groups.find((group) => group.id === selectedGroupId) || null,
    setSelectedGroupId,
    pathFor,
  }), [groups, isAgency, loading, pathFor, selectedGroupId, setSelectedGroupId]);

  return <AgencyGroupContext.Provider value={value}>{children}</AgencyGroupContext.Provider>;
}

export function useAgencyGroup() {
  const context = useContext(AgencyGroupContext);
  if (!context) throw new Error('useAgencyGroup must be used inside AgencyGroupProvider.');
  return context;
}
