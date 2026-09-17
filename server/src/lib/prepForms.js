export function normalizePrepFormSubmission(body = {}) {
  const submitterName = String(body.submitterName || '').trim().slice(0, 160);
  const items = Array.isArray(body.items) ? body.items.slice(0, 30).map((item) => ({
    name: String(item?.name || '').trim().slice(0, 200),
    details: String(item?.details || '').trim().slice(0, 2000),
    link: String(item?.link || '').trim().slice(0, 2048),
  })).filter((item) => item.name || item.details || item.link) : [];
  const notes = String(body.notes || '').trim().slice(0, 5000);
  if (!submitterName) return { error: 'Your name is required.' };
  if (!items.length && !notes) return { error: 'Add at least one request or note.' };
  if (items.some((item) => item.link && !/^https?:\/\//i.test(item.link))) return { error: 'Reference links must begin with http:// or https://.' };
  return { submitterName, items, notes };
}

export function preserveClientPrepRequests(incoming, stored) {
  if (!Array.isArray(incoming)) return incoming;
  const incomingIds = new Set(incoming.map((item) => item?.id));
  const missingClientRows = (Array.isArray(stored) ? stored : []).filter((item) => item?.source === 'client_prep_form' && !incomingIds.has(item.id));
  return [...incoming, ...missingClientRows];
}
