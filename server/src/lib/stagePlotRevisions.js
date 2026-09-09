const CHANNEL_FIELDS = ['channelNumber', 'source', 'musicianName', 'phantomPower', 'powerNeeded', 'monitorNotes', 'elementId', 'inputType', 'preferredDevice', 'substituteDevice', 'standType', 'connectionType', 'channelFormat', 'stageboxName', 'stageboxInput', 'providedBy', 'monitorMix', 'powerDetails', 'cableDetails'];

export function stagePlotContentUpdatedAt(plot) {
  return [plot.updatedAt, ...(plot.pages || []).map((item) => item.updatedAt), ...(plot.channels || []).map((item) => item.updatedAt), ...(plot.backlineItems || []).map((item) => item.updatedAt)]
    .reduce((latest, value) => new Date(value) > new Date(latest) ? value : latest);
}

export function buildStagePlotSnapshot(plot, event = null) {
  const venue = event?.venue && typeof event.venue === 'object' ? event.venue : {};
  return {
    name: plot.name,
    event: event ? { name: event.name, eventType: event.eventType, eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime, venue: { name: venue.name || null, address1: venue.address1 || null, address2: venue.address2 || null, city: venue.city || null, state: venue.state || null, zip: venue.zip || null } } : null,
    pages: (plot.pages || []).slice().sort((a, b) => a.order - b.order).map((page) => ({ order: page.order, name: page.name, scene: page.scene, thumbnailStorageKey: page.thumbnailStorageKey })),
    channels: (plot.channels || []).slice().sort((a, b) => a.channelNumber - b.channelNumber).map((channel) => Object.fromEntries(CHANNEL_FIELDS.map((field) => [field, channel[field] ?? null]))),
    backlineItems: (plot.backlineItems || []).map((item) => ({ item: item.item, quantity: item.quantity, providedBy: item.providedBy, notesHtml: item.notesHtml })),
  };
}

export function summarizeStagePlotRevision(snapshot, previous = null) {
  const counts = { pages: snapshot.pages.length, channels: snapshot.channels.length, backlineItems: snapshot.backlineItems.length };
  if (!previous) return { counts, changedSections: ['Stage plot', 'Production List', 'Backline'] };
  const changedSections = [];
  if (JSON.stringify(snapshot.pages) !== JSON.stringify(previous.pages)) changedSections.push('Stage plot');
  if (JSON.stringify(snapshot.channels) !== JSON.stringify(previous.channels)) changedSections.push('Production List');
  if (JSON.stringify(snapshot.backlineItems) !== JSON.stringify(previous.backlineItems)) changedSections.push('Backline');
  if (JSON.stringify(snapshot.event) !== JSON.stringify(previous.event)) changedSections.push('Event details');
  return {
    counts,
    changedSections,
    countChanges: {
      pages: counts.pages - previous.pages.length,
      channels: counts.channels - previous.channels.length,
      backlineItems: counts.backlineItems - previous.backlineItems.length,
    },
  };
}
