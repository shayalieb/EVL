import { useEffect, useMemo, useState } from 'react';
import { listAgencyGroups } from './agencyGroups';

export function useAgencyBranding(groupId, accountBusinessInfo, enabled) {
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (!enabled) return;
    listAgencyGroups().then(setGroups).catch(() => {});
  }, [enabled]);
  return useMemo(() => {
    const group = enabled && groupId ? groups.find((item) => item.id === groupId) : null;
    if (!group) return accountBusinessInfo || {};
    const stationery = group.stationery || {};
    return { ...(accountBusinessInfo || {}), ...stationery, name: stationery.businessName || group.name, logo: group.logo || accountBusinessInfo?.logo || '' };
  }, [accountBusinessInfo, enabled, groupId, groups]);
}
