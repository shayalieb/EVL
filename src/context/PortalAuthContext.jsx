import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from './AuthContext';

// Deliberately separate from AuthContext/DataContext — those assume a
// business User principal (req.session.userId, req.membership.accountId)
// throughout; a portal Client is a different kind of session entirely (see
// server/src/routes/portal.js and its own cookie, portal.sid, scoped to
// /api/portal — server/src/index.js). apiFetch itself is safe to share:
// it's just a fetch wrapper with credentials: 'include', so the browser
// attaches whichever cookie matches the request path automatically.
const PortalAuthContext = createContext(null);

export function PortalAuthProvider({ children }) {
  const [client, setClient] = useState(null);
  const [businessInfo, setBusinessInfo] = useState(null);
  const [portalLoading, setPortalLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/portal/me');
      setClient(data.client);
      setBusinessInfo(data.businessInfo);
    } catch {
      setClient(null);
      setBusinessInfo(null);
    } finally {
      setPortalLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const requestLink = useCallback(async (email) => {
    await apiFetch('/portal/request-link', { method: 'POST', body: JSON.stringify({ email }) });
  }, []);

  const verify = useCallback(async (token) => {
    await apiFetch(`/portal/verify?token=${encodeURIComponent(token)}`);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiFetch('/portal/logout', { method: 'POST' });
    setClient(null);
    setBusinessInfo(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ client, businessInfo, portalLoading, requestLink, verify, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}
