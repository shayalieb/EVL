import { apiFetch } from '../context/AuthContext';

export function previewDataImport(sources) {
  return apiFetch('/imports/preview', { method: 'POST', body: JSON.stringify(sources) });
}

export function commitDataImport(sources, token, clientDecisions) {
  return apiFetch('/imports/commit', { method: 'POST', body: JSON.stringify({ ...sources, token, clientDecisions }) });
}
